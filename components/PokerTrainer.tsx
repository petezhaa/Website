"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bumpVibe } from "@/lib/vibeBus";

// Heads-up Texas Hold'em against a bot, with a coach. The C++ engine deals,
// runs the betting, and computes hand equity with a Monte Carlo simulation at
// every decision. The coach compares what you did against the pot odds and
// keeps score, so you can see which habits are losing you money.

type Engine = {
  new_session: (seed: number) => void;
  new_hand: () => void;
  hero_act: (cls: number, to: number) => number;
  coach_equity: () => number;
  coach_pot_odds: () => number;
  coach_advice: () => number;
  now_cat: () => number;
  outs: () => number;
  last_grade: () => number;
  last_advised: () => number;
  last_equity: () => number;
  last_pot_odds: () => number;
  last_action_cls: () => number;
  hero_card: (i: number) => number;
  bot_card: (i: number) => number;
  board_card: (i: number) => number;
  board_count: () => number;
  get_street: () => number;
  get_pot: () => number;
  hero_stack: () => number;
  bot_stack: () => number;
  hero_bet: () => number;
  bot_bet: () => number;
  to_call: () => number;
  hero_turn: () => number;
  hand_over: () => number;
  get_result: () => number;
  by_fold: () => number;
  hero_button: () => number;
  min_raise_to: () => number;
  max_raise_to: () => number;
  hero_cat: () => number;
  bot_cat: () => number;
  hands_played: () => number;
  session_profit: () => number;
  n_best: () => number;
  n_ok: () => number;
  n_bad: () => number;
  log_count: () => number;
  log_actor: (i: number) => number;
  log_action: (i: number) => number;
  log_amount: (i: number) => number;
};

const RANKS = "23456789TJQKA";
const SUITS = ["♠", "♥", "♦", "♣"];
const CATS = [
  "high card", "a pair", "two pair", "three of a kind", "a straight",
  "a flush", "a full house", "four of a kind", "a straight flush",
];
const ADVICE = ["fold", "check or call", "bet or raise"];

function Card({ c, hidden = false }: { c: number; hidden?: boolean }) {
  if (hidden)
    return (
      <div
        className="grid h-16 w-11 place-items-center rounded-md border border-line sm:h-20 sm:w-14"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--surface-2) 0 4px, var(--surface) 4px 8px)",
        }}
      />
    );
  if (c < 0)
    return <div className="h-16 w-11 rounded-md border border-dashed border-line sm:h-20 sm:w-14" />;
  const red = (c & 3) === 1 || (c & 3) === 2;
  return (
    <div className="flex h-16 w-11 flex-col items-center justify-center rounded-md border border-line bg-surface shadow-sm sm:h-20 sm:w-14">
      <span
        className={`font-serif text-lg font-semibold leading-none sm:text-xl ${red ? "" : "text-fg"}`}
        style={red ? { color: "#b0483f" } : undefined}
      >
        {RANKS[c >> 2]}
      </span>
      <span
        className={`text-base leading-none sm:text-lg ${red ? "" : "text-fg"}`}
        style={red ? { color: "#b0483f" } : undefined}
      >
        {SUITS[c & 3]}
      </span>
    </div>
  );
}

type Snap = {
  hero: [number, number];
  bot: [number, number];
  board: number[];
  pot: number;
  heroStack: number;
  botStack: number;
  toCall: number;
  heroTurn: boolean;
  over: boolean;
  result: number;
  byFold: boolean;
  heroButton: boolean;
  minTo: number;
  maxTo: number;
  heroCat: number;
  botCat: number;
  hands: number;
  profit: number;
  nBest: number;
  nOk: number;
  nBad: number;
  grade: number;
  lastEq: number;
  lastPo: number;
  lastAdv: number;
  lastCls: number;
  coachEq: number;
  coachPo: number;
  coachAdv: number;
  nowCat: number;
  outs: number;
  street: number;
  log: string[];
};

const round5 = (n: number) => Math.round(n / 5) * 5;

export function PokerTrainer() {
  const engRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [coachOn, setCoachOn] = useState(true);
  const [s, setS] = useState<Snap | null>(null);

  const snap = useCallback((withCoach: boolean): Snap => {
    const e = engRef.current!;
    const log: string[] = [];
    const botVerbs = ["folds", "checks", "calls", "bets", "raises to", "posts small blind", "posts big blind"];
    const youVerbs = ["fold", "check", "call", "bet", "raise to", "post small blind", "post big blind"];
    for (let i = 0; i < e.log_count(); i++) {
      const actor = e.log_actor(i);
      const act = e.log_action(i);
      const amt = e.log_amount(i);
      if (act === 7) log.push("(flop)");
      else if (act === 8) log.push("(turn)");
      else if (act === 9) log.push("(river)");
      else if (act === 10) log.push("(showdown)");
      else {
        const who = actor === 0 ? "You" : "Bot";
        const v = actor === 0 ? youVerbs[act] : botVerbs[act];
        log.push(amt > 0 && act !== 1 && act !== 0 ? `${who} ${v} ${amt}` : `${who} ${v}`);
      }
    }
    const heroTurn = !!e.hero_turn();
    return {
      hero: [e.hero_card(0), e.hero_card(1)],
      bot: [e.bot_card(0), e.bot_card(1)],
      board: [0, 1, 2, 3, 4].map((i) => e.board_card(i)),
      pot: e.get_pot(),
      heroStack: e.hero_stack(),
      botStack: e.bot_stack(),
      toCall: e.to_call(),
      heroTurn,
      over: !!e.hand_over(),
      result: e.get_result(),
      byFold: !!e.by_fold(),
      heroButton: !!e.hero_button(),
      minTo: e.min_raise_to(),
      maxTo: e.max_raise_to(),
      heroCat: e.hero_cat(),
      botCat: e.bot_cat(),
      hands: e.hands_played(),
      profit: e.session_profit(),
      nBest: e.n_best(),
      nOk: e.n_ok(),
      nBad: e.n_bad(),
      grade: e.last_grade(),
      lastEq: e.last_equity(),
      lastPo: e.last_pot_odds(),
      lastAdv: e.last_advised(),
      lastCls: e.last_action_cls(),
      coachEq: withCoach && heroTurn ? e.coach_equity() : -1,
      coachPo: withCoach && heroTurn ? e.coach_pot_odds() : -1,
      coachAdv: withCoach && heroTurn ? e.coach_advice() : -1,
      nowCat: heroTurn ? e.now_cat() : -1,
      outs: heroTurn ? e.outs() : -1,
      street: e.get_street(),
      log,
    };
  }, []);

  const deal = useCallback(() => {
    const e = engRef.current;
    if (!e) return;
    e.new_hand();
    setS(snap(true));
    bumpVibe("gamer", 6);
  }, [snap]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // the ?v pairs this JS with the engine build it needs: the engine is
        // cached hard (browser + service worker), so any change to the
        // exports must bump this together with the .bin
        const buf = await fetch("/poker.bin?v=2").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const e = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engRef.current = e;
        e.new_session((Date.now() & 0xffffffff) >>> 0);
        e.new_hand();
        setS(snap(true));
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [snap]);

  const act = (cls: number, to = 0) => {
    const e = engRef.current;
    if (!e || !s || !s.heroTurn) return;
    e.hero_act(cls, to);
    setS(snap(true));
    bumpVibe("curiosity", 4);
  };

  if (failed)
    return <p className="text-sm text-muted">couldn&apos;t load the wasm engine.</p>;
  if (!ready || !s)
    return (
      <div className="panel grid h-40 place-items-center">
        <p className="animate-pulse text-sm text-muted">shuffling…</p>
      </div>
    );

  // raise to = my current bet + the call + a fraction of the pot after calling
  const heroBetNow = s.maxTo - s.heroStack; // maxTo is my bet plus my stack
  const potAfterCall = s.pot + s.toCall;
  const halfPotTo = round5(heroBetNow + s.toCall + Math.round(potAfterCall * 0.5));
  const potTo = round5(heroBetNow + s.toCall + potAfterCall);
  const clamp = (t: number) => Math.max(s.minTo, Math.min(s.maxTo, round5(t)));
  const accuracyDen = s.nBest + s.nOk + s.nBad;
  const accuracy = accuracyDen ? Math.round(((s.nBest + s.nOk) / accuracyDen) * 100) : 100;

  // what the hero holds, in words
  const holdingLine = () => {
    if (s.street === 0) {
      const [a, b] = s.hero;
      const ra = a >> 2, rb = b >> 2;
      if (ra === rb) return `You hold a pair of ${RANKS[ra]}s in the hole.`;
      const hi = RANKS[Math.max(ra, rb)], lo = RANKS[Math.min(ra, rb)];
      const suited = (a & 3) === (b & 3);
      return `You hold ${hi}${lo} ${suited ? "suited" : "offsuit"}.`;
    }
    if (s.nowCat <= 0) return "You have no made hand yet, just high cards.";
    return `You have ${CATS[s.nowCat]} right now.`;
  };
  // outs, with the rule of 4 and 2
  const outsLine = () => {
    if (s.outs <= 0 || s.street < 1 || s.street > 2) return null;
    const mult = s.street === 1 ? 4 : 2;
    const pct = Math.min(95, s.outs * mult);
    return `About ${s.outs} cards improve your hand. The shortcut: ${s.outs} outs times ${mult} is roughly ${pct}% to hit ${s.street === 1 ? "by the river" : "on the river"}.`;
  };
  // the call, priced in chips
  const evLine = () => {
    if (s.toCall <= 0 || s.coachEq < 0) return null;
    const ev = Math.round((s.coachEq / 1000) * (s.pot + s.toCall) - s.toCall);
    return `Calling ${s.toCall} into a ${s.pot} pot: at ${(s.coachEq / 10).toFixed(0)}% equity that call averages ${ev >= 0 ? "+" : ""}${ev} chips.`;
  };

  const resultLine = () => {
    if (!s.over) return null;
    if (s.byFold) return s.result === 1 ? "The bot folded. You win the pot." : "You folded.";
    if (s.result === 3) return `Split pot. Both had ${CATS[s.heroCat] ?? ""}.`;
    if (s.result === 1) return `You win with ${CATS[s.heroCat] ?? ""} against ${CATS[s.botCat] ?? ""}.`;
    return `The bot wins with ${CATS[s.botCat] ?? ""} against your ${CATS[s.heroCat] ?? ""}.`;
  };

  const feedback = () => {
    if (s.grade < 0 || s.lastEq < 0) return null;
    const eq = (s.lastEq / 10).toFixed(0);
    const po = (s.lastPo / 10).toFixed(0);
    const edge = Math.abs((s.lastEq - s.lastPo) / 10).toFixed(0);
    if (s.grade === 2) {
      if (s.lastPo > 0)
        return { cls: "text-moss", text: `Good decision. You had ${eq}% equity against a ${po}% price, a ${edge} point edge. Decisions like that are where the profit comes from.` };
      return { cls: "text-moss", text: `Good decision. With ${eq}% equity, ${ADVICE[s.lastAdv]} was the right line there.` };
    }
    if (s.grade === 1)
      return { cls: "text-gold", text: `Reasonable, but the coach preferred ${ADVICE[s.lastAdv]}. At ${eq}% equity you can play that hand harder than you did.` };
    if (s.lastCls === 0)
      return { cls: "text-accent", text: `Mistake. You folded with ${eq}% equity when the price only asked for ${po}%. You were ${edge} points ahead and let it go; folds like that quietly drain a bankroll.` };
    return { cls: "text-accent", text: `Mistake. You put chips in with ${eq}% equity against a ${po}% price. You were ${edge} points short, and no single lucky river changes that math.` };
  };
  const fb = feedback();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* ---- the table ---- */}
        <div className="panel p-5">
          {/* bot row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Card c={s.bot[0]} hidden={s.bot[0] < 0} />
              <Card c={s.bot[1]} hidden={s.bot[1] < 0} />
              <div>
                <p className="text-sm font-medium">
                  Bot {!s.heroButton && <span className="ml-1 rounded-full border border-line px-1.5 text-[9px] uppercase tracking-wide text-muted">dealer</span>}
                </p>
                <p className="font-mono text-xs text-muted">{s.botStack}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted">pot</p>
              <p className="font-mono text-2xl font-bold text-fg">{s.pot}</p>
            </div>
          </div>

          {/* board */}
          <div className="my-5 flex justify-center gap-2">
            {s.board.map((c, i) => <Card key={i} c={c} />)}
          </div>

          {/* hero row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Card c={s.hero[0]} />
              <Card c={s.hero[1]} />
              <div>
                <p className="text-sm font-medium">
                  You {s.heroButton && <span className="ml-1 rounded-full border border-line px-1.5 text-[9px] uppercase tracking-wide text-muted">dealer</span>}
                </p>
                <p className="font-mono text-xs text-muted">{s.heroStack}</p>
              </div>
            </div>
            {!s.over && s.toCall > 0 && (
              <p className="font-mono text-xs text-muted">{s.toCall} to call</p>
            )}
          </div>

          {/* actions */}
          <div className="mt-5 flex flex-wrap gap-2">
            {s.over ? (
              <>
                <p className="w-full text-sm">{resultLine()}</p>
                <button onClick={deal} className="btn-solid px-5 py-2.5 text-sm">
                  Next hand
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => act(0)}
                  disabled={!s.heroTurn}
                  className="rounded-md border-2 border-accent/60 bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/15 disabled:opacity-40"
                >
                  Fold
                </button>
                <button
                  onClick={() => act(1)}
                  disabled={!s.heroTurn}
                  className="rounded-md border-2 border-moss/60 bg-moss/10 px-4 py-2.5 text-sm font-medium text-moss transition hover:bg-moss/20 disabled:opacity-40"
                >
                  {s.toCall > 0 ? `Call ${Math.min(s.toCall, s.heroStack)}` : "Check"}
                </button>
                {s.maxTo > s.toCall && (
                  <>
                    <button onClick={() => act(2, clamp(halfPotTo))} disabled={!s.heroTurn} className="btn-term px-3.5 py-2.5 text-sm disabled:opacity-40">
                      {s.toCall > 0 ? "Raise" : "Bet"} ½ pot
                    </button>
                    <button onClick={() => act(2, clamp(potTo))} disabled={!s.heroTurn} className="btn-term px-3.5 py-2.5 text-sm disabled:opacity-40">
                      {s.toCall > 0 ? "Raise" : "Bet"} pot
                    </button>
                    <button onClick={() => act(2, s.maxTo)} disabled={!s.heroTurn} className="btn-term px-3.5 py-2.5 text-sm disabled:opacity-40">
                      All in
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ---- the coach ---- */}
        <div className="flex flex-col gap-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Coach</p>
              <button
                onClick={() => { setCoachOn(!coachOn); setS(snap(!coachOn)); }}
                className={`rounded-md border px-2.5 py-1 text-[11px] transition ${coachOn ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
              >
                {coachOn ? "on" : "off"}
              </button>
            </div>
            {coachOn && !s.over && s.heroTurn && s.coachEq >= 0 && (
              <div className="mt-3 space-y-2.5">
                <p className="text-xs leading-relaxed text-fg">{holdingLine()}</p>
                {outsLine() && (
                  <p className="text-xs leading-relaxed text-muted">{outsLine()}</p>
                )}
                <div>
                  <div className="mb-0.5 flex justify-between font-mono text-[11px]">
                    <span className="text-muted">your equity</span>
                    <span className="tabular-nums text-fg">{(s.coachEq / 10).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-md bg-surface-2">
                    <div className="h-full rounded-md bg-moss/70" style={{ width: `${s.coachEq / 10}%` }} />
                  </div>
                </div>
                {s.toCall > 0 && (
                  <div>
                    <div className="mb-0.5 flex justify-between font-mono text-[11px]">
                      <span className="text-muted">pot odds need</span>
                      <span className="tabular-nums text-fg">{(s.coachPo / 10).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-md bg-surface-2">
                      <div className="h-full rounded-md bg-accent/70" style={{ width: `${s.coachPo / 10}%` }} />
                    </div>
                  </div>
                )}
                {evLine() && (
                  <p className="text-xs leading-relaxed text-muted">{evLine()}</p>
                )}
                <p className="text-xs text-muted">
                  Coach says: <span className="font-medium text-fg">{ADVICE[s.coachAdv]}</span>.
                </p>
              </div>
            )}
            {coachOn && !s.over && !s.heroTurn && (
              <p className="mt-3 text-xs text-muted">waiting on the bot…</p>
            )}
            {!coachOn && (
              <p className="mt-3 text-xs text-muted">
                The coach is off. It still grades every decision, it just stops showing you the numbers before you act.
              </p>
            )}
            {fb && (
              <p className={`mt-3 border-t border-line pt-3 text-xs leading-relaxed ${fb.cls}`}>{fb.text}</p>
            )}
          </div>

          {/* session stats */}
          <div className="panel p-5">
            <p className="text-sm font-medium">Session</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[12px]">
              <span className="text-muted">hands</span>
              <span className="text-right tabular-nums">{s.hands}</span>
              <span className="text-muted">profit</span>
              <span className={`text-right tabular-nums ${s.profit >= 0 ? "text-moss" : "text-accent"}`}>
                {s.profit >= 0 ? "+" : ""}{(s.profit / 10).toFixed(1)} BB
              </span>
              <span className="text-muted">good decisions</span>
              <span className="text-right tabular-nums text-moss">{s.nBest}</span>
              <span className="text-muted">close calls</span>
              <span className="text-right tabular-nums text-gold">{s.nOk}</span>
              <span className="text-muted">mistakes</span>
              <span className="text-right tabular-nums text-accent">{s.nBad}</span>
              <span className="text-muted">accuracy</span>
              <span className="text-right tabular-nums">{accuracy}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* hand log */}
      {s.log.length > 0 && (
        <div className="panel max-h-28 overflow-y-auto p-4">
          <p className="mb-1.5 text-[10px] uppercase tracking-widest text-muted">this hand</p>
          <p className="font-mono text-[11px] leading-relaxed text-muted">{s.log.join(" · ")}</p>
        </div>
      )}

      <div className="max-w-2xl space-y-2 text-xs leading-relaxed text-muted">
        <p>
          How the training works: at every decision the C++ engine deals
          thousands of random opponent hands and runouts to estimate your
          equity, which is the share of the pot your hand wins on average. It
          compares that to the pot odds, which is the price a call is asking
          you to pay. If your equity beats the price, calling makes money in
          the long run. If it does not, the call loses money no matter how the
          hand turns out, and the coach counts it as a mistake.
        </p>
        <p>
          The coach also counts your outs, the cards that improve your hand,
          and uses the rule of 4 and 2: multiply your outs by 4 on the flop or
          by 2 on the turn and you get a rough percentage to hit. It is the
          same shortcut people use at real tables. Blinds are 5/10, stacks
          reset to 1000 every hand, and the profit line tracks the whole
          session. Turn the coach off when you want to test yourself; it
          keeps grading silently.
        </p>
      </div>
    </div>
  );
}
