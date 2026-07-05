// dilemma.cpp — game theory, freestanding C++ -> wasm32. An iterated
// Prisoner's Dilemma: the player faces a classic strategy, and can run an
// Axelrod-style round-robin tournament of all strategies against each other.
// Pure integer logic + a tiny PRNG, no libm. Move encoding: 1 = cooperate,
// 0 = defect. Payoffs: both C -> 3, both D -> 1, defector -> 5, sucker -> 0.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/dilemma.bin cpp/dilemma.cpp

#define EXPORT(n) __attribute__((export_name(n)))
typedef unsigned int u32;

static const int NS = 8;    // number of strategies
static const int MAXR = 256; // max rounds per match

static const char *NAMES[NS] = {
  "Tit for Tat", "Always Cooperate", "Always Defect", "Grudger",
  "Tit for Two Tats", "Pavlov", "Random", "Suspicious TfT",
};

static u32 xrand(u32 *s) {
  u32 x = *s;
  x ^= x << 13; x ^= x >> 17; x ^= x << 5;
  *s = x ? x : 0x9e3779b9u;
  return *s;
}

// a's payoff given a's move and b's move
static int payoff(int a, int b) { return a ? (b ? 3 : 0) : (b ? 5 : 1); }

// strategy `strat` decides its move for round t, seeing its own history `self`
// and the opponent's history `opp` (both length t), possibly using `rng`.
static int decide(int strat, int t, const int *self, const int *opp, u32 *rng) {
  switch (strat) {
    case 0: return t == 0 ? 1 : opp[t - 1];                 // Tit for Tat
    case 1: return 1;                                        // Always Cooperate
    case 2: return 0;                                        // Always Defect
    case 3: for (int i = 0; i < t; i++) if (!opp[i]) return 0; return 1; // Grudger
    case 4: return (t >= 2 && !opp[t - 1] && !opp[t - 2]) ? 0 : 1; // Tit for Two Tats
    case 5: {                                               // Pavlov (win-stay, lose-shift)
      if (t == 0) return 1;
      int s = self[t - 1], o = opp[t - 1];
      int good = (o == 1); // self got 3 (CC) or 5 (DC) exactly when opp cooperated
      return good ? s : 1 - s;
    }
    case 6: return (int)(xrand(rng) & 1u);                  // Random
    case 7: return t == 0 ? 0 : opp[t - 1];                 // Suspicious TfT
    default: return 1;
  }
}

// ---- interactive match: you vs one strategy ----
static int me[MAXR], op[MAXR];
static int rounds = 0, myScore = 0, opScore = 0, curStrat = 0;
static u32 gameRng = 0x2545F491u;

extern "C" EXPORT("strat_count") int strat_count() { return NS; }
extern "C" EXPORT("strat_name") int strat_name(int i) {
  return (int)(unsigned long)((i >= 0 && i < NS) ? NAMES[i] : "");
}

extern "C" EXPORT("begin") void begin(int strat, u32 seed) {
  curStrat = (strat < 0 || strat >= NS) ? 0 : strat;
  rounds = 0; myScore = 0; opScore = 0;
  gameRng = seed ? seed : 0x2545F491u;
}

// you play myMove (1=C, 0=D); returns the opponent's move for this round
extern "C" EXPORT("play") int play(int myMove) {
  if (rounds >= MAXR) return op[rounds - 1];
  int t = rounds;
  int opMove = decide(curStrat, t, op, me, &gameRng); // opponent decides on prior history
  myScore += payoff(myMove, opMove);
  opScore += payoff(opMove, myMove);
  me[t] = myMove; op[t] = opMove; rounds++;
  return opMove;
}
extern "C" EXPORT("my_score") int my_score() { return myScore; }
extern "C" EXPORT("op_score") int op_score() { return opScore; }
extern "C" EXPORT("round_count") int round_count() { return rounds; }

// ---- Axelrod round-robin tournament ----
static int totals[NS];
static int ha[MAXR], hb[MAXR];

extern "C" EXPORT("tournament") void tournament(int R, u32 seed) {
  if (R > MAXR) R = MAXR;
  for (int i = 0; i < NS; i++) totals[i] = 0;
  for (int a = 0; a < NS; a++) {
    for (int b = a; b < NS; b++) {
      u32 ra = seed ^ (u32)(a * 2654435761u) ^ 0x9e3779b9u;
      u32 rb = seed ^ (u32)(b * 40503u) ^ 0x85ebca6bu;
      int sa = 0, sb = 0;
      for (int t = 0; t < R; t++) {
        int am = decide(a, t, ha, hb, &ra);
        int bm = decide(b, t, hb, ha, &rb);
        sa += payoff(am, bm);
        sb += payoff(bm, am);
        ha[t] = am; hb[t] = bm;
      }
      if (a == b) totals[a] += sa; // self-play counts once
      else { totals[a] += sa; totals[b] += sb; }
    }
  }
}
extern "C" EXPORT("tour_score") int tour_score(int i) {
  return (i >= 0 && i < NS) ? totals[i] : 0;
}
