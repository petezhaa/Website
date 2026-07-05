// logic.cpp — digital design, freestanding C++ -> wasm32. A combinational
// netlist engine for leveled logic-gate puzzles: pick gates from the level's
// palette, wire each one to signals that already exist (the inputs, or the
// outputs of earlier gates — so the netlist is a DAG by construction and no
// combinational loop can ever form), and make the LAST gate's output match
// the target truth table on every row. The late levels hand you nothing but
// NAND, because everything is NAND.
//
// Signals: 0..n_inputs-1 are the inputs A,B,C; n_inputs + k is gate k's
// output. Truth-table row r encodes the inputs with A as the top bit, so
// row 5 with three inputs reads A=1 B=0 C=1. Pure integer logic, no libm.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/logic.bin cpp/logic.cpp

#define EXPORT(n) __attribute__((export_name(n)))

// gate types: 0 NOT (1 input), 1 AND, 2 OR, 3 XOR, 4 NAND, 5 NOR
static const int NT = 6;
static const int MAXG = 12; // gate cap — this is a puzzle, not an ASIC
static const int NL = 9;

static const int P_FULL  = 0x0f; // NOT | AND | OR | XOR
static const int P_NOXOR = 0x07; // NOT | AND | OR
static const int P_NAND  = 0x10; // NAND. that's it. that's the palette.

static const char *L_NAME[NL] = {
  "and, obviously",
  "neither nor",
  "same same",
  "majority rules",
  "everything is nand: not",
  "everything is nand: and",
  "everything is nand: or",
  "everything is nand: xor",
  "boss: the mux",
};
static const int L_IN[NL]  = { 2, 2, 2, 3, 2, 2, 2, 2, 3 };
static const int L_PAL[NL] = { P_FULL, P_NOXOR, P_FULL, P_FULL,
                               P_NAND, P_NAND, P_NAND, P_NAND, P_NAND };
// known-minimal gate counts (par); beating the table is the whole sport
static const int L_PAR[NL] = { 1, 2, 2, 4, 1, 2, 3, 4, 4 };

static int lvl = 0, nG = 0;
static int gT[MAXG], gA[MAXG], gB[MAXG];

// input i's bit on row r (A is the most significant bit)
static int inBit(int r, int i, int nin) { return (r >> (nin - 1 - i)) & 1; }

// the spec. there is no other spec.
static int want(int l, int r) {
  int nin = L_IN[l];
  int A = inBit(r, 0, nin), B = inBit(r, 1, nin);
  int C = nin > 2 ? inBit(r, 2, nin) : 0;
  switch (l) {
    case 0: return A & B;                       // and
    case 1: return (A | B) ^ 1;                 // nor, without a NOR gate
    case 2: return (A ^ B) ^ 1;                 // xnor: 1 when they agree
    case 3: return (A & B) | (A & C) | (B & C); // majority of three
    case 4: return A ^ 1;                       // not A (B is a decoy pin)
    case 5: return A & B;                       // and, the hard way
    case 6: return A | B;                       // or, via De Morgan
    case 7: return A ^ B;                       // xor, the classic four
    case 8: return C ? B : A;                   // 2-to-1 mux, C selects
    default: return 0;
  }
}

static int sig[3 + MAXG];

// evaluate every signal for input row r — one left-to-right sweep, since
// every gate only reads signals with a smaller index than its own output
static void sweep(int r) {
  int nin = L_IN[lvl];
  for (int i = 0; i < nin; i++) sig[i] = inBit(r, i, nin);
  for (int k = 0; k < nG; k++) {
    int a = sig[gA[k]], b = sig[gB[k]], v = 0;
    switch (gT[k]) {
      case 0: v = a ^ 1; break;       // NOT
      case 1: v = a & b; break;       // AND
      case 2: v = a | b; break;       // OR
      case 3: v = a ^ b; break;       // XOR
      case 4: v = (a & b) ^ 1; break; // NAND
      case 5: v = (a | b) ^ 1; break; // NOR
    }
    sig[nin + k] = v;
  }
}

static int clampRow(int r) {
  int n = 1 << L_IN[lvl];
  return (r < 0) ? 0 : (r >= n ? n - 1 : r);
}

extern "C" EXPORT("n_levels") int n_levels() { return NL; }
extern "C" EXPORT("level_name") int level_name(int i) {
  return (int)(unsigned long)((i >= 0 && i < NL) ? L_NAME[i] : "");
}
extern "C" EXPORT("level_par") int level_par(int i) {
  return (i >= 0 && i < NL) ? L_PAR[i] : 0;
}

extern "C" EXPORT("load_level") void load_level(int i) {
  lvl = (i < 0) ? 0 : (i >= NL ? NL - 1 : i);
  nG = 0;
}
extern "C" EXPORT("level_inputs") int level_inputs() { return L_IN[lvl]; }
extern "C" EXPORT("level_palette") int level_palette() { return L_PAL[lvl]; }
extern "C" EXPORT("target_row") int target_row(int r) { return want(lvl, clampRow(r)); }

// add a gate wired to existing signals; returns the new gate id, or -1 if
// the request is off-palette, out of range, or the board is out of silicon
extern "C" EXPORT("add_gate") int add_gate(int type, int in1, int in2) {
  if (type < 0 || type >= NT) return -1;
  if (!((L_PAL[lvl] >> type) & 1)) return -1; // not in this level's palette
  if (nG >= MAXG) return -1;                  // out of silicon
  int live = L_IN[lvl] + nG;                  // signals that exist right now
  if (in1 < 0 || in1 >= live) return -1;
  if (type == 0) in2 = in1;                   // NOT has one input; humor it
  if (in2 < 0 || in2 >= live) return -1;
  gT[nG] = type; gA[nG] = in1; gB[nG] = in2;
  return nG++;
}

extern "C" EXPORT("remove_last") void remove_last() { if (nG > 0) nG--; }
extern "C" EXPORT("clear_gates") void clear_gates() { nG = 0; }
extern "C" EXPORT("n_gates") int n_gates() { return nG; }
extern "C" EXPORT("gate_type") int gate_type(int g) { return (g >= 0 && g < nG) ? gT[g] : -1; }
extern "C" EXPORT("gate_in1") int gate_in1(int g) { return (g >= 0 && g < nG) ? gA[g] : -1; }
extern "C" EXPORT("gate_in2") int gate_in2(int g) { return (g >= 0 && g < nG) ? gB[g] : -1; }

// any signal's value on row r — the probe: lets the UI light up every gate
extern "C" EXPORT("eval_signal") int eval_signal(int s, int r) {
  if (s < 0 || s >= L_IN[lvl] + nG) return -1;
  sweep(clampRow(r));
  return sig[s];
}

// OUT (the last gate's output) on row r; -1 when the board is empty
extern "C" EXPORT("eval_row") int eval_row(int r) {
  if (nG == 0) return -1; // no gates, no opinion
  sweep(clampRow(r));
  return sig[L_IN[lvl] + nG - 1];
}

extern "C" EXPORT("solved") int solved() {
  if (nG == 0) return 0;
  int rows = 1 << L_IN[lvl];
  for (int r = 0; r < rows; r++) {
    sweep(r);
    if (sig[L_IN[lvl] + nG - 1] != want(lvl, r)) return 0;
  }
  return 1;
}
