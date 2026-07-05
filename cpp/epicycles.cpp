// epicycles.cpp — the signal-processing engine, freestanding C++ -> wasm32.
// You draw a closed path; this computes its Discrete Fourier Transform (each
// point treated as a complex number z = x + iy), then the renderer turns the
// coefficients into a chain of rotating vectors (epicycles) that retrace the
// drawing. This is the Fourier series, made visible.
//
//   c_k = (1/N) Σ_j z_j · e^(-i·2π·k·j/N)      (analysis, done here)
//   z(t) = Σ_k c_k · e^(+i·2π·f_k·t)           (synthesis, done in the renderer)
//
// Terms are sorted by |c_k| so the renderer can truncate: keep only the top-N
// coefficients and the shape survives — that's compression. recon_err(N)
// quantifies the loss: the mean distance between the stored input points and
// the top-N partial sum evaluated at the same parameter values.
//
// Trig is hand-rolled (freestanding wasm has no libm) — same polynomials as
// bench.cpp. Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//                         -o public/epicycles.bin cpp/epicycles.cpp

#define EXPORT(n) __attribute__((export_name(n)))

static const double PI = 3.141592653589793;
static const double TWO_PI = 6.283185307179586;
static const double HALF_PI = 1.5707963267948966;
static const int MAX = 512;

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

static double hatan_pos(double t) { // t >= 0
  bool inv = t > 1.0;
  if (inv) t = 1.0 / t;
  double t2 = t * t;
  double r = t * (0.9998660 + t2 * (-0.3302995 + t2 * (0.1801410 +
             t2 * (-0.0851330 + t2 * 0.0208351))));
  return inv ? HALF_PI - r : r;
}
static double hatan2(double y, double x) {
  double a = (y < 0 ? -hatan_pos(-y / (x < 0 ? -x : x)) : hatan_pos(y / (x < 0 ? -x : x)));
  // a is atan(|y|/|x|) with y's sign; now fix quadrant by x
  if (x > 0) return a;
  if (x < 0) return y >= 0 ? a + PI : a - PI;
  return y > 0 ? HALF_PI : (y < 0 ? -HALF_PI : 0.0);
}

static double PX[MAX], PY[MAX];
static int NP = 0;
static double FR[MAX], AM[MAX], PH[MAX]; // frequency, amplitude, phase
static int NC = 0;

extern "C" EXPORT("add_point") void add_point(double x, double y) {
  if (NP < MAX) { PX[NP] = x; PY[NP] = y; NP++; }
}
extern "C" EXPORT("clear_pts") void clear_pts() { NP = 0; NC = 0; }

extern "C" EXPORT("compute") void compute() {
  int N = NP;
  NC = 0;
  if (N < 2) return;
  for (int k = 0; k < N; k++) {
    double re = 0, im = 0;
    for (int j = 0; j < N; j++) {
      double ang = (TWO_PI * (double)k * (double)j) / (double)N;
      double c = hcos(ang), s = hsin(ang);
      // z_j · e^(-i·ang) = (x+iy)(c - i s) = (x c + y s) + i(y c - x s)
      re += PX[j] * c + PY[j] * s;
      im += PY[j] * c - PX[j] * s;
    }
    re /= N; im /= N;
    FR[k] = (k <= N / 2) ? (double)k : (double)(k - N); // signed frequency
    AM[k] = __builtin_sqrt(re * re + im * im);
    PH[k] = hatan2(im, re);
  }
  NC = N;
  // sort terms by amplitude, biggest circles first
  for (int a = 0; a < NC; a++) {
    int m = a;
    for (int b = a + 1; b < NC; b++) if (AM[b] > AM[m]) m = b;
    if (m != a) {
      double tf = FR[a]; FR[a] = FR[m]; FR[m] = tf;
      double ta = AM[a]; AM[a] = AM[m]; AM[m] = ta;
      double tp = PH[a]; PH[a] = PH[m]; PH[m] = tp;
    }
  }
}

extern "C" EXPORT("n_terms") int n_terms() { return NC; }
extern "C" EXPORT("term_freq") double term_freq(int i) { return (i >= 0 && i < NC) ? FR[i] : 0; }
extern "C" EXPORT("term_amp") double term_amp(int i) { return (i >= 0 && i < NC) ? AM[i] : 0; }
extern "C" EXPORT("term_phase") double term_phase(int i) { return (i >= 0 && i < NC) ? PH[i] : 0; }
extern "C" EXPORT("n_points") int n_points() { return NP; }

// reconstruction error of a truncated series: synthesize with only the top-N
// largest coefficients at t_j = j/N_points and return the mean distance to the
// stored input points. With every term kept this is ~0 (the DFT is exact);
// cut terms and it climbs — bandwidth vs fidelity, as a number.
extern "C" EXPORT("recon_err") double recon_err(int nTerms) {
  if (NC < 1 || NP < 1) return 0.0;
  if (nTerms < 1) nTerms = 1;
  if (nTerms > NC) nTerms = NC;
  double sum = 0.0;
  for (int j = 0; j < NP; j++) {
    double t = (double)j / (double)NP;
    double x = 0.0, y = 0.0;
    for (int i = 0; i < nTerms; i++) {
      double ang = TWO_PI * FR[i] * t + PH[i];
      x += AM[i] * hcos(ang);
      y += AM[i] * hsin(ang);
    }
    double dx = x - PX[j], dy = y - PY[j];
    sum += __builtin_sqrt(dx * dx + dy * dy);
  }
  return sum / (double)NP;
}
