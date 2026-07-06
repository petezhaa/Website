// poker.cpp — no-limit Texas Hold'em trainer for 2 to 5 players, freestanding
// C++ -> wasm32. The engine deals, runs the betting, plays the bots, and
// coaches: at every hero decision it estimates equity with a Monte Carlo
// simulation against the ranges the other players' betting represents, and
// grades the action taken against the pot odds. Pure integer logic plus a
// xorshift PRNG, no libc/libm. React only draws.
//
// Because every player is topped up to the same stack each hand, active
// players always hold equal stacks at the start of a street, so side pots
// can never form; the only cleanup needed is refunding an uncalled bet.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/poker.bin cpp/poker.cpp

#define EXPORT(n) __attribute__((export_name(n)))
typedef unsigned int u32;

// ---- config ----
static const int MAXP = 5;
static const int STACK = 1000; // everyone tops up to this every hand
static const int SB = 5, BB = 10;
static const int COACH_ITERS = 1200; // Monte Carlo samples for the coach
static const int BOT_ITERS = 500;    // the bots think a little less hard

// ---- rng ----
static u32 rng = 0x2545F491u;
static u32 xrand() {
  u32 x = rng;
  x ^= x << 13; x ^= x >> 17; x ^= x << 5;
  rng = x ? x : 0x9e3779b9u;
  return rng;
}
static int rnd(int n) { return (int)(xrand() % (u32)n); }

// ---- cards ----
// card 0..51: rank = c >> 2 (0=2 .. 12=A), suit = c & 3
static int deck[52];
static void shuffle_deck() {
  for (int i = 0; i < 52; i++) deck[i] = i;
  for (int i = 51; i > 0; i--) {
    int j = rnd(i + 1);
    int t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
}

// ---- 5-card evaluator ----
// score = category << 20 | five significance-ordered ranks, 4 bits each.
// categories: 8 straight flush, 7 quads, 6 full house, 5 flush, 4 straight,
//             3 trips, 2 two pair, 1 pair, 0 high card
static int eval5(const int *cs) {
  int rank[5], cnt[13] = {0};
  int flush = 1;
  for (int i = 0; i < 5; i++) {
    rank[i] = cs[i] >> 2;
    cnt[rank[i]]++;
    if ((cs[i] & 3) != (cs[0] & 3)) flush = 0;
  }
  int ur[5], uc[5], nu = 0;
  for (int r = 12; r >= 0; r--)
    if (cnt[r]) { ur[nu] = r; uc[nu] = cnt[r]; nu++; }
  int straight = 0, top = 0;
  if (nu == 5) {
    if (ur[0] - ur[4] == 4) { straight = 1; top = ur[0]; }
    else if (ur[0] == 12 && ur[1] == 3) { straight = 1; top = 3; } // wheel
  }
  if (straight && flush) return (8 << 20) | (top << 16);
  if (straight) return (4 << 20) | (top << 16);
  if (flush) {
    int s = 5 << 20;
    for (int i = 0; i < 5; i++) s |= ur[i] << (16 - 4 * i);
    return s;
  }
  for (int i = 1; i < nu; i++)
    for (int j = i; j > 0; j--)
      if (uc[j] > uc[j - 1] || (uc[j] == uc[j - 1] && ur[j] > ur[j - 1])) {
        int tc = uc[j]; uc[j] = uc[j - 1]; uc[j - 1] = tc;
        int tr = ur[j]; ur[j] = ur[j - 1]; ur[j - 1] = tr;
      } else break;
  int cat = 0;
  if (uc[0] == 4) cat = 7;
  else if (uc[0] == 3 && uc[1] == 2) cat = 6;
  else if (uc[0] == 3) cat = 3;
  else if (uc[0] == 2 && uc[1] == 2) cat = 2;
  else if (uc[0] == 2) cat = 1;
  int s = cat << 20;
  for (int i = 0; i < nu; i++) s |= ur[i] << (16 - 4 * i);
  return s;
}

// best 5-card score out of 7; optionally reports which five were used
// as a bitmask over the input order (for the showdown highlight)
static int eval7_mask(const int *cs, int *maskOut) {
  int best = -1, bmask = 0, five[5];
  for (int a = 0; a < 7; a++)
    for (int b = a + 1; b < 7; b++) {
      int n = 0;
      for (int i = 0; i < 7; i++)
        if (i != a && i != b) five[n++] = cs[i];
      int s = eval5(five);
      if (s > best) { best = s; bmask = 0x7F & ~((1 << a) | (1 << b)); }
    }
  if (maskOut) *maskOut = bmask;
  return best;
}
static int eval7(const int *cs) { return eval7_mask(cs, 0); }

// ---- preflop hand strength: the Chen formula, doubled to stay integer ----
static int chen2(int c0, int c1) {
  int r0 = c0 >> 2, r1 = c1 >> 2;
  int hi = r0 > r1 ? r0 : r1, lo = r0 > r1 ? r1 : r0;
  int base;
  if (hi == 12) base = 20;
  else if (hi == 11) base = 16;
  else if (hi == 10) base = 14;
  else if (hi == 9) base = 12;
  else base = hi + 2;
  if (r0 == r1) {
    int p = base * 2;
    return p < 10 ? 10 : p;
  }
  int s = base;
  if ((c0 & 3) == (c1 & 3)) s += 4;
  int gap = hi - lo - 1;
  if (gap == 1) s -= 2;
  else if (gap == 2) s -= 4;
  else if (gap == 3) s -= 8;
  else if (gap >= 4) s -= 10;
  if (gap <= 1 && hi < 10) s += 2;
  return s;
}
// range classes: 0 = anything, 1 = called (playable), 2 = raised (strong),
// 3 = re-raised or barrelled (very strong). Minimum chen2 per class:
static const int CLS_MIN[4] = {-100, 7, 12, 17};

// ---- game state ----
static int NP = 2;               // players this hand (2..5), seat 0 = hero
static int pendingNP = 2;        // applied at the next deal
static int holeC[MAXP][2], board[5];
static int boardCount = 0;
static int street = 0;           // 0 pre, 1 flop, 2 turn, 3 river
static int button = 1;           // rotates every hand
static int stack_[MAXP], bet_[MAXP], acted[MAXP], folded[MAXP];
static int contrib[MAXP];        // total chips put in this hand (side pots)
static int onlyCall[MAXP];       // a short all-in didn't reopen the betting
static int rangeCls[MAXP];
static int mode = 0;             // 0 practice, 1 bankroll, 2 tournament
static int rebuysHero = 0;
// tournament state: blinds climb, busts are final, placements recorded
static int SBv = 5, BBv = 10;    // current blinds (fixed outside tournaments)
static int outOf[MAXP];          // busted out of the tournament
static int placeP[MAXP];         // finishing position (0 = still in)
static int tHands = 0;           // hands played this tournament
static int tOver = 0;
static const int T_LEVELS = 8;
static const int T_SB[T_LEVELS] = {5, 10, 15, 25, 40, 60, 100, 150};
static const int T_BB[T_LEVELS] = {10, 20, 30, 50, 80, 120, 200, 300};
static const int T_HANDS_PER_LEVEL = 8;
static int alive_count() {
  int n = 0;
  for (int p = 0; p < NP; p++)
    if (!outOf[p]) n++;
  return n;
}
static int prefAgg = -1;         // last preflop raiser (for c-bet logic)
static int pot = 0;              // chips from completed streets
static int lastRaise = BB;
static int turnSeat = 0;
static int over = 1;
static int byFold = 0;
static int showdown = 0;
static int winners_ = 0;         // bitmask of winning seats at hand end
static int catP[MAXP], maskP[MAXP];
static int heroStackAtDeal = 0;
static int level = 1;            // 0 easy, 1 normal, 2 hard

// session
static int handsPlayed = 0, profit = 0;
static int nBest = 0, nOk = 0, nBad = 0;

// coach cache
static int coachValid = 0;
static int coachEqPm = 0, coachPoPm = 0, coachAdv = 1;
static int lastGrade = -1;
static int lastAdvised = -1, lastEqPm = -1, lastPoPm = -1, lastActionCls = -1;

// action log: (actor, action, amount, street); actor 9 = the dealer
// actions: 0 fold, 1 check, 2 call, 3 bet, 4 raise, 5 SB, 6 BB,
//          7 flop, 8 turn, 9 river, 10 showdown
static const int LOGMAX = 128;
static int logActor[LOGMAX], logAct[LOGMAX], logAmt[LOGMAX], logStreet[LOGMAX];
static int logN = 0;
static void logev(int actor, int act, int amt) {
  if (logN < LOGMAX) {
    logActor[logN] = actor; logAct[logN] = act;
    logAmt[logN] = amt; logStreet[logN] = street; logN++;
  }
}

// ---- table helpers ----
static int count_active() {
  int n = 0;
  for (int p = 0; p < NP; p++)
    if (!folded[p]) n++;
  return n;
}
static int max_bet() {
  int m = 0;
  for (int p = 0; p < NP; p++)
    if (!folded[p] && bet_[p] > m) m = bet_[p];
  return m;
}
static int to_call_of(int p) {
  int d = max_bet() - bet_[p];
  return d > 0 ? d : 0;
}
static int pot_now() {
  int s = pot;
  for (int p = 0; p < NP; p++) s += bet_[p];
  return s;
}
static int can_act(int p) { return !folded[p] && stack_[p] > 0; }
static int needs_action(int p) {
  return can_act(p) && (!acted[p] || bet_[p] < max_bet());
}
static int next_needing(int from) {
  for (int k = 1; k <= NP; k++) {
    int p = (from + k) % NP;
    if (needs_action(p)) return p;
  }
  return -1;
}
static int players_who_can_act() {
  int n = 0;
  for (int p = 0; p < NP; p++)
    if (can_act(p)) n++;
  return n;
}

// ---- multi-way Monte Carlo equity for `seat` vs every live opponent, each
// rejection-sampled into the range their betting represents ----
static int equity_of(int seat, int iters) {
  int used[52] = {0};
  used[holeC[seat][0]] = used[holeC[seat][1]] = 1;
  for (int i = 0; i < boardCount; i++) used[board[i]] = 1;
  int avail[52], na = 0;
  for (int c = 0; c < 52; c++)
    if (!used[c]) avail[na++] = c;

  int vill[MAXP], nv = 0;
  for (int p = 0; p < NP; p++)
    if (p != seat && !folded[p]) vill[nv++] = p;
  if (nv == 0) return 1000;

  int needB = 5 - boardCount;
  // score in 1/120ths so 2..5-way ties split exactly
  int win120 = 0;
  for (int it = 0; it < iters; it++) {
    // deal each villain into their range; villain k uses slots 2k, 2k+1
    for (int k = 0; k < nv; k++) {
      int base = 2 * k;
      int vsMin = CLS_MIN[rangeCls[vill[k]]];
      for (int tries = 0; tries < 20; tries++) {
        int a = base + rnd(na - base), b = base + rnd(na - base - 1);
        if (b >= a) b++;
        if (chen2(avail[a], avail[b]) >= vsMin || tries == 19) {
          int t = avail[base]; avail[base] = avail[a]; avail[a] = t;
          if (b == base) b = a;
          t = avail[base + 1]; avail[base + 1] = avail[b]; avail[b] = t;
          break;
        }
      }
    }
    // complete the board from the rest
    int bd = 2 * nv;
    for (int i = 0; i < needB; i++) {
      int j = bd + i + rnd(na - bd - i);
      int t = avail[bd + i]; avail[bd + i] = avail[j]; avail[j] = t;
    }
    int seven[7];
    seven[0] = holeC[seat][0]; seven[1] = holeC[seat][1];
    for (int i = 0; i < boardCount; i++) seven[2 + i] = board[i];
    for (int i = 0; i < needB; i++) seven[2 + boardCount + i] = avail[bd + i];
    int mine = eval7(seven);
    int bestV = -1;
    for (int k = 0; k < nv; k++) {
      seven[0] = avail[2 * k]; seven[1] = avail[2 * k + 1];
      int s = eval7(seven);
      if (s > bestV) bestV = s;
    }
    if (mine > bestV) win120 += 120;
    else if (mine == bestV) {
      int ties = 1;
      for (int k = 0; k < nv; k++) {
        seven[0] = avail[2 * k]; seven[1] = avail[2 * k + 1];
        if (eval7(seven) == bestV) ties++;
      }
      win120 += 120 / ties;
    }
  }
  return (int)((long long)win120 * 1000 / (120LL * iters));
}

// ---- street / hand flow ----
static void settle_street() {
  // refund an uncalled bet (only possible when everyone else folded or the
  // last raise went unmatched)
  int hi = 0;
  for (int p = 1; p < NP; p++)
    if (bet_[p] > bet_[hi]) hi = p;
  int second = 0;
  for (int p = 0; p < NP; p++)
    if (p != hi && bet_[p] > second) second = bet_[p];
  if (bet_[hi] > second) {
    int refund = bet_[hi] - second;
    stack_[hi] += refund;
    contrib[hi] -= refund;
    bet_[hi] = second;
  }
  for (int p = 0; p < NP; p++) {
    pot += bet_[p]; bet_[p] = 0; acted[p] = 0; onlyCall[p] = 0;
  }
  lastRaise = BBv;
}
static int next_alive(int from) {
  int p = from;
  do { p = (p + 1) % NP; } while (outOf[p]);
  return p;
}
static void finish_hand() {
  over = 1;
  profit += stack_[0] - heroStackAtDeal;
  handsPlayed++;
  if (mode == 2) {
    tHands++;
    int alive = alive_count();
    for (int p = 0; p < NP; p++)
      if (!outOf[p] && stack_[p] <= 0) {
        outOf[p] = 1;
        placeP[p] = alive; // busting now finishes in this position
      }
    if (outOf[0]) tOver = 1;
    else if (alive_count() == 1) { tOver = 1; placeP[0] = 1; }
  }
}
static void do_showdown() {
  int score[MAXP], seven[7];
  for (int i = 0; i < 5; i++) seven[2 + i] = board[i];
  for (int p = 0; p < NP; p++) {
    if (folded[p]) { catP[p] = -1; maskP[p] = 0; score[p] = -1; continue; }
    seven[0] = holeC[p][0]; seven[1] = holeC[p][1];
    score[p] = eval7_mask(seven, &maskP[p]);
    catP[p] = score[p] >> 20;
  }
  showdown = 1;
  logev(9, 10, 0);
  // award the pot in contribution layers: each layer is won by the best
  // hand among the players whose money reaches it. With equal starting
  // stacks this is one layer; in bankroll mode it is real side pots.
  winners_ = 0;
  while (1) {
    int m = 0x7fffffff, any = 0;
    for (int p = 0; p < NP; p++)
      if (!folded[p] && contrib[p] > 0 && contrib[p] < m) { m = contrib[p]; any = 1; }
    if (!any) break;
    int elig[MAXP], layer = 0;
    for (int p = 0; p < NP; p++) {
      elig[p] = (!folded[p] && contrib[p] > 0);
      int take = contrib[p] < m ? contrib[p] : m;
      if (take > 0) { layer += take; contrib[p] -= take; }
    }
    int best = -1;
    for (int p = 0; p < NP; p++)
      if (elig[p] && score[p] > best) best = score[p];
    int nw = 0;
    for (int p = 0; p < NP; p++)
      if (elig[p] && score[p] == best) nw++;
    int share = layer / nw, extra = layer - share * nw;
    for (int p = 0; p < NP; p++)
      if (elig[p] && score[p] == best) {
        stack_[p] += share + extra;
        extra = 0;
        winners_ |= 1 << p;
      }
  }
  pot = 0;
  byFold = 0;
  finish_hand();
}
static void runout_and_showdown() {
  while (boardCount < 5) {
    street = street < 3 ? street + 1 : 3;
    boardCount = street == 1 ? 3 : (street == 2 ? 4 : 5);
    logev(9, 6 + street, 0);
  }
  do_showdown();
}
static void deal_next_street() {
  street++;
  boardCount = street == 1 ? 3 : (street == 2 ? 4 : 5);
  logev(9, 6 + street, 0);
  turnSeat = -1;
  for (int k = 1; k <= NP; k++) {
    int p = (button + k) % NP;
    if (can_act(p)) { turnSeat = p; break; }
  }
  coachValid = 0;
}
// after seat p acts, advance the hand state machine
static void advance_after(int p) {
  if (count_active() == 1) {
    settle_street();
    for (int q = 0; q < NP; q++)
      if (!folded[q]) { stack_[q] += pot; winners_ = 1 << q; }
    pot = 0;
    byFold = 1;
    finish_hand();
    return;
  }
  int nxt = next_needing(p);
  if (nxt >= 0) { turnSeat = nxt; return; }
  // street settled
  settle_street();
  if (players_who_can_act() <= 1) { runout_and_showdown(); return; }
  if (street == 3) { do_showdown(); return; }
  deal_next_street();
}

// perform an action for seat p. cls: 0 fold, 1 check/call, 2 raise-to `to`.
static void apply(int p, int cls, int to) {
  int tc = to_call_of(p);
  if (cls == 0) {
    folded[p] = 1;
    logev(p, 0, 0);
    advance_after(p);
    return;
  }
  if (cls == 1) {
    int pay = tc > stack_[p] ? stack_[p] : tc;
    stack_[p] -= pay;
    bet_[p] += pay;
    contrib[p] += pay;
    logev(p, tc > 0 ? 2 : 1, pay);
    if (tc > 0 && rangeCls[p] < 1) rangeCls[p] = 1;
    acted[p] = 1;
    advance_after(p);
    return;
  }
  // a short all-in earlier this street means p may only call, not re-raise
  if (onlyCall[p]) { apply(p, 1, 0); return; }
  int mb = max_bet();
  int prevMin = lastRaise > BBv ? lastRaise : BBv;
  int minTo = mb + prevMin;
  int allinTo = bet_[p] + stack_[p];
  if (to > allinTo) to = allinTo;
  if (to < minTo && to < allinTo) to = minTo < allinTo ? minTo : allinTo;
  if (to <= mb) { apply(p, 1, 0); return; }
  int add = to - bet_[p];
  int raiseSize = to - mb;
  if (raiseSize >= prevMin) {
    // a full raise reopens the action for everyone
    for (int q = 0; q < NP; q++) onlyCall[q] = 0;
    if (raiseSize > lastRaise) lastRaise = raiseSize;
  } else {
    // an all-in for less than a min-raise: players who already acted may
    // call the extra but may not raise again (the real casino rule)
    for (int q = 0; q < NP; q++)
      if (q != p && acted[q]) onlyCall[q] = 1;
  }
  stack_[p] -= add;
  bet_[p] += add;
  contrib[p] += add;
  logev(p, tc > 0 ? 4 : 3, to);
  rangeCls[p] = rangeCls[p] < 2 ? 2 : 3;
  if (street == 0) prefAgg = p;
  acted[p] = 1;
  advance_after(p);
}

// ---- the bots ----
static void bot_act() {
  int me = turnSeat;
  const int act = count_active();
  const int base = 1000 / act; // multi-way baseline equity
  // difficulty knobs. easy: loose-passive, reads nothing, calls too much.
  const int jw = level == 0 ? 50 : level == 1 ? 30 : 12;
  const int trapRoll = level == 0 ? 0 : level == 2 ? 20 : 25;
  int raiseHi = base + (level == 0 ? 260 : 200);
  const int semiLo = base + 60;
  int semiRoll = level == 0 ? 0 : level == 2 ? 30 : 40;
  int rebluffRoll = level == 0 ? 0 : level == 2 ? 4 : 6;
  int stickyMargin = level == 0 ? 90 : 40;
  int stickyRoll = level == 0 ? 60 : level == 2 ? 8 : 25;
  int cbetRoll = level == 0 ? 0 : level == 2 ? 50 : 60;
  int lateBluffRoll = level == 0 ? 0 : level == 2 ? 6 : 10;
  int valueBet = base + (level == 0 ? 160 : level == 2 ? 100 : 120);
  int thinRoll = level == 0 ? 0 : 33;
  // each seat has a personality layered on top of the difficulty:
  // seat 1 Cal plays it straight; seat 2 Ruth is tight and honest; seat 3
  // Sal is wild and bluffy; seat 4 Moe calls everything and raises nothing
  if (me == 2) {
    raiseHi += 60; valueBet += 50;
    semiRoll -= 15; stickyRoll -= 12; lateBluffRoll /= 2; thinRoll -= 15;
  } else if (me == 3) {
    semiRoll += 25; rebluffRoll += 6; lateBluffRoll += 8;
    thinRoll += 15; cbetRoll += 20; stickyRoll += 10;
  } else if (me == 4) {
    stickyMargin = 130; stickyRoll = 75;
    raiseHi += 120; valueBet += 80;
    semiRoll = 8; rebluffRoll = 0; lateBluffRoll = 0; cbetRoll = 0; thinRoll = 0;
  }
  if (semiRoll < 0) semiRoll = 0;
  if (stickyRoll < 0) stickyRoll = 0;
  if (thinRoll < 0) thinRoll = 0;

  // easy bots read nothing: pretend everyone's range is "anything"
  int savedCls[MAXP];
  if (level == 0)
    for (int p = 0; p < NP; p++) { savedCls[p] = rangeCls[p]; rangeCls[p] = 0; }
  int e = equity_of(me, BOT_ITERS);
  if (level == 0)
    for (int p = 0; p < NP; p++) rangeCls[p] = savedCls[p];
  e += rnd(2 * jw) - jw;

  int tc = to_call_of(me);
  int potNow = pot_now();
  int roll = rnd(100);
  int frac = roll % 3;
  int sized = frac == 0 ? potNow / 2 : frac == 1 ? (potNow * 2) / 3 : potNow;
  if (sized < BBv) sized = BBv;

  if (tc > 0) {
    int po = tc * 1000 / (potNow + tc);
    if (e > base + 380 && roll < trapRoll) { apply(me, 1, 0); return; }
    if (e > raiseHi || (e > semiLo && roll < semiRoll)) {
      apply(me, 2, max_bet() + potNow);
      return;
    }
    if (e >= po) { apply(me, 1, 0); return; }
    if (roll < rebluffRoll && stack_[me] > potNow && act == 2) {
      apply(me, 2, max_bet() + potNow);
      return;
    }
    if (e >= po - stickyMargin && roll < stickyRoll) { apply(me, 1, 0); return; }
    apply(me, 0, 0);
    return;
  }

  if (street == 0) {
    if (e > base + 180 || (e > base + 80 && roll < (level == 0 ? 0 : 30))) {
      apply(me, 2, 3 * BBv);
      return;
    }
    apply(me, 1, 0);
    return;
  }
  if (street == 1 && prefAgg == me && roll < cbetRoll) {
    apply(me, 2, bet_[me] + sized);
    return;
  }
  // bluffs only heads-up: firing into a crowd is lighting chips on fire
  if (e > valueBet || (e > base + 40 && roll < thinRoll) ||
      (street >= 2 && act == 2 && roll < lateBluffRoll)) {
    apply(me, 2, bet_[me] + sized);
    return;
  }
  apply(me, 1, 0);
}

// ---- coach ----
static void coach_compute() {
  if (coachValid || over || turnSeat != 0) return;
  coachEqPm = equity_of(0, COACH_ITERS);
  int tc = to_call_of(0);
  int potNow = pot_now();
  coachPoPm = tc > 0 ? tc * 1000 / (potNow + tc) : 0;
  int base = 1000 / count_active();
  if (tc > 0) {
    if (coachEqPm > coachPoPm + 150 && coachEqPm > base + 100) coachAdv = 2;
    else if (coachEqPm >= coachPoPm) coachAdv = 1;
    else coachAdv = 0;
  } else {
    coachAdv = coachEqPm > base + 120 ? 2 : 1;
  }
  coachValid = 1;
}

// ---- hand-reading helpers ----
static int now_score() {
  if (boardCount == 0) {
    int r0 = holeC[0][0] >> 2, r1 = holeC[0][1] >> 2;
    if (r0 == r1) return (1 << 20) | (r0 << 16);
    int hi = r0 > r1 ? r0 : r1, lo = r0 > r1 ? r1 : r0;
    return (hi << 16) | (lo << 12);
  }
  int cs[7];
  cs[0] = holeC[0][0]; cs[1] = holeC[0][1];
  for (int i = 0; i < boardCount; i++) cs[2 + i] = board[i];
  int n = 2 + boardCount;
  if (n == 5) return eval5(cs);
  if (n == 6) {
    int best = -1, five[5];
    for (int skip = 0; skip < 6; skip++) {
      int k = 0;
      for (int i = 0; i < 6; i++)
        if (i != skip) five[k++] = cs[i];
      int s = eval5(five);
      if (s > best) best = s;
    }
    return best;
  }
  return eval7(cs);
}
static int count_outs() {
  if (boardCount < 3 || boardCount > 4) return -1;
  int baseCat = now_score() >> 20;
  int used[52] = {0};
  used[holeC[0][0]] = used[holeC[0][1]] = 1;
  for (int i = 0; i < boardCount; i++) used[board[i]] = 1;
  int hr0 = holeC[0][0] >> 2, hr1 = holeC[0][1] >> 2;
  int n = 0;
  for (int c = 0; c < 52; c++) {
    if (used[c]) continue;
    int r = c >> 2;
    int onBoard = 0;
    for (int i = 0; i < boardCount; i++)
      if ((board[i] >> 2) == r) onBoard = 1;
    if (onBoard && r != hr0 && r != hr1) continue;
    int cs[7];
    cs[0] = holeC[0][0]; cs[1] = holeC[0][1];
    for (int i = 0; i < boardCount; i++) cs[2 + i] = board[i];
    cs[2 + boardCount] = c;
    int m = 3 + boardCount;
    int best = -1, five[5];
    if (m == 6) {
      for (int skip = 0; skip < 6; skip++) {
        int k = 0;
        for (int i = 0; i < 6; i++)
          if (i != skip) five[k++] = cs[i];
        int s = eval5(five);
        if (s > best) best = s;
      }
    } else best = eval7(cs);
    if ((best >> 20) > baseCat) n++;
  }
  return n;
}

// ---- exports ----
extern "C" EXPORT("new_session") void new_session(u32 seed) {
  rng = seed ? seed : 0x2545F491u;
  handsPlayed = 0; profit = 0;
  nBest = 0; nOk = 0; nBad = 0;
  button = 1;
  over = 1;
  lastGrade = -1;
}
extern "C" EXPORT("set_players") void set_players(int n) {
  pendingNP = n < 2 ? 2 : n > MAXP ? MAXP : n;
}
extern "C" EXPORT("get_players") int get_players() { return NP; }
extern "C" EXPORT("set_level") void set_level(int l) { level = l < 0 ? 0 : l > 2 ? 2 : l; }
// 0 practice (stacks reset every hand), 1 bankroll (stacks carry; bust =
// rebuy), 2 tournament (blinds climb, busts are final; call again to restart)
extern "C" EXPORT("set_mode") void set_mode(int m) {
  mode = m < 0 ? 0 : m > 2 ? 2 : m;
  rebuysHero = 0;
  SBv = SB; BBv = BB;
  tHands = 0; tOver = 0;
  NP = pendingNP;
  for (int p = 0; p < MAXP; p++) {
    stack_[p] = STACK;
    outOf[p] = 0;
    placeP[p] = 0;
  }
}
extern "C" EXPORT("cur_sb") int cur_sb() { return SBv; }
extern "C" EXPORT("cur_bb") int cur_bb() { return BBv; }
extern "C" EXPORT("t_over") int t_over() { return tOver; }
extern "C" EXPORT("hero_place") int hero_place() { return placeP[0]; }
extern "C" EXPORT("p_out") int p_out(int p) { return placeP[p]; }
// hands until the blinds go up (0 when they're already at the cap)
extern "C" EXPORT("t_next_up") int t_next_up() {
  if (mode != 2 || tHands / T_HANDS_PER_LEVEL >= T_LEVELS - 1) return 0;
  return T_HANDS_PER_LEVEL - (tHands % T_HANDS_PER_LEVEL);
}
extern "C" EXPORT("get_mode") int get_mode() { return mode; }
extern "C" EXPORT("hero_rebuys") int hero_rebuys() { return rebuysHero; }
// 0 when a short all-in closed the action: the hero may call but not raise
extern "C" EXPORT("can_raise") int can_raise() {
  return (!over && turnSeat == 0 && !onlyCall[0] && stack_[0] > to_call_of(0)) ? 1 : 0;
}

extern "C" EXPORT("new_hand") void new_hand() {
  if (mode == 2) {
    if (tOver) return; // the tournament ended; start a new one instead
    int lvl = tHands / T_HANDS_PER_LEVEL;
    if (lvl >= T_LEVELS) lvl = T_LEVELS - 1;
    SBv = T_SB[lvl]; BBv = T_BB[lvl];
  } else {
    NP = pendingNP; // the tournament roster is locked; other modes resize
    SBv = SB; BBv = BB;
  }
  shuffle_deck();
  for (int p = 0; p < NP; p++) {
    holeC[p][0] = deck[2 * p];
    holeC[p][1] = deck[2 * p + 1];
    // practice tops everyone up; bankroll rebuys anyone who can no longer
    // post the big blind; a tournament bust is final
    if (mode == 0 || (mode == 1 && stack_[p] < BBv)) {
      if (mode == 1 && p == 0 && handsPlayed > 0) rebuysHero++;
      stack_[p] = STACK;
    }
    bet_[p] = 0; acted[p] = 0;
    folded[p] = outOf[p] ? 1 : 0; // the busted sit out permanently
    contrib[p] = 0; onlyCall[p] = 0;
    rangeCls[p] = 0; catP[p] = -1; maskP[p] = 0;
  }
  for (int i = 0; i < 5; i++) board[i] = deck[2 * MAXP + i];
  boardCount = 0; street = 0;
  button = next_alive(button);
  pot = 0; lastRaise = BBv;
  prefAgg = -1;
  over = 0; byFold = 0; showdown = 0; winners_ = 0;
  logN = 0;
  lastGrade = -1; lastAdvised = -1; lastEqPm = -1; lastPoPm = -1; lastActionCls = -1;
  heroStackAtDeal = stack_[0];
  // blinds: heads-up the button is the small blind; otherwise they're the
  // next two live seats, and the seat after the big blind opens
  int sbp, bbp;
  if (alive_count() == 2) {
    sbp = button;
    bbp = next_alive(button);
    turnSeat = sbp;
  } else {
    sbp = next_alive(button);
    bbp = next_alive(sbp);
    turnSeat = next_alive(bbp);
  }
  // short stacks post what they have (an all-in blind)
  int paySB = SBv < stack_[sbp] ? SBv : stack_[sbp];
  stack_[sbp] -= paySB; bet_[sbp] = paySB; contrib[sbp] = paySB; logev(sbp, 5, paySB);
  int payBB = BBv < stack_[bbp] ? BBv : stack_[bbp];
  stack_[bbp] -= payBB; bet_[bbp] = payBB; contrib[bbp] = payBB; logev(bbp, 6, payBB);
  coachValid = 0;
}

extern "C" EXPORT("hero_act") int hero_act(int cls, int to) {
  if (over || turnSeat != 0) return 0;
  coach_compute();
  lastAdvised = coachAdv; lastEqPm = coachEqPm; lastPoPm = coachPoPm;
  lastActionCls = cls;
  if (cls == coachAdv) { lastGrade = 2; nBest++; }
  else if (cls >= 1 && coachAdv >= 1) { lastGrade = 1; nOk++; }
  else { lastGrade = 0; nBad++; }
  apply(0, cls, to);
  return 1;
}

// one bot action; the UI calls this on a timer while it's a bot's turn
extern "C" EXPORT("bot_turn") int bot_turn() { return (!over && turnSeat != 0) ? 1 : 0; }
extern "C" EXPORT("cur_actor") int cur_actor() { return over ? -1 : turnSeat; }
extern "C" EXPORT("bot_step") void bot_step() {
  if (!over && turnSeat != 0) {
    bot_act();
    coachValid = 0;
  }
}

// coach, on demand (only meaningful when it's the hero's turn)
extern "C" EXPORT("coach_equity") int coach_equity() { coach_compute(); return coachEqPm; }
extern "C" EXPORT("coach_pot_odds") int coach_pot_odds() { coach_compute(); return coachPoPm; }
extern "C" EXPORT("coach_advice") int coach_advice() { coach_compute(); return coachAdv; }
extern "C" EXPORT("now_cat") int now_cat() { return now_score() >> 20; }
extern "C" EXPORT("outs") int outs() { return count_outs(); }
extern "C" EXPORT("hand_chen") int hand_chen() { return chen2(holeC[0][0], holeC[0][1]); }

// last graded decision
extern "C" EXPORT("last_grade") int last_grade() { return lastGrade; }
extern "C" EXPORT("last_advised") int last_advised() { return lastAdvised; }
extern "C" EXPORT("last_equity") int last_equity() { return lastEqPm; }
extern "C" EXPORT("last_pot_odds") int last_pot_odds() { return lastPoPm; }
extern "C" EXPORT("last_action_cls") int last_action_cls() { return lastActionCls; }

// per-seat state (seat 0 = hero). Bot hole cards hide until showdown.
// hero cards always show; bots only at a showdown they reached (players
// busted in earlier hands sit folded, so they stay hidden automatically)
extern "C" EXPORT("p_card") int p_card(int p, int i) {
  if (p < 0 || p >= NP) return -1;
  if (p != 0 && !(showdown && !folded[p])) return -1;
  return holeC[p][i & 1];
}
extern "C" EXPORT("p_stack") int p_stack(int p) { return stack_[p]; }
extern "C" EXPORT("p_bet") int p_bet(int p) { return bet_[p]; }
extern "C" EXPORT("p_folded") int p_folded(int p) { return folded[p]; }
extern "C" EXPORT("p_range") int p_range(int p) { return rangeCls[p]; }
extern "C" EXPORT("p_cat") int p_cat(int p) { return catP[p]; }
extern "C" EXPORT("p_mask") int p_mask(int p) { return showdown ? maskP[p] : 0; }
extern "C" EXPORT("is_button") int is_button(int p) { return p == button ? 1 : 0; }

extern "C" EXPORT("board_card") int board_card(int i) {
  return (i >= 0 && i < boardCount) ? board[i] : -1;
}
extern "C" EXPORT("board_count") int board_count() { return boardCount; }
extern "C" EXPORT("get_street") int get_street() { return street; }
extern "C" EXPORT("get_pot") int get_pot() { return pot_now(); }
extern "C" EXPORT("to_call") int to_call() { return to_call_of(0); }
extern "C" EXPORT("hero_turn") int hero_turn() { return (!over && turnSeat == 0) ? 1 : 0; }
extern "C" EXPORT("hand_over") int hand_over() { return over; }
extern "C" EXPORT("by_fold") int by_fold_() { return byFold; }
extern "C" EXPORT("winners") int winners() { return winners_; }
extern "C" EXPORT("min_raise_to") int min_raise_to() {
  int m = max_bet() + (lastRaise > BBv ? lastRaise : BBv);
  int allin = bet_[0] + stack_[0];
  return m < allin ? m : allin;
}
extern "C" EXPORT("max_raise_to") int max_raise_to() { return bet_[0] + stack_[0]; }

// session stats
extern "C" EXPORT("hands_played") int hands_played() { return handsPlayed; }
extern "C" EXPORT("session_profit") int session_profit() { return profit; }
extern "C" EXPORT("n_best") int n_best() { return nBest; }
extern "C" EXPORT("n_ok") int n_ok() { return nOk; }
extern "C" EXPORT("n_bad") int n_bad() { return nBad; }

// action log
extern "C" EXPORT("log_count") int log_count() { return logN; }
extern "C" EXPORT("log_actor") int log_actor_(int i) { return logActor[i]; }
extern "C" EXPORT("log_action") int log_action_(int i) { return logAct[i]; }
extern "C" EXPORT("log_amount") int log_amount_(int i) { return logAmt[i]; }
extern "C" EXPORT("log_street") int log_street_(int i) { return logStreet[i]; }
