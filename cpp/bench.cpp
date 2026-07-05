// bench.cpp — freestanding C++ compiled to bare wasm32 (no libc, no stdlib),
// the same way the map engine's Rust is built. Freestanding wasm has no libm,
// so the trig is hand-rolled: sin/cos are range-reduced polynomials, atan is a
// minimax fit, sqrt is the one instruction wasm actually has.
//
// This haversine is the SAME recipe, operation for operation, as bench.rs and
// bench.ts. All three return an identical checksum; only the speed differs.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -Wl,--export=bench_run -o public/bench.bin cpp/bench.cpp

typedef unsigned int u32;

static const double PI = 3.141592653589793;
static const double TWO_PI = 6.283185307179586;
static const double HALF_PI = 1.5707963267948966;
static const double D2R = 0.017453292519943295;
static const double R = 6371.0;

// sin, range-reduced to [-pi/2, pi/2], then a Taylor series to x^9
static double hsin(double x) {
  double k = __builtin_floor(x / TWO_PI + 0.5);
  x = x - k * TWO_PI; // now in [-pi, pi]
  if (x > HALF_PI) x = PI - x; // fold into [-pi/2, pi/2]
  else if (x < -HALF_PI) x = -PI - x;
  double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}
static double hcos(double x) { return hsin(x + HALF_PI); }

// atan on [0, inf) via a minimax poly on [0,1] plus the 1/t identity
static double hatan(double t) {
  bool inv = t > 1.0;
  if (inv) t = 1.0 / t;
  double t2 = t * t;
  double r = t * (0.9998660 + t2 * (-0.3302995 + t2 * (0.1801410 +
             t2 * (-0.0851330 + t2 * 0.0208351))));
  return inv ? HALF_PI - r : r;
}

static double haversine(double lat1, double lon1, double lat2, double lon2) {
  double la1 = lat1 * D2R;
  double la2 = lat2 * D2R;
  double dlat = (lat2 - lat1) * D2R;
  double dlon = (lon2 - lon1) * D2R;
  double s1 = hsin(dlat * 0.5);
  double s2 = hsin(dlon * 0.5);
  double a = s1 * s1 + hcos(la1) * hcos(la2) * s2 * s2;
  if (a < 0.0) a = 0.0;
  if (a > 1.0) a = 1.0;
  double y = __builtin_sqrt(a);
  double x = __builtin_sqrt(1.0 - a);
  double c = (x == 0.0) ? HALF_PI : hatan(y / x);
  return 2.0 * R * c;
}

extern "C" double bench_run(int n) {
  u32 s = 0x2545F491u;
  double sum = 0.0;
  for (int i = 0; i < n; i++) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    double lat1 = ((double)s / 4294967296.0) * 180.0 - 90.0;
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    double lon1 = ((double)s / 4294967296.0) * 360.0 - 180.0;
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    double lat2 = ((double)s / 4294967296.0) * 180.0 - 90.0;
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    double lon2 = ((double)s / 4294967296.0) * 360.0 - 180.0;
    sum += haversine(lat1, lon1, lat2, lon2);
  }
  return sum;
}
