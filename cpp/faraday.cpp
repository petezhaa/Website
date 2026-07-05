// faraday.cpp — a Faraday/Lenz induction engine, freestanding C++ compiled to
// bare wasm32 (no libc, no libm), same toolchain as charges.cpp and bench.cpp.
// TypeScript owns the canvas; C++ owns the magnet, the flux, and the minus sign:
//
//   flux      Φ(d) = N·k·a² / (a² + d²)^(3/2)   (on-axis bar magnet, N turns)
//   faraday   ℰ = −dΦ/dt                         (finite difference of the
//                                                 magnet's ACTUAL dragged motion)
//   ohm       I = ℰ / R                          (lights the lamp)
//
// Stability: the visitor's pointer only sets a TARGET — the magnet chases it
// through a rate-limited follower, so even a teleporting pointer produces a
// bounded, continuous dΦ/dt. emf is clamped and lightly low-passed, dt is
// clamped, every input is NaN-guarded, and no denominator can reach zero
// (a² + d² ≥ a² > 0). Mash away; nothing here can blow up.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/faraday.bin cpp/faraday.cpp

#define EXPORT(name) __attribute__((export_name(name)))

static const double PI = 3.141592653589793;
static const double TWO_PI = 6.283185307179586;
static const double HALF_PI = 1.5707963267948966;

static const int HIST = 512;           // ring-buffer length (~8.5 s at 60 Hz)
static const double XLIM = 1.2;        // magnet travels [-XLIM, XLIM]; coil at 0
static const double COIL_A = 0.35;     // coil radius a
static const double TURNS = 120.0;     // N
static const double KMAG = 0.003;      // magnet strength k (tuned: peak Φ ≈ 1.03)
static const double RES = 2.0;         // lamp resistance R
static const double FOLLOW = 14.0;     // 1/s — how eagerly the magnet chases the target
static const double VCAP = 5.0;        // units/s — magnet speed clamp (bounds dΦ/dt)
static const double EMF_MAX = 6.0;     // hard emf clamp, belt and suspenders
static const double EMF_SMOOTH = 40.0; // 1/s low-pass on emf (kills pointer jitter)
static const double SHAKE_CX = 0.5;    // autopilot oscillates about the steep flux slope

static double t = 0.0;                 // sim time
static double mx = 0.9, tx = 0.9;      // magnet position + drag target
static double phi_v = 0.0, emf_v = 0.0;
static int inited = 0;
static int shaking = 0;
static double amp = 0.42, freq = 0.9;  // autopilot amplitude (units) + frequency (Hz)
static double hphi[HIST], hemf[HIST];
static int hhead = 0, hcount = 0;

// sin, range-reduced to [-pi/2, pi/2] then Taylor to x^9 — freestanding wasm
// has no libm, so this is the bench.cpp recipe, copied verbatim
static double hsin(double x) {
  double k = __builtin_floor(x / TWO_PI + 0.5);
  x = x - k * TWO_PI; // now in [-pi, pi]
  if (x > HALF_PI) x = PI - x; // fold into [-pi/2, pi/2]
  else if (x < -HALF_PI) x = -PI - x;
  double x2 = x * x;
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 +
         x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
}

static inline double clampd(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// flux through all N turns from an on-axis dipole a distance d from the coil
static double flux_at(double d) {
  double s = COIL_A * COIL_A + d * d; // ≥ a² > 0: nothing to soften, it's born safe
  return TURNS * KMAG * COIL_A * COIL_A / (s * __builtin_sqrt(s));
}

extern "C" EXPORT("reset") void reset() {
  t = 0.0;
  mx = 0.9; tx = 0.9;
  phi_v = flux_at(mx);
  emf_v = 0.0;
  hhead = 0; hcount = 0;
  shaking = 0;
  inited = 1;
}

// the pointer sets a target; step() does the actual (rate-limited) moving
extern "C" EXPORT("set_pos") void set_pos(double x) {
  if (!(x == x)) return; // NaN guard: NaN != NaN
  tx = clampd(x, -XLIM, XLIM);
}

extern "C" EXPORT("set_shake") void set_shake(int on) { shaking = on ? 1 : 0; }

extern "C" EXPORT("set_amp") void set_amp(double a) {
  if (a == a) amp = clampd(a, 0.0, 0.7);
}

extern "C" EXPORT("set_freq") void set_freq(double f) {
  if (f == f) freq = clampd(f, 0.05, 3.0);
}

extern "C" EXPORT("step") void step(double dt) {
  if (!(dt > 0.0)) return; // rejects NaN, zero and negative dt in one test
  if (dt > 0.05) dt = 0.05; // a tab left backgrounded can't come home to a dΦ/dt bomb
  if (!inited) { phi_v = flux_at(mx); inited = 1; }
  t += dt;
  if (shaking) tx = clampd(SHAKE_CX + amp * hsin(TWO_PI * freq * t), -XLIM, XLIM);
  // chase the target: exponential approach, speed-capped, so dΦ/dt stays bounded
  double v = clampd((tx - mx) * FOLLOW, -VCAP, VCAP);
  mx = clampd(mx + v * dt, -XLIM, XLIM);
  double ph = flux_at(mx);
  double e = clampd(-(ph - phi_v) / dt, -EMF_MAX, EMF_MAX); // Faraday, finite-differenced
  double k = dt * EMF_SMOOTH;
  if (k > 1.0) k = 1.0;
  emf_v += (e - emf_v) * k; // light low-pass: pointer jitter out, physics in
  phi_v = ph;
  hphi[hhead] = phi_v;
  hemf[hhead] = emf_v;
  hhead = (hhead + 1) % HIST;
  if (hcount < HIST) hcount++;
}

extern "C" EXPORT("pos") double pos() { return mx; }
extern "C" EXPORT("flux") double flux() { return phi_v; }
extern "C" EXPORT("emf") double emf() { return emf_v; }
extern "C" EXPORT("current") double current() { return emf_v / RES; }
extern "C" EXPORT("xlim") double xlim() { return XLIM; }

extern "C" EXPORT("hist_len") int hist_len() { return hcount; }

// i = 0 is the oldest sample, i = hist_len()-1 the newest
extern "C" EXPORT("hist_phi") double hist_phi(int i) {
  if (i < 0 || i >= hcount) return 0.0;
  return hphi[(hhead - hcount + i + 2 * HIST) % HIST];
}

extern "C" EXPORT("hist_emf") double hist_emf(int i) {
  if (i < 0 || i >= hcount) return 0.0;
  return hemf[(hhead - hcount + i + 2 * HIST) % HIST];
}
