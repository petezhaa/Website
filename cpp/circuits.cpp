// circuits.cpp — DC & AC circuit dynamics, freestanding C++ compiled to bare
// wasm32 (no libc, no stdlib), same toolchain as charges.cpp and bench.cpp.
// TypeScript owns the canvas; C++ owns the differential equations:
//
//   RC        R·C·dv/dt = V_s − v            (charge/discharge a capacitor)
//   RL        L·di/dt   = V_s − R·i          (a coil resists change in i)
//   RLC + AC  L·q'' + R·q' + q/C = V0·sin(ωt)
//
// Integrated with classic RK4 at 40 substeps per 60 Hz frame (2400 Hz).
// Every parameter is clamped so the stiffest admissible rate keeps h·λ well
// inside RK4's stability region; state is NaN-checked and clamped each substep
// anyway, so a visitor mashing sliders can never blow it up.
//
// Freestanding wasm has no libm; sin is the same range-reduced Taylor
// polynomial as bench.cpp, sqrt is the one instruction wasm actually has.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/circuits.bin cpp/circuits.cpp

#define EXPORT(name) __attribute__((export_name(name)))

static const double PI = 3.141592653589793;
static const double TWO_PI = 6.283185307179586;
static const double HALF_PI = 1.5707963267948966;

// parameter clamps — chosen so the fastest possible eigenvalue (1/RC, R/L,
// R/L or 1/sqrt(LC) for RLC) times the substep h = 1/2400 s stays < ~1.1,
// comfortably inside RK4's stability interval (~2.78 on the real axis).
static const double R_MIN = 0.05, R_MAX = 50.0;   // ohms
static const double L_MIN = 0.02, L_MAX = 20.0;   // henries
static const double C_MIN = 0.02, C_MAX = 20.0;   // farads
static const double V_MIN = 0.1,  V_MAX = 10.0;   // volts
static const double F_MIN = 0.001, F_MAX = 5.0;   // hertz
static const double S_MAX = 1.0e4;                // state clamp (belt & braces)

static const double DT = 1.0 / 60.0;              // one frame of sim time
static const int    SUB = 40;                     // RK4 substeps per frame

static int    mode = 0;   // 0 = RC, 1 = RL, 2 = series RLC with AC drive
static int    sw = 1;     // switch closed? (modes 0/1; RLC is always driven)
static double R_ = 1.0, L_ = 1.0, C_ = 1.0, V0_ = 5.0, F_ = 0.16;
static double tt = 0.0;   // sim time, seconds
static double ph = 0.0;   // accumulated drive phase (so f changes stay smooth)
static double s1 = 0.0;   // RC: v_cap   RL: i     RLC: q (charge)
static double s2 = 0.0;   // RC: unused  RL: unused RLC: i

static inline double clampd(double x, double lo, double hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

// sin, range-reduced to [-pi/2, pi/2], then a Taylor series to x^9 (bench.cpp)
static double hsin(double x) {
  double k = __builtin_floor(x / TWO_PI + 0.5);
  x = x - k * TWO_PI; // now in [-pi, pi]
  if (x > HALF_PI) x = PI - x; // fold into [-pi/2, pi/2]
  else if (x < -HALF_PI) x = -PI - x;
  double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

// source voltage: battery through the switch (DC modes) or a sine (RLC)
static inline double src_at(double phase) {
  if (mode == 2) return V0_ * hsin(phase);
  return sw ? V0_ : 0.0;
}

// the right-hand sides. a,b are the state; phase is the drive phase there.
static void deriv(double a, double b, double phase, double* da, double* db) {
  double vs = src_at(phase);
  if (mode == 0) {          // R dv/dt = (V_s - v)/C  ->  dv/dt = (V_s - v)/(RC)
    *da = (vs - a) / (R_ * C_);
    *db = 0.0;
  } else if (mode == 1) {   // L di/dt = V_s - R i
    *da = (vs - R_ * a) / L_;
    *db = 0.0;
  } else {                  // dq/dt = i ;  L di/dt = V_s - R i - q/C
    *da = b;
    *db = (vs - R_ * b - a / C_) / L_;
  }
}

extern "C" EXPORT("set_mode") void set_mode(int m) {
  mode = m < 0 ? 0 : (m > 2 ? 2 : m);
  s1 = 0.0; s2 = 0.0; tt = 0.0; ph = 0.0;
}

extern "C" EXPORT("set_params") void set_params(double R, double L, double C,
                                                double V0, double f) {
  R_ = clampd(R, R_MIN, R_MAX);
  L_ = clampd(L, L_MIN, L_MAX);
  C_ = clampd(C, C_MIN, C_MAX);
  V0_ = clampd(V0, V_MIN, V_MAX);
  F_ = clampd(f, F_MIN, F_MAX);
}

extern "C" EXPORT("set_switch") void set_switch(int on) { sw = on ? 1 : 0; }

extern "C" EXPORT("reset") void reset() {
  s1 = 0.0; s2 = 0.0; tt = 0.0; ph = 0.0;
}

extern "C" EXPORT("step") void step() {
  const double h = DT / SUB;
  double w = (mode == 2) ? TWO_PI * F_ : 0.0;
  for (int k = 0; k < SUB; k++) {
    double k1a, k1b, k2a, k2b, k3a, k3b, k4a, k4b;
    deriv(s1, s2, ph, &k1a, &k1b);
    deriv(s1 + 0.5 * h * k1a, s2 + 0.5 * h * k1b, ph + 0.5 * w * h, &k2a, &k2b);
    deriv(s1 + 0.5 * h * k2a, s2 + 0.5 * h * k2b, ph + 0.5 * w * h, &k3a, &k3b);
    deriv(s1 + h * k3a, s2 + h * k3b, ph + w * h, &k4a, &k4b);
    s1 += (h / 6.0) * (k1a + 2.0 * k2a + 2.0 * k3a + k4a);
    s2 += (h / 6.0) * (k1b + 2.0 * k2b + 2.0 * k3b + k4b);
    ph += w * h;
    if (ph > TWO_PI) ph -= TWO_PI;
    // unconditional stability, the inelegant way: NaN-check and clamp
    if (s1 != s1 || s2 != s2) { s1 = 0.0; s2 = 0.0; }
    s1 = clampd(s1, -S_MAX, S_MAX);
    s2 = clampd(s2, -S_MAX, S_MAX);
  }
  tt += DT;
}

extern "C" EXPORT("t") double sim_t() { return tt; }

extern "C" EXPORT("v_src") double v_src() { return src_at(ph); }

extern "C" EXPORT("v_cap") double v_cap() {
  if (mode == 0) return s1;
  if (mode == 2) return s1 / C_;
  return 0.0; // no capacitor in the RL loop
}

extern "C" EXPORT("i_now") double i_now() {
  if (mode == 0) return (src_at(ph) - s1) / R_; // series: i = (V_s - v_c)/R
  return mode == 1 ? s1 : s2;
}

extern "C" EXPORT("v_ind") double v_ind() {
  if (mode == 1) return src_at(ph) - R_ * s1;                // KVL leftover
  if (mode == 2) return src_at(ph) - R_ * s2 - s1 / C_;
  return 0.0; // no inductor in the RC loop
}

// analytic AC steady-state current amplitude at angular frequency omega:
// I = V0 / |Z|,  |Z| = sqrt(R^2 + (wL - 1/(wC))^2). Only needs sqrt.
extern "C" EXPORT("amp_at") double amp_at(double omega) {
  if (omega < 1.0e-6) omega = 1.0e-6;
  double x = omega * L_ - 1.0 / (omega * C_);
  return V0_ / __builtin_sqrt(R_ * R_ + x * x);
}

// resonant frequency f0 = 1/(2 pi sqrt(LC)), in Hz
extern "C" EXPORT("res_f") double res_f() {
  return 1.0 / (TWO_PI * __builtin_sqrt(L_ * C_));
}

// the mode's characteristic time: RC, L/R, or the RLC envelope 2L/R
extern "C" EXPORT("tau_now") double tau_now() {
  if (mode == 0) return R_ * C_;
  if (mode == 1) return L_ / R_;
  return 2.0 * L_ / R_;
}
