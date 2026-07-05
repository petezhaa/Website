// filter.cpp — the analog filter design game, freestanding C++ -> wasm32
// (no libc, no libm), same toolchain as bench.cpp / waves.cpp.
//
// Each level is a signal (a sum of sinusoids) plus a spec sheet ("pass 1 kHz
// at >= -3 dB", "kill 60 Hz at <= -20 dB"). The player picks a topology and
// turns log-scaled R, L, C; this file answers with the exact analytic
// frequency response — no ODE is ever integrated:
//
//   RC low-pass    H = 1/(1 + jwRC)      |H| = 1/sqrt(1+(wRC)^2)
//   CR high-pass   H = jwRC/(1 + jwRC)   |H| = wRC/sqrt(1+(wRC)^2)
//   RLC band-pass  H = R/(R + jX)        |H| = R/sqrt(R^2 + X^2)   (out across R)
//   RLC notch      H = jX/(R + jX)       |H| = |X|/sqrt(R^2 + X^2) (out across LC)
//   with X = wL - 1/(wC), the series reactance.
//
// dB needs log10 and freestanding wasm has none, so: reduce x = m * 2^k with
// m in [1,2), then ln m = 2*artanh((m-1)/(m+1)) summed through the t^11 term
// (|t| <= 1/3, so the truncation error is < 1e-7 — invisible at 20*log10),
// and log10(x) = (k*ln2 + ln m)/ln10. The log-f sweep grid dodges pow()
// entirely: it is built multiplicatively from the precomputed constant
// 10^(1/50), 50 points per decade over 10 Hz..100 kHz, endpoint pinned.
// atan for phase is the bench.cpp minimax polynomial; sqrt is the one math
// instruction wasm actually has. Every input is NaN-proofed and clamped, so
// slider mashing cannot blow this up.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/filter.bin cpp/filter.cpp

#define EXPORT(n) __attribute__((export_name(n)))

static const double PI      = 3.141592653589793;
static const double TWO_PI  = 6.283185307179586;
static const double HALF_PI = 1.5707963267948966;
static const double LN2     = 0.6931471805599453;
static const double INV_LN10 = 0.4342944819032518; // 1/ln(10)

// ---------- hand-rolled math (freestanding wasm has no libm) ----------

// sin, range-reduced to [-pi/2, pi/2], then a Taylor series to x^9
static double hsin(double x) {
  double k = __builtin_floor(x / TWO_PI + 0.5);
  x = x - k * TWO_PI;
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

// atan on [0, inf) via a minimax poly on [0,1] plus the 1/t identity
static double hatan(double t) {
  bool inv = t > 1.0;
  if (inv) t = 1.0 / t;
  double t2 = t * t;
  double r = t * (0.9998660 + t2 * (-0.3302995 + t2 * (0.1801410 +
             t2 * (-0.0851330 + t2 * 0.0208351))));
  return inv ? HALF_PI - r : r;
}
static double satan(double t) { return t < 0.0 ? -hatan(-t) : hatan(t); } // signed

// log10 via ln: x = m * 2^k, m in [1,2); ln m from the artanh series
static double hlog10(double x) {
  if (!(x > 0.0)) return -400.0;      // NaN or <= 0: floor it hard
  int k = 0;
  while (x >= 2.0 && k <  1100) { x *= 0.5; k++; }
  while (x <  1.0 && k > -1100) { x *= 2.0; k--; }
  double t = (x - 1.0) / (x + 1.0);   // |t| <= 1/3
  double t2 = t * t;
  double ln = 2.0 * t * (1.0 + t2 * (1.0 / 3.0 + t2 * (1.0 / 5.0 +
              t2 * (1.0 / 7.0 + t2 * (1.0 / 9.0 + t2 * (1.0 / 11.0))))));
  return ((double)k * LN2 + ln) * INV_LN10;
}

// NaN-proof clamp: NaN falls to lo (the !(v>=lo) trick catches it)
static double clampd(double v, double lo, double hi) {
  if (!(v >= lo)) return lo;
  if (v > hi) return hi;
  return v;
}

// ---------- the levels ----------
static const int NLEV = 5;
static const int MAXC = 3;
static const int MAXS = 3;

struct Comp { double f, a; const char *label; };
struct Spec { double f, db; int mustPass; }; // mustPass: 1 = pass (>= db), 0 = kill (<= db)
struct Level {
  const char *name;
  int nc; Comp comp[MAXC];
  int ns; Spec spec[MAXS];
};

static const Level LEVELS[NLEV] = {
  { "tape hiss", 2,
    { { 1000.0, 1.00, "1 kHz tone"  }, { 12000.0, 0.45, "12 kHz hiss" }, { 0.0, 0.0, "" } },
    2,
    { { 1000.0, -3.0, 1 }, { 12000.0, -12.0, 0 }, { 0.0, 0.0, 0 } } },
  { "ground loop", 2,
    { { 60.0, 0.80, "60 Hz hum" }, { 2000.0, 1.00, "2 kHz tone" }, { 0.0, 0.0, "" } },
    2,
    { { 60.0, -20.0, 0 }, { 2000.0, -3.0, 1 }, { 0.0, 0.0, 0 } } },
  { "the sandwich", 3,
    { { 60.0, 0.60, "60 Hz hum" }, { 1000.0, 1.00, "1 kHz tone" }, { 15000.0, 0.45, "15 kHz hiss" } },
    3,
    { { 1000.0, -3.0, 1 }, { 60.0, -10.0, 0 }, { 15000.0, -10.0, 0 } } },
  { "the squeal", 3,
    { { 200.0, 1.00, "200 Hz melody" }, { 1000.0, 0.90, "1 kHz squeal" }, { 5000.0, 0.55, "5 kHz shimmer" } },
    3,
    { { 200.0, -3.0, 1 }, { 1000.0, -20.0, 0 }, { 5000.0, -3.0, 1 } } },
  { "the gauntlet", 3,
    { { 500.0, 0.90, "500 Hz rumble" }, { 3000.0, 1.00, "3 kHz carrier" }, { 18000.0, 0.65, "18 kHz whine" } },
    3,
    { { 3000.0, -3.0, 1 }, { 500.0, -24.0, 0 }, { 18000.0, -24.0, 0 } } },
};

static int curLevel = 0;

// ---------- the filter under design ----------
static int topo = 0;                      // 0 RC-LP, 1 CR-HP, 2 RLC band-pass, 3 RLC notch
static double Rv = 1000.0;                // ohms   [1, 1e6]
static double Lv = 0.1;                   // henry  [1e-6, 10]
static double Cv = 1e-8;                  // farad  [1e-12, 1e-3]

extern "C" EXPORT("set_topology") void set_topology(int t) {
  topo = (t < 0 || t > 3) ? 0 : t;
}
extern "C" EXPORT("set_rlc") void set_rlc(double r, double l, double c) {
  Rv = clampd(r, 1.0, 1e6);
  Lv = clampd(l, 1e-6, 10.0);
  Cv = clampd(c, 1e-12, 1e-3);
}

// series reactance X(w) = wL - 1/(wC); w > 0 is guaranteed by callers
static double reactance(double w) { return w * Lv - 1.0 / (w * Cv); }

static double magOf(double f) {
  f = clampd(f, 0.01, 1e7);
  double w = TWO_PI * f;
  if (topo == 0) { double a = w * Rv * Cv; return 1.0 / __builtin_sqrt(1.0 + a * a); }
  if (topo == 1) { double a = w * Rv * Cv; return a   / __builtin_sqrt(1.0 + a * a); }
  double X = reactance(w);
  double d = __builtin_sqrt(Rv * Rv + X * X);
  if (topo == 2) return Rv / d;
  double ax = X < 0.0 ? -X : X;
  return ax / d;
}

static double phaseOf(double f) {           // radians
  f = clampd(f, 0.01, 1e7);
  double w = TWO_PI * f;
  if (topo == 0) return -satan(w * Rv * Cv);
  if (topo == 1) return HALF_PI - satan(w * Rv * Cv);
  double X = reactance(w);
  if (topo == 2) return -satan(X / Rv);
  return (X >= 0.0 ? HALF_PI : -HALF_PI) - satan(X / Rv);
}

static double magdbOf(double f) {
  double db = 20.0 * hlog10(magOf(f));
  if (db < -120.0) db = -120.0;             // the notch floor: -inf reads badly on a plot
  if (db > 40.0) db = 40.0;
  return db;
}

// ---------- the sweep: 10 Hz .. 100 kHz, 50 pts/decade ----------
static const int NPTS = 201;
static const double F_LO = 10.0;
static const double DECADE_STEP = 1.0471285480508996; // 10^(1/50), precomputed by hand

static double fgrid[NPTS];
static double magdb[NPTS];
static double phrad[NPTS];
static int gridReady = 0;

static void ensureGrid() {
  if (gridReady) return;
  double f = F_LO;
  for (int i = 0; i < NPTS; i++) { fgrid[i] = f; f *= DECADE_STEP; }
  fgrid[NPTS - 1] = 100000.0;               // pin the endpoint exactly
  gridReady = 1;
}

extern "C" EXPORT("sweep") void sweep() {
  ensureGrid();
  for (int i = 0; i < NPTS; i++) {
    magdb[i] = magdbOf(fgrid[i]);
    phrad[i] = phaseOf(fgrid[i]);
  }
}

extern "C" EXPORT("n_points") int n_points() { return NPTS; }
extern "C" EXPORT("freq_ptr") int freq_ptr() { ensureGrid(); return (int)(unsigned long)&fgrid[0]; }
extern "C" EXPORT("mag_ptr")  int mag_ptr()  { return (int)(unsigned long)&magdb[0]; }
extern "C" EXPORT("phase_ptr") int phase_ptr() { return (int)(unsigned long)&phrad[0]; }

// point queries, for hover readouts and spec dots
extern "C" EXPORT("h_at")      double h_at(double f)      { return magOf(f); }
extern "C" EXPORT("phase_at")  double phase_at(double f)  { return phaseOf(f); }
extern "C" EXPORT("mag_db_at") double mag_db_at(double f) { return magdbOf(f); }

// ---------- level plumbing ----------
extern "C" EXPORT("n_levels") int n_levels() { return NLEV; }
extern "C" EXPORT("level_name") int level_name(int i) {
  return (int)(unsigned long)((i >= 0 && i < NLEV) ? LEVELS[i].name : "");
}
extern "C" EXPORT("load_level") void load_level(int i) {
  curLevel = (i < 0 || i >= NLEV) ? 0 : i;
}
extern "C" EXPORT("n_components") int n_components() { return LEVELS[curLevel].nc; }
extern "C" EXPORT("comp_freq") double comp_freq(int i) {
  const Level &L = LEVELS[curLevel];
  return (i >= 0 && i < L.nc) ? L.comp[i].f : 0.0;
}
extern "C" EXPORT("comp_amp") double comp_amp(int i) {
  const Level &L = LEVELS[curLevel];
  return (i >= 0 && i < L.nc) ? L.comp[i].a : 0.0;
}
extern "C" EXPORT("comp_label") int comp_label(int i) {
  const Level &L = LEVELS[curLevel];
  return (int)(unsigned long)((i >= 0 && i < L.nc) ? L.comp[i].label : "");
}
extern "C" EXPORT("n_specs") int n_specs() { return LEVELS[curLevel].ns; }
extern "C" EXPORT("spec_freq") double spec_freq(int i) {
  const Level &L = LEVELS[curLevel];
  return (i >= 0 && i < L.ns) ? L.spec[i].f : 0.0;
}
extern "C" EXPORT("spec_db") double spec_db(int i) {
  const Level &L = LEVELS[curLevel];
  return (i >= 0 && i < L.ns) ? L.spec[i].db : 0.0;
}
extern "C" EXPORT("spec_is_pass") int spec_is_pass(int i) {
  const Level &L = LEVELS[curLevel];
  return (i >= 0 && i < L.ns) ? L.spec[i].mustPass : 0;
}

// bitmask of satisfied specs: bit i set  <=>  spec i is met by the current filter
extern "C" EXPORT("spec_pass") int spec_pass() {
  const Level &L = LEVELS[curLevel];
  int mask = 0;
  for (int i = 0; i < L.ns; i++) {
    double db = magdbOf(L.spec[i].f);
    bool ok = L.spec[i].mustPass ? (db >= L.spec[i].db) : (db <= L.spec[i].db);
    if (ok) mask |= (1 << i);
  }
  return mask;
}

// ---------- steady-state time domain (for the waveform overlay) ----------
// out component i has amplitude a_i*|H(f_i)| and phase shift arg H(f_i) —
// steady state is exactly the sum of shifted, scaled sinusoids. No transient,
// because the transient died before the visitor scrolled here.
extern "C" EXPORT("out_amp") double out_amp(int i) {
  const Level &L = LEVELS[curLevel];
  if (i < 0 || i >= L.nc) return 0.0;
  return L.comp[i].a * magOf(L.comp[i].f);
}
extern "C" EXPORT("out_phase") double out_phase(int i) {
  const Level &L = LEVELS[curLevel];
  if (i < 0 || i >= L.nc) return 0.0;
  return phaseOf(L.comp[i].f);
}

extern "C" EXPORT("sig_in") double sig_in(double t) {
  if (!(t > -1e6 && t < 1e6)) return 0.0;   // NaN/garbage guard
  const Level &L = LEVELS[curLevel];
  double s = 0.0;
  for (int i = 0; i < L.nc; i++)
    s += L.comp[i].a * hsin(TWO_PI * L.comp[i].f * t);
  return s;
}
extern "C" EXPORT("sig_out") double sig_out(double t) {
  if (!(t > -1e6 && t < 1e6)) return 0.0;
  const Level &L = LEVELS[curLevel];
  double s = 0.0;
  for (int i = 0; i < L.nc; i++) {
    double f = L.comp[i].f;
    s += L.comp[i].a * magOf(f) * hsin(TWO_PI * f * t + phaseOf(f));
  }
  return s;
}
