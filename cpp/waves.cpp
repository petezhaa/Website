// waves.cpp — a 1D FDTD electromagnetic wave lab, freestanding C++ compiled to
// bare wasm32 (no libc, no libm), same toolchain as charges.cpp and bench.cpp.
// TypeScript owns the canvas; C++ owns Maxwell:
//
//   Faraday   dHy/dt = -(1/mu)  * dEz/dx   ->  Hy[i] += S * (Ez[i+1] - Ez[i])
//   Ampere    dEz/dt = -(1/eps) * dHy/dx   ->  Ez[i] += S/eps[i] * (Hy[i] - Hy[i-1])
//
// leapfrogged on a staggered Yee grid (Ez on nodes, Hy on the links between)
// with Courant number S = c*dt/dx = 0.5, which is stable in 1D for any eps >= 1.
// First-order Mur absorbing boundaries at both ends so waves leave instead of
// bouncing; a soft source near the left (single gaussian pulse, or a ramped CW
// sinusoid); a dielectric slab where waves slow to c/n and partially reflect,
// exactly as Fresnel says they should. Inputs are NaN-proof-clamped and fields
// are scrubbed every step — a visitor mashing buttons cannot blow this up.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/waves.bin cpp/waves.cpp

#define EXPORT(name) __attribute__((export_name(name)))

static const int N = 600;        // Ez nodes; Hy lives on the N-1 links between
static const int SRC = 50;       // soft source sits here
static const int SLAB_A = 320;   // dielectric slab occupies cells [SLAB_A, SLAB_B)
static const int SLAB_B = 440;
static const int SUBSTEPS = 6;   // leapfrog substeps per step() call
static const double S = 0.5;     // Courant number c*dt/dx
static const double MUR = -1.0 / 3.0; // (S-1)/(S+1) at S=0.5; grid ends are vacuum
static const double FMAX = 4.0;  // hard field clamp — last-resort stability

static const double PI = 3.141592653589793;
static const double TWO_PI = 6.283185307179586;
static const double HALF_PI = 1.5707963267948966;

static double Ez[N];       // electric field (what you see filled in accent)
static double Hy[N];       // magnetic field (the fainter gold line)
static double invEps[N];   // 1 / eps_r per cell (1 outside the slab)

static double t = 0;       // time, counted in steps
static int mode = 0;       // 0 = pulse, 1 = CW
static double omega = 0;   // CW phase advance per step
static double sigma = 20;  // gaussian width, in steps
static double pulseT0 = 70; // gaussian center, in steps
static double cwPhase = 0; // accumulated CW phase (wrapped, so it never degrades)
static double cwRamp = 0;  // smooth turn-on so CW doesn't ring on start

// sin, range-reduced to [-pi/2, pi/2], then a Taylor series to x^9
// (freestanding wasm has no libm; this is the bench.cpp recipe)
static double hsin(double x) {
  double k = __builtin_floor(x / TWO_PI + 0.5);
  x = x - k * TWO_PI;
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

// e^x for x <= 0 (for the gaussian): split into 2^k * e^f, poly for the rest
static double hexp(double x) {
  if (x >= 0.0) return 1.0;   // only ever called with x <= 0
  if (x < -40.0) return 0.0;
  double y = x * 1.4426950408889634;        // log2(e): e^x = 2^y
  double k = __builtin_floor(y);
  double f = (y - k) * 0.6931471805599453;  // fractional part, back in nats
  double p = 1.0 + f * (1.0 + f * (0.5 + f * (1.0 / 6.0 + f * (1.0 / 24.0 +
             f * (1.0 / 120.0 + f * (1.0 / 720.0))))));
  double s = 1.0;
  int ki = (int)k;                          // ki in [-58, -1]
  while (ki < 0) { s *= 0.5; ki++; }
  return s * p;
}

// NaN scrub + clamp: NaN -> 0, +-inf and big values -> +-FMAX
static inline double sane(double v) {
  if (v != v) return 0.0;
  if (v > FMAX) return FMAX;
  if (v < -FMAX) return -FMAX;
  return v;
}

extern "C" EXPORT("set_freq") void set_freq(double lambda) {
  if (!(lambda >= 16.0)) lambda = 16.0;  // !(x>=lo) also catches NaN
  if (lambda > 240.0) lambda = 240.0;
  omega = TWO_PI * S / lambda;  // per-step phase; vacuum wavelength = lambda cells
  sigma = lambda / 3.0;         // the pulse width tracks the slider too
  if (sigma < 8.0) sigma = 8.0;
  if (sigma > 90.0) sigma = 90.0;
}

extern "C" EXPORT("set_eps") void set_eps(double er) {
  if (!(er >= 1.0)) er = 1.0;
  if (er > 8.0) er = 8.0;
  for (int i = 0; i < N; i++)
    invEps[i] = (i >= SLAB_A && i < SLAB_B) ? 1.0 / er : 1.0;
}

extern "C" EXPORT("fire_pulse") void fire_pulse() {
  mode = 0;
  pulseT0 = t + 3.5 * sigma;  // rises smoothly out of ~zero, no click
}

extern "C" EXPORT("set_mode") void set_mode(int m) {
  if (m == 1) {
    if (mode != 1) { mode = 1; cwRamp = 0.0; }
  } else {
    fire_pulse();  // selecting pulse (again) fires one
  }
}

extern "C" EXPORT("reset") void reset(int m, double lambda, double er) {
  for (int i = 0; i < N; i++) { Ez[i] = 0.0; Hy[i] = 0.0; }
  t = 0.0; cwPhase = 0.0; cwRamp = 0.0;
  set_freq(lambda);
  set_eps(er);
  mode = (m == 1) ? 1 : 0;
  pulseT0 = 3.5 * sigma;
}

static double source() {
  if (mode == 1) {
    cwPhase += omega;
    if (cwPhase > TWO_PI) cwPhase -= TWO_PI;
    if (cwRamp < 1.0) { cwRamp += 0.0125; if (cwRamp > 1.0) cwRamp = 1.0; }
    return cwRamp * hsin(cwPhase);
  }
  double u = (t - pulseT0) / sigma;
  if (u < -6.0 || u > 6.0) return 0.0;
  return hexp(-0.5 * u * u);
}

extern "C" EXPORT("step") void step() {
  for (int k = 0; k < SUBSTEPS; k++) {
    // Faraday half of the leapfrog: H advances from the curl of E
    for (int i = 0; i < N - 1; i++)
      Hy[i] += S * (Ez[i + 1] - Ez[i]);
    // remember the old boundary neighbors for Mur
    double e0 = Ez[0], e1 = Ez[1], e2 = Ez[N - 2], e3 = Ez[N - 1];
    // Ampere half: E advances from the curl of H, slowed inside the slab
    for (int i = 1; i < N - 1; i++)
      Ez[i] += S * invEps[i] * (Hy[i] - Hy[i - 1]);
    t += 1.0;
    Ez[SRC] += source();  // soft source: reflections pass right through it
    // first-order Mur absorbing boundaries: the box pretends to be infinite
    Ez[0]     = e1 + MUR * (Ez[1] - e0);
    Ez[N - 1] = e2 + MUR * (Ez[N - 2] - e3);
  }
  // scrub once per call so nothing weird ever reaches the canvas
  for (int i = 0; i < N; i++) { Ez[i] = sane(Ez[i]); Hy[i] = sane(Hy[i]); }
}

// pluck the field: drop a little spatial gaussian into Ez at a cell.
// it immediately splits into two waves running opposite ways, as it must.
extern "C" EXPORT("poke") void poke(int cell, double amp) {
  if (!(amp > -2.0 && amp < 2.0)) return;  // NaN/garbage guard
  if (cell < 0) cell = 0;
  if (cell >= N) cell = N - 1;
  for (int j = -21; j <= 21; j++) {
    int i = cell + j;
    if (i < 1 || i > N - 2) continue;
    double u = (double)j / 7.0;
    Ez[i] = sane(Ez[i] + amp * hexp(-0.5 * u * u));
  }
}

extern "C" EXPORT("ez_ptr") int ez_ptr() { return (int)(unsigned long)&Ez[0]; }
extern "C" EXPORT("hy_ptr") int hy_ptr() { return (int)(unsigned long)&Hy[0]; }
extern "C" EXPORT("n_cells") int n_cells() { return N; }
extern "C" EXPORT("slab_start") int slab_start() { return SLAB_A; }
extern "C" EXPORT("slab_end") int slab_end() { return SLAB_B; }
extern "C" EXPORT("src_pos") int src_pos() { return SRC; }
