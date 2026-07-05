// charges.cpp — an electrodynamics sandbox engine, freestanding C++ compiled to
// bare wasm32 (no libc, no stdlib), same toolchain as bench.cpp and the Rust
// map engine. TypeScript owns the canvas; C++ owns the physics and the math:
//
//   Coulomb force   F = k q_i q_j (r_i - r_j) / |r_i - r_j|^3
//   E field         E(p) = k Σ q_j (p - p_j) / |p - p_j|^3
//   scalar potential V(p) = k Σ q_j / |p - p_j|
//   integration     semi-implicit Euler with softening + damping (60 Hz)
//
// Distances are softened (|r|^2 + EPS2) so nothing blows up at r -> 0, velocity
// is clamped, and walls bounce, so the sim is unconditionally stable.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/charges.bin cpp/charges.cpp

#define EXPORT(name) __attribute__((export_name(name)))

static const int MAX = 96;
static const double XMAX = 1.6;      // field space is [0,XMAX] x [0,1]
static const double K = 0.02;        // Coulomb constant (tuned for feel)
static const double EPS2 = 0.02;     // softening: kills the 1/r^2 singularity
static const double DAMP = 0.985;    // velocity damping per tick
static const double VMAX = 0.03;     // speed clamp per tick (stability)
static const double REST = 0.6;      // wall restitution
static const double RMIN = 0.13;     // charges can't get closer than this...
static const double CORE = 16.0;     // ...a short-range core repulsion enforces it

static double px[MAX], py[MAX], vx[MAX], vy[MAX], q[MAX];
static int pinned[MAX];
static int n = 0;

static inline double rsqrt3(double r2) {
  // 1 / r^3 from r^2, using the one transcendental wasm actually has
  double r = __builtin_sqrt(r2);
  return 1.0 / (r2 * r);
}

// hand-rolled trig for the Gauss line integral (freestanding wasm: no libm)
static const double PI_G = 3.141592653589793;
static const double TWO_PI_G = 6.283185307179586;
static const double HALF_PI_G = 1.5707963267948966;
static double gsin(double x) {
  double k = __builtin_floor(x / TWO_PI_G + 0.5);
  x = x - k * TWO_PI_G;
  if (x > HALF_PI_G) x = PI_G - x;
  else if (x < -HALF_PI_G) x = -PI_G - x;
  double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}
static double gcos(double x) { return gsin(x + HALF_PI_G); }

extern "C" EXPORT("add_charge") void add_charge(double x, double y, double qq) {
  if (n >= MAX) return;
  px[n] = x; py[n] = y; vx[n] = 0; vy[n] = 0; q[n] = qq; pinned[n] = 0;
  n++;
}

extern "C" EXPORT("clear_all") void clear_all() { n = 0; }

extern "C" EXPORT("count") int count() { return n; }

extern "C" EXPORT("cx") double cx(int i) { return (i >= 0 && i < n) ? px[i] : 0; }
extern "C" EXPORT("cy") double cy(int i) { return (i >= 0 && i < n) ? py[i] : 0; }
extern "C" EXPORT("cq") double cq(int i) { return (i >= 0 && i < n) ? q[i] : 0; }

extern "C" EXPORT("pin") void pin(int i, double x, double y) {
  if (i < 0 || i >= n) return;
  px[i] = x; py[i] = y; vx[i] = 0; vy[i] = 0; pinned[i] = 1;
}
extern "C" EXPORT("unpin") void unpin(int i, double ivx, double ivy) {
  if (i < 0 || i >= n) return;
  vx[i] = ivx; vy[i] = ivy; pinned[i] = 0;
}

extern "C" EXPORT("step") void step() {
  double ax[MAX], ay[MAX];
  for (int i = 0; i < n; i++) {
    double fx = 0, fy = 0;
    for (int j = 0; j < n; j++) {
      if (j == i) continue;
      double dx = px[i] - px[j];
      double dy = py[i] - py[j];
      double d2 = dx * dx + dy * dy;
      double r2 = d2 + EPS2;
      double f = K * q[i] * q[j] * rsqrt3(r2); // Coulomb: like repel, opposite attract
      fx += f * dx;
      fy += f * dy;
      // short-range core repulsion so opposite charges can't collapse into
      // an overlapping blob — they settle into a neat pair instead
      double d = __builtin_sqrt(d2);
      if (d < RMIN && d > 1e-9) {
        double push = CORE * (RMIN - d) / d;
        fx += push * dx;
        fy += push * dy;
      }
    }
    ax[i] = fx;
    ay[i] = fy;
  }
  for (int i = 0; i < n; i++) {
    if (pinned[i]) continue;
    vx[i] = (vx[i] + ax[i]) * DAMP;
    vy[i] = (vy[i] + ay[i]) * DAMP;
    double sp2 = vx[i] * vx[i] + vy[i] * vy[i];
    if (sp2 > VMAX * VMAX) {
      double s = VMAX / __builtin_sqrt(sp2);
      vx[i] *= s;
      vy[i] *= s;
    }
    px[i] += vx[i];
    py[i] += vy[i];
    if (px[i] < 0) { px[i] = 0; vx[i] = -vx[i] * REST; }
    else if (px[i] > XMAX) { px[i] = XMAX; vx[i] = -vx[i] * REST; }
    if (py[i] < 0) { py[i] = 0; vy[i] = -vy[i] * REST; }
    else if (py[i] > 1.0) { py[i] = 1.0; vy[i] = -vy[i] * REST; }
  }
}

// E field x-component at a point (for the field-vector overlay)
extern "C" EXPORT("field_x") double field_x(double x, double y) {
  double ex = 0;
  for (int j = 0; j < n; j++) {
    double dx = x - px[j], dy = y - py[j];
    double r2 = dx * dx + dy * dy + EPS2;
    ex += K * q[j] * dx * rsqrt3(r2);
  }
  return ex;
}
extern "C" EXPORT("field_y") double field_y(double x, double y) {
  double ey = 0;
  for (int j = 0; j < n; j++) {
    double dx = x - px[j], dy = y - py[j];
    double r2 = dx * dx + dy * dy + EPS2;
    ey += K * q[j] * dy * rsqrt3(r2);
  }
  return ey;
}

// scalar potential V at a point (for the heatmap): V = k Σ q_j / |p - p_j|
extern "C" EXPORT("potential") double potential(double x, double y) {
  double v = 0;
  for (int j = 0; j < n; j++) {
    double dx = x - px[j], dy = y - py[j];
    double r2 = dx * dx + dy * dy + EPS2;
    v += K * q[j] / __builtin_sqrt(r2);
  }
  return v;
}

// ---- Gauss's law, live ----
// In a 2D world charges are line charges: E ∝ 1/r, and the flux through a
// closed curve is exactly 2πK·(enclosed charge) — Gauss's law you can drag.
// The line integral below is computed numerically so the ✓ is earned, not
// asserted: it converges to the analytic value as the sample count grows.

// numeric flux: ∮ E·n̂ dl around a circle at (gx,gy) with radius gr
extern "C" EXPORT("gauss_flux") double gauss_flux(double gx, double gy, double gr) {
  const int S = 96;
  double flux = 0.0;
  for (int s = 0; s < S; s++) {
    double ang = (TWO_PI_G * s) / S;
    double nx = gcos(ang), ny = gsin(ang);
    double x = gx + gr * nx, y = gy + gr * ny;
    double ex = 0, ey = 0;
    for (int j = 0; j < n; j++) {
      double dx = x - px[j], dy = y - py[j];
      double r2 = dx * dx + dy * dy + 1e-6;
      double inv = K * q[j] / r2; // 2D kernel: E = K q r̂ / r
      ex += inv * dx;
      ey += inv * dy;
    }
    flux += (ex * nx + ey * ny) * (TWO_PI_G * gr / S);
  }
  return flux;
}

// what Gauss's law says the flux must be: 2πK × (net charge strictly inside)
extern "C" EXPORT("gauss_pred") double gauss_pred(double gx, double gy, double gr) {
  double qin = 0.0;
  for (int j = 0; j < n; j++) {
    double dx = px[j] - gx, dy = py[j] - gy;
    if (dx * dx + dy * dy < gr * gr) qin += q[j];
  }
  return TWO_PI_G * K * qin;
}

extern "C" EXPORT("q_enclosed") double q_enclosed(double gx, double gy, double gr) {
  double qin = 0.0;
  for (int j = 0; j < n; j++) {
    double dx = px[j] - gx, dy = py[j] - gy;
    if (dx * dx + dy * dy < gr * gr) qin += q[j];
  }
  return qin;
}

// a starting scene so the sandbox isn't empty: a dipole plus two like charges
extern "C" EXPORT("demo") void demo() {
  n = 0;
  add_charge(0.55, 0.5, 1.0);
  add_charge(1.05, 0.5, -1.0);
  add_charge(0.3, 0.25, 1.0);
  add_charge(1.3, 0.78, -1.0);
}
