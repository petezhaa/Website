// pendulum.cpp — an inverted pendulum on a cart with a PID controller you
// tune. Freestanding C++ -> wasm32, same recipe as the other engines. This is
// the Segway balance project from the resume, turned into a game: the plant
// is simulated here, your Kp/Ki/Kd are the only thing holding it up, and the
// pokes keep getting bigger.
//
//   plant  θ̈ = (g/l)·sinθ − (u/l)·cosθ − c·θ̇     (u = commanded cart accel)
//          ẍ = u
//   PID    u = Kp·θ + Ki·∫θ dt + Kd·θ̇  (+ a small built-in x recentering
//          term, kx·x + kv·ẋ — real Segways need it too, or they wander)
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/pendulum.bin cpp/pendulum.cpp

#define EXPORT(n) __attribute__((export_name(n)))

static const double PI = 3.141592653589793;
static const double HALF_PI = 1.5707963267948966;
static const double TWO_PI = 6.283185307179586;
static const double G = 9.81;
static const double L = 1.0;    // pole length
static const double CD = 0.15;  // pole damping
static const double RAIL = 6.0; // cart rail half-length; leave it and you crash
static const double UMAX = 25.0;

static double hsin(double x) {
  double k = __builtin_floor(x / TWO_PI + 0.5);
  x = x - k * TWO_PI;
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}
static double hcos(double x) { return hsin(x + HALF_PI); }

static double th, thd, x, xd, integ;
static double kp = 0, ki = 0, kd = 0;
static double t_alive = 0;
static double last_u = 0;
static int crashed_f = 0;

extern "C" EXPORT("reset") void reset() {
  th = 0.06; // start slightly off-balance: the controller must act
  thd = 0;
  x = 0;
  xd = 0;
  integ = 0;
  t_alive = 0;
  last_u = 0;
  crashed_f = 0;
}

extern "C" EXPORT("set_gains") void set_gains(double p, double i, double d) {
  // clamp: any values in range are SAFE to try, not necessarily stable
  kp = (p < 0) ? 0 : (p > 200 ? 200 : p);
  ki = (i < 0) ? 0 : (i > 100 ? 100 : i);
  kd = (d < 0) ? 0 : (d > 60 ? 60 : d);
}

extern "C" EXPORT("poke") void poke(double impulse) {
  if (crashed_f) return;
  if (impulse > 8.0) impulse = 8.0;
  if (impulse < -8.0) impulse = -8.0;
  thd += impulse;
}

extern "C" EXPORT("step") void step(double dt) {
  if (crashed_f) return;
  if (!(dt > 0) || dt > 0.05) dt = 1.0 / 60.0;
  const int SUB = 8;
  double h = dt / SUB;
  for (int s = 0; s < SUB; s++) {
    // PID on the pole angle + gentle cart recentering
    integ += th * h;
    if (integ > 2.0) integ = 2.0;
    if (integ < -2.0) integ = -2.0;
    double u = kp * th + ki * integ + kd * thd + 1.1 * x + 1.7 * xd;
    if (u > UMAX) u = UMAX;
    if (u < -UMAX) u = -UMAX;
    last_u = u;
    // plant
    double thdd = (G / L) * hsin(th) - (u / L) * hcos(th) - CD * thd;
    thd += thdd * h;
    th += thd * h;
    xd += u * h;
    x += xd * h;
    t_alive += h;
    if (th > HALF_PI || th < -HALF_PI || x > RAIL || x < -RAIL) {
      crashed_f = 1;
      return;
    }
  }
}

extern "C" EXPORT("theta") double theta() { return th; }
extern "C" EXPORT("cart_x") double cart_x() { return x; }
extern "C" EXPORT("cart_v") double cart_v() { return xd; }
extern "C" EXPORT("control") double control() { return last_u; }
extern "C" EXPORT("alive_s") double alive_s() { return t_alive; }
extern "C" EXPORT("crashed") int crashed() { return crashed_f; }
extern "C" EXPORT("rail") double rail() { return RAIL; }
