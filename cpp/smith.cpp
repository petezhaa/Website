// smith.cpp — a Smith-chart impedance-matching game, freestanding C++
// compiled to bare wasm32 (no libc, no libm), same toolchain as waves.cpp
// and dilemma.cpp. TypeScript owns the canvas; C++ owns the complex math:
//
//   normalize   z = Z / Z0                         (Z0 = 50 ohm)
//   series L/C  z' = z + jX/Z0,   X = wL or -1/(wC)
//   shunt  L/C  y' = 1/z + jB*Z0, B = wC or -1/(wL)  (work in admittance)
//   reflection  G = (z - 1) / (z + 1)              (complex division)
//   VSWR        (1 + |G|) / (1 - |G|)
//
// No trig anywhere: the Smith chart is just the image of the right half
// z-plane under a Mobius map, and Mobius maps need only + - * / and the one
// sqrt instruction wasm actually has. Every input is NaN-proof-clamped and
// every division is epsilon-guarded — a visitor mashing sliders cannot
// conjure a NaN onto the canvas.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/smith.bin cpp/smith.cpp

#define EXPORT(n) __attribute__((export_name(n)))

static const double PI = 3.141592653589793;
static const double Z0 = 50.0;
static const int NSLOT = 3;
static const int NL = 6;

// element kinds: 0 empty, 1 series L, 2 series C, 3 shunt L, 4 shunt C
static const double L_MIN = 1e-9,  L_MAX = 1e-5;  // 1 nH .. 10 uH
static const double C_MIN = 1e-13, C_MAX = 1e-9;  // 0.1 pF .. 1 nF

// ---- levels: load impedance (ohms), frequency, par (fewest elements) ----
static const char *LNAME[NL] = {
  "the polite resistor",
  "the textbook special",
  "secretly one move",
  "the lazy dipole",
  "the garage-door band",
  "a very short whip",
};
static const double LZR[NL] = { 100.0,  25.0, 10.0, 150.0, 30.0,   5.0 };
static const double LZI[NL] = {   0.0, -40.0, 20.0, -75.0, 60.0, -15.0 };
static const double LFQ[NL] = { 100e6, 100e6, 100e6, 100e6, 433e6, 915e6 };
static const int    LPAR[NL] = { 2, 2, 1, 2, 2, 2 };

// ---- current state ----
static double zlr = 2.0, zli = 0.0;      // normalized load z = ZL/Z0
static double w = 2.0 * PI * 100e6;      // omega at this level
static int    kindArr[NSLOT] = { 0, 0, 0 };
static double valArr[NSLOT]  = { 0.0, 0.0, 0.0 };

// cached results of the full network (refreshed by compute())
static double czr = 2.0, czi = 0.0;      // normalized input impedance
static double cgr = 0.0, cgi = 0.0;      // reflection coefficient
static double cgm = 1.0, cvswr = 999.0;  // |G| and VSWR

// NaN scrub + symmetric clamp — the last line of defense
static double sane(double v, double lim) {
  if (v != v) return 0.0;
  if (v > lim) return lim;
  if (v < -lim) return -lim;
  return v;
}

// guarded complex reciprocal: 1/(re + j im)
static void cinv(double re, double im, double *outRe, double *outIm) {
  double d = re * re + im * im;
  if (d < 1e-12) d = 1e-12;
  *outRe = re / d;
  *outIm = -im / d;
}

// full-strength reactance X (ohms, series) or susceptance B (siemens, shunt)
static double elemMag(int k, double v) {
  switch (k) {
    case 1: return w * v;           // series L: X = wL
    case 2: return -1.0 / (w * v);  // series C: X = -1/(wC)
    case 3: return -1.0 / (w * v);  // shunt  L: B = -1/(wL)
    case 4: return w * v;           // shunt  C: B = wC
    default: return 0.0;
  }
}

// apply fraction f in [0,1] of an element to z — f<1 samples the arc the
// point walks (series slides along constant-R, shunt along constant-G)
static void applyFrac(int k, double v, double f, double *zr, double *zi) {
  if (k == 1 || k == 2) {
    *zi += elemMag(k, v) * f / Z0;
  } else if (k == 3 || k == 4) {
    double yr, yi;
    cinv(*zr, *zi, &yr, &yi);
    yi += elemMag(k, v) * f * Z0;
    cinv(yr, yi, zr, zi);
  }
  *zr = sane(*zr, 1e9);
  *zi = sane(*zi, 1e9);
}

// G = (z - 1)/(z + 1), the Mobius map that IS the Smith chart
static void gammaOf(double zr, double zi, double *gr, double *gi) {
  double dr = zr + 1.0, di = zi;
  double d = dr * dr + di * di;
  if (d < 1e-12) d = 1e-12;
  *gr = ((zr - 1.0) * dr + zi * di) / d;
  *gi = (zi * dr - (zr - 1.0) * di) / d;
}

static void compute() {
  double zr = zlr, zi = zli;
  for (int s = 0; s < NSLOT; s++)
    if (kindArr[s]) applyFrac(kindArr[s], valArr[s], 1.0, &zr, &zi);
  czr = zr; czi = zi;
  gammaOf(zr, zi, &cgr, &cgi);
  cgr = sane(cgr, 1.0);
  cgi = sane(cgi, 1.0);
  cgm = __builtin_sqrt(cgr * cgr + cgi * cgi);
  if (cgm > 1.0) cgm = 1.0;
  cvswr = (cgm > 0.998) ? 999.0 : (1.0 + cgm) / (1.0 - cgm);
  if (cvswr > 999.0) cvswr = 999.0;
}

// ---- level + network API ----
extern "C" EXPORT("n_levels") int n_levels() { return NL; }
extern "C" EXPORT("n_slots") int n_slots() { return NSLOT; }

extern "C" EXPORT("level_name") int level_name(int i) {
  return (int)(unsigned long)((i >= 0 && i < NL) ? LNAME[i] : "");
}
extern "C" EXPORT("level_par") int level_par(int i) {
  return (i >= 0 && i < NL) ? LPAR[i] : 2;
}

extern "C" EXPORT("load_level") void load_level(int i) {
  if (i < 0) i = 0;
  if (i >= NL) i = NL - 1;
  zlr = LZR[i] / Z0;
  zli = LZI[i] / Z0;
  w = 2.0 * PI * LFQ[i];
  for (int s = 0; s < NSLOT; s++) { kindArr[s] = 0; valArr[s] = 0.0; }
  compute();
}

extern "C" EXPORT("zl_re") double zl_re() { return zlr * Z0; }
extern "C" EXPORT("zl_im") double zl_im() { return zli * Z0; }
extern "C" EXPORT("freq_hz") double freq_hz() { return w / (2.0 * PI); }

// slot 0 sits against the load; slot 2 faces the source. kind out of range
// empties the slot; values are clamped to buyable parts (NaN -> minimum).
extern "C" EXPORT("set_elem") void set_elem(int slot, int k, double v) {
  if (slot < 0 || slot >= NSLOT) return;
  if (k < 0 || k > 4) k = 0;
  if (k == 1 || k == 3) {        // an inductor
    if (!(v >= L_MIN)) v = L_MIN;   // !(x>=lo) also catches NaN
    if (v > L_MAX) v = L_MAX;
  } else if (k == 2 || k == 4) { // a capacitor
    if (!(v >= C_MIN)) v = C_MIN;
    if (v > C_MAX) v = C_MAX;
  } else {
    v = 0.0;
  }
  kindArr[slot] = k;
  valArr[slot] = v;
  compute();
}

// ---- results ----
extern "C" EXPORT("gamma_re") double gamma_re() { return cgr; }
extern "C" EXPORT("gamma_im") double gamma_im() { return cgi; }
extern "C" EXPORT("gamma_mag") double gamma_mag() { return cgm; }
extern "C" EXPORT("vswr") double vswr() { return cvswr; }
extern "C" EXPORT("z_re") double z_re() { return czr * Z0; }
extern "C" EXPORT("z_im") double z_im() { return czi * Z0; }
extern "C" EXPORT("matched") int matched() { return cgm < 0.1 ? 1 : 0; }

// ---- the walk, for drawing ----
// fills TR with (gamma_re, gamma_im) pairs: the load point, then `sub`
// samples per non-empty slot as that element's strength ramps 0 -> full.
// returns the number of pairs written. TSX reads TR via trace_ptr().
static const int TRMAX = 256; // 1 + 3*80 fits with headroom
static double TR[TRMAX * 2];

extern "C" EXPORT("trace") int trace_fill(int sub) {
  if (sub < 2) sub = 2;
  if (sub > 80) sub = 80;
  double zr = zlr, zi = zli, gr, gi;
  gammaOf(zr, zi, &gr, &gi);
  TR[0] = sane(gr, 1.5);
  TR[1] = sane(gi, 1.5);
  int n = 1;
  for (int s = 0; s < NSLOT; s++) {
    if (!kindArr[s]) continue;
    for (int k = 1; k <= sub && n < TRMAX; k++) {
      double tzr = zr, tzi = zi;
      applyFrac(kindArr[s], valArr[s], (double)k / (double)sub, &tzr, &tzi);
      gammaOf(tzr, tzi, &gr, &gi);
      TR[2 * n]     = sane(gr, 1.5);
      TR[2 * n + 1] = sane(gi, 1.5);
      n++;
    }
    applyFrac(kindArr[s], valArr[s], 1.0, &zr, &zi); // advance the base point
  }
  return n;
}

extern "C" EXPORT("trace_ptr") int trace_ptr() {
  return (int)(unsigned long)&TR[0];
}
