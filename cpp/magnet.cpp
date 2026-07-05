// magnet.cpp — a Lorentz-force playground: charged particles in a uniform B
// field (perpendicular to the screen) plus an optional in-plane E field.
// Freestanding C++ compiled to bare wasm32 (no libc, no stdlib), same
// toolchain as charges.cpp and bench.cpp. TypeScript owns the canvas and the
// trails; C++ owns the only physics that matters here:
//
//   Lorentz force  F = q (E + v × B),  with B = B·ẑ  =>
//                  ax = q (Ex + vy·B)
//                  ay = q (Ey − vx·B)          (m = |q| = 1 for everyone)
//   integration    semi-implicit Euler, 8 substeps per step() call
//
// No damping — a magnetic force does no work, and the semi-implicit velocity
// update is a det-1 shear pair, so pure-B orbits neither spiral in nor blow
// up. E can pump energy in, so speed is capped; field strengths are clamped;
// every input is NaN-guarded; walls wrap (it's a torus). A visitor mashing
// buttons cannot break this.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/magnet.bin cpp/magnet.cpp

#define EXPORT(name) __attribute__((export_name(name)))

static const int MAX = 64;
static const double XMAX = 1.6;   // field space is [0,XMAX] x [0,1], y up
static const double YMAX = 1.0;
static const double VCAP = 3.0;   // speed cap (field units / s)
static const double BCAP = 12.0;  // |B| clamp
static const double ECAP = 8.0;   // |Ex|, |Ey| clamp
static const int NSUB = 8;        // substeps per step() call

static double gx[MAX], gy[MAX], gvx[MAX], gvy[MAX], gq[MAX];
static int n = 0;
static int slot = 0;              // once full, recycle the oldest slot
static double B = 4.0, Ex = 0.0, Ey = 0.0;

static inline double clampd(double v, double lo, double hi) {
  if (v != v) return 0.0;         // NaN in, calm zero out
  return v < lo ? lo : (v > hi ? hi : v);
}

static inline double wrapd(double v, double m) {
  v -= m * __builtin_floor(v / m);
  if (!(v >= 0.0 && v < m)) v = 0.0; // seam + NaN paranoia
  return v;
}

static inline void cap_speed(int i) {
  double s2 = gvx[i] * gvx[i] + gvy[i] * gvy[i];
  if (s2 > VCAP * VCAP) {
    double k = VCAP / __builtin_sqrt(s2);
    gvx[i] *= k;
    gvy[i] *= k;
  }
}

extern "C" EXPORT("set_fields") void set_fields(double b, double ex, double ey) {
  B = clampd(b, -BCAP, BCAP);
  Ex = clampd(ex, -ECAP, ECAP);
  Ey = clampd(ey, -ECAP, ECAP);
}

// returns the slot index used (TS resets that slot's trail), or -1 on garbage
extern "C" EXPORT("add_particle")
int add_particle(double x, double y, double ivx, double ivy, double qq) {
  if (x != x || y != y || ivx != ivx || ivy != ivy) return -1;
  int i;
  if (n < MAX) i = n++;
  else { i = slot; slot = (slot + 1) % MAX; } // full house: recycle the oldest
  gx[i] = wrapd(x, XMAX);
  gy[i] = wrapd(y, YMAX);
  gvx[i] = clampd(ivx, -VCAP, VCAP);
  gvy[i] = clampd(ivy, -VCAP, VCAP);
  cap_speed(i);
  gq[i] = (qq >= 0.0) ? 1.0 : -1.0; // same |q| for everyone; the sign is the brush
  return i;
}

extern "C" EXPORT("clear_all") void clear_all() { n = 0; slot = 0; }

extern "C" EXPORT("count") int count() { return n; }

extern "C" EXPORT("px")  double get_px(int i)  { return (i >= 0 && i < n) ? gx[i]  : 0; }
extern "C" EXPORT("py")  double get_py(int i)  { return (i >= 0 && i < n) ? gy[i]  : 0; }
extern "C" EXPORT("pq")  double get_pq(int i)  { return (i >= 0 && i < n) ? gq[i]  : 0; }
extern "C" EXPORT("pvx") double get_pvx(int i) { return (i >= 0 && i < n) ? gvx[i] : 0; }
extern "C" EXPORT("pvy") double get_pvy(int i) { return (i >= 0 && i < n) ? gvy[i] : 0; }

extern "C" EXPORT("step") void step(double dt) {
  if (!(dt > 0.0)) return;        // rejects NaN, zero, negative in one test
  if (dt > 0.05) dt = 0.05;       // a backgrounded tab is not a time machine
  double h = dt / NSUB;
  for (int s = 0; s < NSUB; s++) {
    for (int i = 0; i < n; i++) {
      double q = gq[i];
      // semi-implicit: vx from the old vy, then vy from the NEW vx. The pair
      // is an area-preserving shear composition — the discrete orbit of a
      // pure v×B force is a closed loop, not a slow spiral. That's the trick.
      gvx[i] += h * q * (Ex + gvy[i] * B);
      gvy[i] += h * q * (Ey - gvx[i] * B);
      cap_speed(i);
      gx[i] = wrapd(gx[i] + h * gvx[i], XMAX);
      gy[i] = wrapd(gy[i] + h * gvy[i], YMAX);
    }
  }
}
