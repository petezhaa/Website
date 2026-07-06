// poker.cpp — heads-up Texas Hold'em trainer, freestanding C++ -> wasm32.
// The engine deals, runs the betting, plays the bot, and coaches: at every
// hero decision it computes hand equity with a Monte Carlo simulation and
// compares the action taken against the pot odds. Pure integer logic plus a
// xorshift PRNG, no libc/libm. React only draws.
//
// Build: clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry
//              -o public/poker.bin cpp/poker.cpp

#define EXPORT(n) __attribute__((export_name(n)))
typedef unsigned int u32;

// ---- config ----
static const int STACK = 1000; // both players top up to this every hand
static const int SB = 5, BB = 10;
static const int COACH_ITERS = 1500; // Monte Carlo samples for the coach
static const int BOT_ITERS = 600;    // the bot thinks a little less hard

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
  // distinct ranks, high to low, with counts
  int ur[5], uc[5], nu = 0;
  for (int r = 12; r >= 0; r--)
    if (cnt[r]) { ur[nu] = r; uc[nu] = cnt[r]; nu++; }
  // straight (needs 5 distinct ranks)
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
  // sort unique ranks by count desc, then rank desc (stable insertion)
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

// best 5-card score out of 7 cards
static int eval7(const int *cs) {
  int best = -1, five[5];
  for (int a = 0; a < 7; a++)
    for (int b = a + 1; b < 7; b++) {
      int n = 0;
      for (int i = 0; i < 7; i++)
        if (i != a && i != b) five[n++] = cs[i];
      int s = eval5(five);
      if (s > best) best = s;
    }
  return best;
}

// ---- game state ----
static int heroCards[2], botCards[2], board[5];
static int boardCount = 0;   // visible board cards
static int street = 0;       // 0 pre, 1 flop, 2 turn, 3 river
static int button = 1;       // player index on the button (0 hero, 1 bot); alternates
static int stack_[2], bet_[2], acted[2];
static int pot = 0;          // chips from completed streets
static int lastRaise = BB;   // size of the last raise on this street
static int turn = 0;         // whose turn (0 hero, 1 bot)
static int over = 1;         // hand over flag
static int result_ = 0;      // 0 ongoing, 1 hero won, 2 bot won, 3 split
static int byFold = 0;
static int showdown = 0;     // bot cards revealed
static int heroCat = -1, botCat = -1;
static int heroStackAtDeal = 0;

// session
static int handsPlayed = 0, profit = 0;
static int nBest = 0, nOk = 0, nBad = 0;

// coach cache for the current decision point
static int coachValid = 0;
static int coachEqPm = 0;    // hero equity, per-mille
static int coachPoPm = 0;    // pot odds, per-mille
static int coachAdv = 1;     // 0 fold, 1 check/call, 2 bet/raise
// last graded hero action
static int lastGrade = -1;   // 2 best, 1 ok, 0 mistake, -1 none yet
static int lastAdvised = -1, lastEqPm = -1, lastPoPm = -1, lastActionCls = -1;

// action log: (actor, action, amount, street)
// actions: 0 fold, 1 check, 2 call, 3 bet, 4 raise, 5 SB, 6 BB,
//          7 flop, 8 turn, 9 river, 10 showdown
static const int LOGMAX = 96;
static int logActor[LOGMAX], logAct[LOGMAX], logAmt[LOGMAX], logStreet[LOGMAX];
static int logN = 0;
static void logev(int actor, int act, int amt) {
  if (logN < LOGMAX) {
    logActor[logN] = actor; logAct[logN] = act;
    logAmt[logN] = amt; logStreet[logN] = street; logN++;
  }
}

// ---- Monte Carlo equity: my two cards + visible board vs one random hand ----
static int equity_pm(const int *mine, int iters) {
  int used[52] = {0};
  used[mine[0]] = used[mine[1]] = 1;
  for (int i = 0; i < boardCount; i++) used[board[i]] = 1;
  int avail[52], na = 0;
  for (int c = 0; c < 52; c++)
    if (!used[c]) avail[na++] = c;

  int need = 2 + (5 - boardCount);
  int win2 = 0; // wins*2 + ties
  int pick[7];
  for (int it = 0; it < iters; it++) {
    // partial Fisher-Yates: draw `need` cards from avail
    for (int i = 0; i < need; i++) {
      int j = i + rnd(na - i);
      int t = avail[i]; avail[i] = avail[j]; avail[j] = t;
      pick[i] = avail[i];
    }
    int h7[7], v7[7];
    h7[0] = mine[0]; h7[1] = mine[1];
    v7[0] = pick[0]; v7[1] = pick[1];
    for (int i = 0; i < boardCount; i++) { h7[2 + i] = board[i]; v7[2 + i] = board[i]; }
    for (int i = 0; i < 5 - boardCount; i++) {
      h7[2 + boardCount + i] = pick[2 + i];
      v7[2 + boardCount + i] = pick[2 + i];
    }
    int hs = eval7(h7), vs = eval7(v7);
    if (hs > vs) win2 += 2;
    else if (hs == vs) win2 += 1;
  }
  return win2 * 500 / iters; // per-mille
}

// ---- betting helpers ----
static int to_call_of(int p) {
  int d = bet_[1 - p] - bet_[p];
  return d > 0 ? d : 0;
}
static void settle_bets() {
  // an all-in call can leave bets unequal: refund the excess
  if (bet_[0] != bet_[1]) {
    int hi = bet_[0] > bet_[1] ? 0 : 1;
    int excess = bet_[hi] - bet_[1 - hi];
    bet_[hi] -= excess;
    stack_[hi] += excess;
  }
  pot += bet_[0] + bet_[1];
  bet_[0] = bet_[1] = 0;
  acted[0] = acted[1] = 0;
  lastRaise = BB;
}
static void do_showdown() {
  int h7[7], b7[7];
  h7[0] = heroCards[0]; h7[1] = heroCards[1];
  b7[0] = botCards[0];  b7[1] = botCards[1];
  for (int i = 0; i < 5; i++) { h7[2 + i] = board[i]; b7[2 + i] = board[i]; }
  int hs = eval7(h7), bs = eval7(b7);
  heroCat = hs >> 20; botCat = bs >> 20;
  showdown = 1;
  logev(2, 10, 0);
  if (hs > bs) { stack_[0] += pot; result_ = 1; }
  else if (bs > hs) { stack_[1] += pot; result_ = 2; }
  else { stack_[0] += pot / 2; stack_[1] += pot - pot / 2; result_ = 3; }
  pot = 0;
  over = 1;
  byFold = 0;
  profit += stack_[0] - heroStackAtDeal;
  handsPlayed++;
}
static void deal_next_street() {
  street++;
  boardCount = street == 1 ? 3 : (street == 2 ? 4 : 5);
  logev(2, 6 + street, 0); // 7 flop, 8 turn, 9 river
  turn = 1 - button; // out of position acts first postflop
  coachValid = 0;
}
static void end_hand_by_fold(int folder) {
  settle_bets();
  stack_[1 - folder] += pot;
  pot = 0;
  result_ = folder == 0 ? 2 : 1;
  byFold = 1;
  over = 1;
  profit += stack_[0] - heroStackAtDeal;
  handsPlayed++;
}
// returns 1 if the street (or hand) advanced
static int maybe_advance() {
  int settled = (acted[0] && acted[1] && bet_[0] == bet_[1]);
  // an all-in call for less than the bet also ends the action
  for (int p = 0; p < 2; p++)
    if (stack_[p] == 0 && acted[p] && acted[1 - p] && bet_[p] <= bet_[1 - p])
      settled = 1;
  if (!settled) return 0;
  settle_bets();
  // someone all-in: run out the board and show down
  if (stack_[0] == 0 || stack_[1] == 0) {
    while (boardCount < 5) {
      street = street < 3 ? street + 1 : 3;
      boardCount = street == 1 ? 3 : (street == 2 ? 4 : 5);
      logev(2, 6 + street, 0);
    }
    do_showdown();
    return 1;
  }
  if (street == 3) { do_showdown(); return 1; }
  deal_next_street();
  return 1;
}

// perform an action for player p. cls: 0 fold, 1 check/call, 2 raise-to `to`.
static void apply(int p, int cls, int to) {
  int tc = to_call_of(p);
  if (cls == 0) {
    logev(p, 0, 0);
    end_hand_by_fold(p);
    return;
  }
  if (cls == 1) {
    int pay = tc > stack_[p] ? stack_[p] : tc;
    stack_[p] -= pay;
    bet_[p] += pay;
    logev(p, tc > 0 ? 2 : 1, pay);
    acted[p] = 1;
    if (!maybe_advance()) turn = 1 - p;
    return;
  }
  // raise to `to` (total this street), clamped to legal range
  int minTo = bet_[1 - p] + (lastRaise > BB ? lastRaise : BB);
  int allinTo = bet_[p] + stack_[p];
  if (to > allinTo) to = allinTo;
  if (to < minTo && to < allinTo) to = minTo < allinTo ? minTo : allinTo;
  if (to <= bet_[1 - p]) { // can't actually raise: treat as call
    apply(p, 1, 0);
    return;
  }
  int add = to - bet_[p];
  int raiseSize = to - bet_[1 - p];
  if (raiseSize > lastRaise) lastRaise = raiseSize;
  stack_[p] -= add;
  bet_[p] += add;
  logev(p, tc > 0 ? 4 : 3, to);
  acted[p] = 1;
  acted[1 - p] = 0;
  if (!maybe_advance()) turn = 1 - p;
}

// ---- the bot ----
static void bot_act() {
  int e = equity_pm(botCards, BOT_ITERS); // per-mille vs a random hand
  int tc = to_call_of(1);
  int jitter = rnd(60) - 30; // +-3% so it isn't a fixed book
  e += jitter;
  if (tc > 0) {
    int po = tc * 1000 / (pot + bet_[0] + bet_[1] + tc);
    if (e < po - 30) { apply(1, 0, 0); return; }
    if (e > 700 || (e > 560 && rnd(2))) {
      int target = bet_[0] + (pot + bet_[0] + bet_[1]); // pot-size raise
      apply(1, 2, target);
      return;
    }
    apply(1, 1, 0);
    return;
  }
  // no bet to face
  if (street == 0 && button == 0 && bet_[0] == BB && bet_[1] == BB) {
    // limped pot, bot in BB: raise strong hands
    if (e > 580) { apply(1, 2, 3 * BB); return; }
    apply(1, 1, 0);
    return;
  }
  if (e > 620 || (e > 540 && rnd(3) == 0)) {
    int p = pot + bet_[0] + bet_[1];
    int b = (p * 2) / 3;
    if (b < BB) b = BB;
    apply(1, 2, bet_[1] + b);
    return;
  }
  apply(1, 1, 0);
}
static void run_bot() {
  while (!over && turn == 1) bot_act();
  coachValid = 0;
}

// ---- coach ----
static void coach_compute() {
  if (coachValid || over || turn != 0) return;
  coachEqPm = equity_pm(heroCards, COACH_ITERS);
  int tc = to_call_of(0);
  int potNow = pot + bet_[0] + bet_[1];
  coachPoPm = tc > 0 ? tc * 1000 / (potNow + tc) : 0;
  if (tc > 0) {
    if (coachEqPm > coachPoPm + 150 && coachEqPm > 600) coachAdv = 2;
    else if (coachEqPm >= coachPoPm) coachAdv = 1;
    else coachAdv = 0;
  } else {
    coachAdv = coachEqPm > 620 ? 2 : 1;
  }
  coachValid = 1;
}

// ---- hand-reading helpers for the coach ----
// hero's best current score using only the visible board
static int now_score() {
  if (boardCount == 0) {
    int r0 = heroCards[0] >> 2, r1 = heroCards[1] >> 2;
    if (r0 == r1) return (1 << 20) | (r0 << 16); // pocket pair
    int hi = r0 > r1 ? r0 : r1, lo = r0 > r1 ? r1 : r0;
    return (hi << 16) | (lo << 12); // high card
  }
  int cs[7];
  cs[0] = heroCards[0]; cs[1] = heroCards[1];
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

// rough outs count on the flop or turn: unseen cards that raise the hero's
// hand category. Cards that only pair the board (helping any two cards
// equally) are not counted unless the hero holds that rank too.
static int count_outs() {
  if (boardCount < 3 || boardCount > 4) return -1;
  int baseCat = now_score() >> 20;
  int used[52] = {0};
  used[heroCards[0]] = used[heroCards[1]] = 1;
  for (int i = 0; i < boardCount; i++) used[board[i]] = 1;
  int hr0 = heroCards[0] >> 2, hr1 = heroCards[1] >> 2;
  int n = 0;
  for (int c = 0; c < 52; c++) {
    if (used[c]) continue;
    int r = c >> 2;
    int onBoard = 0;
    for (int i = 0; i < boardCount; i++)
      if ((board[i] >> 2) == r) onBoard = 1;
    if (onBoard && r != hr0 && r != hr1) continue; // pairs the board, not us
    // evaluate with the extra card
    int cs[7];
    cs[0] = heroCards[0]; cs[1] = heroCards[1];
    for (int i = 0; i < boardCount; i++) cs[2 + i] = board[i];
    cs[2 + boardCount] = c;
    int m = 3 + boardCount; // 6 or 7
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
  stack_[0] = stack_[1] = STACK;
  button = 1;
  over = 1;
  lastGrade = -1;
}

extern "C" EXPORT("new_hand") void new_hand() {
  stack_[0] = stack_[1] = STACK; // top up; profit tracks the running total
  shuffle_deck();
  heroCards[0] = deck[0]; heroCards[1] = deck[1];
  botCards[0] = deck[2];  botCards[1] = deck[3];
  for (int i = 0; i < 5; i++) board[i] = deck[4 + i];
  boardCount = 0; street = 0;
  button = 1 - button;
  pot = 0; bet_[0] = bet_[1] = 0;
  acted[0] = acted[1] = 0;
  lastRaise = BB;
  over = 0; result_ = 0; byFold = 0; showdown = 0;
  heroCat = -1; botCat = -1;
  logN = 0;
  lastGrade = -1; lastAdvised = -1; lastEqPm = -1; lastPoPm = -1; lastActionCls = -1;
  heroStackAtDeal = STACK;
  // blinds: button posts SB, other posts BB
  int sbp = button, bbp = 1 - button;
  stack_[sbp] -= SB; bet_[sbp] = SB; logev(sbp, 5, SB);
  stack_[bbp] -= BB; bet_[bbp] = BB; logev(bbp, 6, BB);
  turn = button; // button acts first preflop heads-up
  coachValid = 0;
  run_bot();
}

// hero action. cls: 0 fold, 1 check/call, 2 raise to `to` chips this street.
extern "C" EXPORT("hero_act") int hero_act(int cls, int to) {
  if (over || turn != 0) return 0;
  coach_compute(); // grade against the coach's numbers for this spot
  lastAdvised = coachAdv; lastEqPm = coachEqPm; lastPoPm = coachPoPm;
  lastActionCls = cls;
  if (cls == coachAdv) { lastGrade = 2; nBest++; }
  else if (cls >= 1 && coachAdv >= 1) { lastGrade = 1; nOk++; }
  else { lastGrade = 0; nBad++; }
  apply(0, cls, to);
  if (!over) run_bot();
  return 1;
}

// coach, on demand (only meaningful when it's the hero's turn)
extern "C" EXPORT("coach_equity") int coach_equity() { coach_compute(); return coachEqPm; }
extern "C" EXPORT("coach_pot_odds") int coach_pot_odds() { coach_compute(); return coachPoPm; }
extern "C" EXPORT("coach_advice") int coach_advice() { coach_compute(); return coachAdv; }
// what the hero currently holds (category with the visible board) and a
// rough outs count on the flop/turn (-1 when it doesn't apply)
extern "C" EXPORT("now_cat") int now_cat() { return now_score() >> 20; }
extern "C" EXPORT("outs") int outs() { return count_outs(); }

// last graded decision
extern "C" EXPORT("last_grade") int last_grade() { return lastGrade; }
extern "C" EXPORT("last_advised") int last_advised() { return lastAdvised; }
extern "C" EXPORT("last_equity") int last_equity() { return lastEqPm; }
extern "C" EXPORT("last_pot_odds") int last_pot_odds() { return lastPoPm; }
extern "C" EXPORT("last_action_cls") int last_action_cls() { return lastActionCls; }

// state getters
extern "C" EXPORT("hero_card") int hero_card(int i) { return heroCards[i & 1]; }
extern "C" EXPORT("bot_card") int bot_card(int i) { return showdown ? botCards[i & 1] : -1; }
extern "C" EXPORT("board_card") int board_card(int i) {
  return (i >= 0 && i < boardCount) ? board[i] : -1;
}
extern "C" EXPORT("board_count") int board_count() { return boardCount; }
extern "C" EXPORT("get_street") int get_street() { return street; }
extern "C" EXPORT("get_pot") int get_pot() { return pot + bet_[0] + bet_[1]; }
extern "C" EXPORT("hero_stack") int hero_stack() { return stack_[0]; }
extern "C" EXPORT("bot_stack") int bot_stack() { return stack_[1]; }
extern "C" EXPORT("hero_bet") int hero_bet() { return bet_[0]; }
extern "C" EXPORT("bot_bet") int bot_bet() { return bet_[1]; }
extern "C" EXPORT("to_call") int to_call() { return to_call_of(0); }
extern "C" EXPORT("hero_turn") int hero_turn() { return (!over && turn == 0) ? 1 : 0; }
extern "C" EXPORT("hand_over") int hand_over() { return over; }
extern "C" EXPORT("get_result") int get_result() { return result_; }
extern "C" EXPORT("by_fold") int by_fold_() { return byFold; }
extern "C" EXPORT("hero_button") int hero_button() { return button == 0 ? 1 : 0; }
extern "C" EXPORT("min_raise_to") int min_raise_to() {
  int m = bet_[1] + (lastRaise > BB ? lastRaise : BB);
  int allin = bet_[0] + stack_[0];
  return m < allin ? m : allin;
}
extern "C" EXPORT("max_raise_to") int max_raise_to() { return bet_[0] + stack_[0]; }
extern "C" EXPORT("hero_cat") int hero_cat_() { return heroCat; }
extern "C" EXPORT("bot_cat") int bot_cat_() { return botCat; }

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
