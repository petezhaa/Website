// analysis.cpp — a real-analysis engine: the ε–δ limit duel plus a Riemann-sum
// lab, freestanding C++ compiled to bare wasm32 (no libc, no libm), the same
// toolchain as charges.cpp and bench.cpp. TypeScript owns the canvas and the
// theatrics; C++ owns the mathematics:
//
//   the duel   lim_{x→a} f(x) = L  ⇔  ∀ε>0 ∃δ>0 : 0<|x−a|<δ ⇒ |f(x)−L|<ε
//              sup_dev() densely samples sup{ |f(x)−L| : 0<|x−a|<δ } and the
//              player's δ survives the round iff that sup < ε.
//   the lab    riemann() sums f(x_i*)·Δx with left/right/midpoint x_i*;
//              exact() evaluates hardcoded antiderivatives — except for the
//              one function whose antiderivative isn't elementary, which gets
//              a Simpson reference two orders of magnitude past the n-slider.
//
// Every export clamps and NaN-guards its inputs and returns finite doubles:
// a visitor mashing buttons can, at worst, integrate a step function.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/analysis.bin cpp/analysis.cpp

#define EXPORT(name) __attribute__((export_name(name)))

static const double PI = 3.141592653589793;
static const double TWO_PI = 6.283185307179586;
static const double HALF_PI = 1.5707963267948966;

// sin, range-reduced to [-pi/2, pi/2], then a Taylor series to x^9 — hand
// rolled because freestanding wasm has no libm (same polynomial as bench.cpp)
static double hsin(double x) {
  double k = __builtin_floor(x / TWO_PI + 0.5);
  x = x - k * TWO_PI; // now in [-pi, pi]
  if (x > HALF_PI) x = PI - x; // fold into [-pi/2, pi/2]
  else if (x < -HALF_PI) x = -PI - x;
  double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

// ---- the function library --------------------------------------------------

static const int NF = 4;

static const char *NAMES[NF] = { "x²", "x·sin(1/x)", "|x|", "step(x)" };

// where each duel happens (the point a) and the limit L the player defends
static const double GAME_A[NF] = { 0.5, 0.0, 0.0, 0.0 };
static const double GAME_L[NF] = { 0.25, 0.0, 0.0, 0.5 };

static inline int cfi(int fi) { return fi < 0 ? 0 : (fi >= NF ? NF - 1 : fi); }

// NaN-proof clamp: whatever v is (NaN included), the result is finite
static inline double sane(double v, double lo, double hi) {
  if (!(v == v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

static double fn(int fi, double x) {
  switch (fi) {
    case 0: return x * x;
    case 1: {
      // x·sin(1/x) with f(0) := 0 — continuous at 0 (since |f| ≤ |x|), yet it
      // oscillates infinitely often on the way in. below 1e-9 the value is
      // invisible and 1/x starts stressing the range reduction, so: 0.
      double ax = x < 0.0 ? -x : x;
      if (ax < 1e-9) return 0.0;
      return x * hsin(1.0 / x);
    }
    case 2: return x < 0.0 ? -x : x;
    default: return x < 0.0 ? 0.0 : 1.0; // the trap: a jump of height 1 at 0
  }
}

extern "C" EXPORT("fn_count") int fn_count() { return NF; }

// pointer into wasm memory; TS walks to the NUL and decodes UTF-8
extern "C" EXPORT("fn_name") int fn_name(int i) {
  return (int)(unsigned long)((i >= 0 && i < NF) ? NAMES[i] : "");
}

extern "C" EXPORT("fn_eval") double fn_eval(int fi, double x) {
  return fn(cfi(fi), sane(x, -1e6, 1e6));
}

extern "C" EXPORT("game_a") double game_a(int fi) { return GAME_A[cfi(fi)]; }
extern "C" EXPORT("game_L") double game_L(int fi) { return GAME_L[cfi(fi)]; }

// ---- the ε–δ duel -----------------------------------------------------------

// sup{ |f(x)−L| : 0 < |x−a| < δ } by dense sampling: 4000 midpoints (which by
// construction never land exactly on a, so the puncture is respected) plus a
// sample hugging each edge, where a continuous f likes to hide its sup.
extern "C" EXPORT("sup_dev") double sup_dev(int fi, double a, double L, double delta) {
  fi = cfi(fi);
  a = sane(a, -50.0, 50.0);
  L = sane(L, -50.0, 50.0);
  delta = sane(delta, 1e-9, 8.0);
  const int N = 4000;
  double sup = 0.0;
  for (int i = 0; i < N; i++) {
    double x = a + delta * (2.0 * (i + 0.5) / N - 1.0);
    double d = fn(fi, x) - L;
    if (d < 0.0) d = -d;
    if (d > sup) sup = d;
  }
  for (int s = -1; s <= 1; s += 2) {
    double d = fn(fi, a + s * delta * 0.9999999) - L;
    if (d < 0.0) d = -d;
    if (d > sup) sup = d;
  }
  return sup;
}

// ---- the Riemann lab --------------------------------------------------------

// Σ f(x_i*)·Δx on [a,b] — rule 0: left, 1: right, 2: midpoint
extern "C" EXPORT("riemann") double riemann(int fi, double a, double b, int n, int rule) {
  fi = cfi(fi);
  a = sane(a, -50.0, 50.0);
  b = sane(b, -50.0, 50.0);
  if (b < a) { double t = a; a = b; b = t; }
  if (n < 1) n = 1;
  if (n > 4000) n = 4000;
  double off = rule == 1 ? 1.0 : (rule == 2 ? 0.5 : 0.0);
  double h = (b - a) / n;
  if (!(h > 0.0)) return 0.0;
  double s = 0.0;
  for (int i = 0; i < n; i++) s += fn(fi, a + ((double)i + off) * h);
  return s * h;
}

// antiderivatives, where an elementary one exists
static double F(int fi, double x) {
  switch (fi) {
    case 0: return x * x * x / 3.0;              // ∫ x² dx      = x³/3
    case 2: return 0.5 * x * (x < 0.0 ? -x : x); // ∫ |x| dx     = x·|x|/2
    case 3: return x > 0.0 ? x : 0.0;            // ∫ step(x) dx = max(x, 0)
  }
  return 0.0;
}

extern "C" EXPORT("exact") double exact(int fi, double a, double b) {
  fi = cfi(fi);
  a = sane(a, -50.0, 50.0);
  b = sane(b, -50.0, 50.0);
  if (b < a) { double t = a; a = b; b = t; }
  if (fi != 1) return F(fi, b) - F(fi, a);
  // ∫ x·sin(1/x) dx is not elementary (it smuggles in the cosine integral Ci),
  // so "exact" here is a composite-Simpson reference on 40,000 subintervals —
  // 100× finer than anything the n-slider can build, and honest to far more
  // digits than the readout shows. near 0 the integrand is bounded by |x|, so
  // the unresolvable wiggles contribute less than the last printed digit.
  const int N = 40000;
  double h = (b - a) / N;
  if (!(h > 0.0)) return 0.0;
  double s = fn(1, a) + fn(1, b);
  for (int i = 1; i < N; i++) s += fn(1, a + i * h) * ((i & 1) ? 4.0 : 2.0);
  return s * h / 3.0;
}
