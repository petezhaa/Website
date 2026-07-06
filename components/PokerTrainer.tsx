"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { bumpVibe } from "@/lib/vibeBus";

// No-limit Texas Hold'em for 2 to 5 players (you against 1 to 4 bots), with
// a coach. The C++ engine deals, runs the betting, and computes hand equity
// with a Monte Carlo simulation against the ranges every live opponent's
// betting represents. The bots are stepped from here on a timer so their
// actions play out one at a time, and chips, streets, and showdowns animate.

type Engine = {
  new_session: (seed: number) => void;
  new_hand: () => void;
  hero_act: (cls: number, to: number) => number;
  bot_turn: () => number;
  bot_step: () => void;
  cur_actor: () => number;
  set_players: (n: number) => void;
  get_players: () => number;
  set_level: (l: number) => void;
  set_mode: (m: number) => void;
  hero_rebuys: () => number;
  can_raise: () => number;
  coach_equity: () => number;
  coach_pot_odds: () => number;
  coach_advice: () => number;
  now_cat: () => number;
  outs: () => number;
  hand_chen: () => number;
  last_grade: () => number;
  last_advised: () => number;
  last_equity: () => number;
  last_pot_odds: () => number;
  last_action_cls: () => number;
  p_card: (p: number, i: number) => number;
  p_stack: (p: number) => number;
  p_bet: (p: number) => number;
  p_folded: (p: number) => number;
  p_range: (p: number) => number;
  p_cat: (p: number) => number;
  p_mask: (p: number) => number;
  is_button: (p: number) => number;
  board_card: (i: number) => number;
  board_count: () => number;
  get_street: () => number;
  get_pot: () => number;
  to_call: () => number;
  hero_turn: () => number;
  hand_over: () => number;
  by_fold: () => number;
  winners: () => number;
  min_raise_to: () => number;
  max_raise_to: () => number;
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
const STREETS = ["", "Flop", "Turn", "River"];

// A card deals in with a small flip-and-drop; `delay` staggers a spread.
// At showdown `glow` rings the five cards that make the winning hand and
// `dim` fades everything that didn't play.
function Card({
  c,
  hidden = false,
  delay = 0,
  dim = false,
  glow = false,
  small = false,
}: {
  c: number;
  hidden?: boolean;
  delay?: number;
  dim?: boolean;
  glow?: boolean;
  small?: boolean;
}) {
  const reduce = useReducedMotion();
  const size = small ? "h-12 w-8 sm:h-14 sm:w-10" : "h-16 w-11 sm:h-20 sm:w-14";
  if (c < 0 && !hidden)
    return <div className={`${size} rounded-md border border-dashed border-line`} />;
  const red = !hidden && ((c & 3) === 1 || (c & 3) === 2);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -22, rotateY: 90, scale: 0.85 }}
      animate={{ opacity: dim ? 0.4 : 1, y: 0, rotateY: 0, scale: glow ? 1.04 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24, delay }}
      style={{ transformPerspective: 600 }}
    >
      {hidden ? (
        <div
          className={`${size} grid place-items-center rounded-md border border-line`}
          style={{
            background:
              "repeating-linear-gradient(45deg, var(--surface-2) 0 4px, var(--surface) 4px 8px)",
          }}
        />
      ) : (
        <div
          className={`${size} flex flex-col items-center justify-center rounded-md border bg-surface shadow-sm ${
            glow ? "border-accent ring-2 ring-accent/50" : "border-line"
          }`}
        >
          <span
            className={`font-serif font-semibold leading-none ${small ? "text-sm sm:text-base" : "text-lg sm:text-xl"} ${red ? "" : "text-fg"}`}
            style={red ? { color: "#b0483f" } : undefined}
          >
            {RANKS[c >> 2]}
          </span>
          <span
            className={`leading-none ${small ? "text-xs sm:text-sm" : "text-base sm:text-lg"} ${red ? "" : "text-fg"}`}
            style={red ? { color: "#b0483f" } : undefined}
          >
            {SUITS[c & 3]}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// inline text cards for the hand-history rows
function CardsTxt({ cs }: { cs: number[] }) {
  return (
    <span className="font-mono text-xs">
      {cs.map((c, i) =>
        c < 0 ? null : (
          <span
            key={i}
            className="mr-1"
            style={{ color: (c & 3) === 1 || (c & 3) === 2 ? "#b0483f" : "var(--fg)" }}
          >
            {RANKS[c >> 2]}
            {SUITS[c & 3]}
          </span>
        )
      )}
    </span>
  );
}

type Seat = {
  c0: number;
  c1: number;
  stack: number;
  folded: boolean;
  range: number;
  cat: number;
  mask: number;
  isButton: boolean;
};
type Snap = {
  np: number;
  seats: Seat[];
  board: number[];
  pot: number;
  toCall: number;
  heroTurn: boolean;
  curActor: number;
  over: boolean;
  byFold: boolean;
  winners: number;
  minTo: number;
  maxTo: number;
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
  chen: number;
  street: number;
  canRaise: boolean;
  rebuys: number;
  log: string[];
};

// one graded hero decision, kept for the hand-history review
type Decision = { street: number; cls: number; grade: number; eq: number; po: number; adv: number };
type HandRecord = {
  n: number;
  hero: [number, number];
  board: number[];
  delta: number;
  won: boolean;
  byFold: boolean;
  heroFolded: boolean;
  cat: number;
  decisions: Decision[];
};
// lifetime leak counters: [street 0..3][0 = folded too much, 1 = called/raised too loose]
type Leaks = number[][];
const emptyLeaks = (): Leaks => [[0, 0], [0, 0], [0, 0], [0, 0]];

type Fly = { id: number; fx: number; fy: number; tx: number; ty: number; label: string; delay: number };
type Float = { id: number; x: number; y: number; text: string; color: string };
type Confetto = { id: number; x: number; y: number; dx: number; dy: number; rot: number; glyph: string; color: string };

const round5 = (n: number) => Math.round(n / 5) * 5;

// The how-to-play guide: shown on the first visit, reopenable any time.
function Guide({ onClose }: { onClose: () => void }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <h4 className="font-serif text-lg tracking-tight">{children}</h4>
  );
  const RANKINGS: [string, string][] = [
    ["Straight flush", "five cards in a row, all one suit"],
    ["Four of a kind", "all four of one rank"],
    ["Full house", "three of a kind plus a pair"],
    ["Flush", "any five cards of one suit"],
    ["Straight", "five cards in a row, mixed suits"],
    ["Three of a kind", "three of one rank"],
    ["Two pair", "two different pairs"],
    ["Pair", "two of one rank"],
    ["High card", "none of the above; the best card plays"],
  ];
  return (
    <div className="panel space-y-5 p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-2xl tracking-tight">How to play</h3>
        <button onClick={onClose} className="btn-solid px-4 py-2 text-sm">
          Deal me in
        </button>
      </div>

      <div className="space-y-2 text-sm leading-relaxed text-muted">
        <H>The game</H>
        <p>
          This is no-limit Texas Hold&apos;em against one to four bots. Every
          player gets two private cards. Five shared cards land on the table
          in stages: three at once (the flop), then one more (the turn), then
          a last one (the river). Your hand is the best five cards you can
          pick from your two plus the five on the board. Whoever has the
          better five wins the pot at showdown, and if everyone else folds
          first, the last player standing takes it without showing anything.
        </p>
        <p>
          Before each hand, two players post forced bets called blinds (5 and
          10 here), so there is always something to fight for. The dealer
          button moves every hand, the blinds follow it around the table, and
          after the hole cards and after each stage of the board there is a
          round of betting.
        </p>
      </div>

      <div className="space-y-2 text-sm leading-relaxed text-muted">
        <H>Your options when it is your turn</H>
        <p>
          <span className="text-fg">Check</span> passes when nobody has bet.{" "}
          <span className="text-fg">Call</span> matches the bet in front of
          you. <span className="text-fg">Bet</span> or{" "}
          <span className="text-fg">raise</span> puts more chips in, which
          forces the others to pay to continue or give up.{" "}
          <span className="text-fg">Fold</span> surrenders the hand and
          whatever you already put in. The slider picks any raise size up to
          all-in.
        </p>
      </div>

      <div className="space-y-2 text-sm leading-relaxed text-muted">
        <H>Hand rankings, strongest first</H>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {RANKINGS.map(([name, what], i) => (
            <p key={name}>
              <span className="font-mono text-[11px] text-muted">{i + 1}.</span>{" "}
              <span className="text-fg">{name}</span>, {what}
            </p>
          ))}
        </div>
      </div>

      <div className="space-y-2 text-sm leading-relaxed text-muted">
        <H>What the coach is telling you</H>
        <p>
          <span className="text-fg">Equity</span> is the share of the pot
          your hand would win if the cards ran out thousands of times. The
          engine actually runs that simulation in C++ at every decision,
          against every player still in the hand, and it deals them hands
          that match how they have been betting, so a raise lowers your
          equity like it should. With more players in the pot your equity is
          naturally smaller, and so is the share you need.
        </p>
        <p>
          <span className="text-fg">Pot odds</span> are the price of a call.
          If you have to put in 20 to win a pot of 60, you are paying 20 to
          win 80 total, which is 25%. If your equity is above that price the
          call makes money in the long run, and if it is below, the call
          loses money no matter how this one hand ends.
        </p>
        <p>
          <span className="text-fg">Outs</span> are the specific cards that
          improve your hand. The rule of 4 and 2 turns them into a
          percentage: outs times 4 on the flop, or times 2 on the turn, is
          roughly your chance to hit.
        </p>
        <p>
          After every action the coach grades you.{" "}
          <span className="text-moss">Good</span> means the math agreed with
          you, <span className="text-gold">close</span> means a fine but not
          best line, and <span className="text-accent">mistake</span> means
          the numbers said otherwise. The accuracy and streak numbers track
          those grades, and your lifetime results are saved on this device.
        </p>
      </div>

      <div className="space-y-2 text-sm leading-relaxed text-muted">
        <H>The one idea that matters</H>
        <p>
          You are not trying to win every hand. You are trying to make
          decisions that make money on average. You can play a hand perfectly
          and still lose it; that is variance, not a mistake. The coach only
          cares whether the price you paid was right, and that is the habit
          this trainer is built to teach. Start heads-up against the easy
          opponent, and add players or difficulty when your accuracy stays
          high.
        </p>
        <p>
          Two stakes settings: in practice, every stack resets to 1000 each
          hand so every decision starts from the same place. In bankroll,
          stacks carry from hand to hand, going broke costs a rebuy, and
          side pots work the way they do in a real room. The hand history
          below the table keeps your last thirty hands with every graded
          decision, so you can go back and see exactly where the money went.
        </p>
      </div>

      <button onClick={onClose} className="btn-solid px-5 py-2.5 text-sm">
        Deal me in
      </button>
    </div>
  );
}

export function PokerTrainer() {
  const engRef = useRef<Engine | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<Snap | null>(null);
  const botTimer = useRef<number | null>(null);
  const fxId = useRef(0);
  const boardDelays = useRef<number[]>([0, 0, 0, 0, 0]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [coachOn, setCoachOn] = useState(true);
  const [s, setS] = useState<Snap | null>(null);
  const [handId, setHandId] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [flies, setFlies] = useState<Fly[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);
  const [confetti, setConfetti] = useState<Confetto[]>([]);
  const [flash, setFlash] = useState<{ id: number; label: string } | null>(null);
  const [botSay, setBotSay] = useState<{ id: number; text: string } | null>(null);
  const [raiseTo, setRaiseTo] = useState(0);
  const [level, setLevel] = useState(1);
  const [numPlayers, setNumPlayers] = useState(2);
  const [mode, setMode] = useState(0); // 0 practice, 1 bankroll
  const streakRef = useRef(0);
  const [streak, setStreak] = useState(0);
  // hand history + leak tracking
  const curDecRef = useRef<Decision[]>([]);
  const histRef = useRef<HandRecord[]>([]);
  const [history, setHistory] = useState<HandRecord[]>([]);
  const [openHand, setOpenHand] = useState<number | null>(null);
  const leaksRef = useRef<Leaks>(emptyLeaks());
  const [leaks, setLeaks] = useState<Leaks>(leaksRef.current);
  // first visit: explain the game before dealing; reopenable any time
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("poker-intro-seen")) setShowGuide(true);
    } catch {}
  }, []);
  const closeGuide = () => {
    try { localStorage.setItem("poker-intro-seen", "1"); } catch {}
    setShowGuide(false);
  };
  // lifetime totals survive across visits
  const ltRef = useRef({ hands: 0, profit: 0, best: 0, ok: 0, bad: 0 });
  const [lifetime, setLifetime] = useState(ltRef.current);
  const reduce = useReducedMotion();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("poker-lifetime");
      if (raw) {
        ltRef.current = { ...ltRef.current, ...JSON.parse(raw) };
        setLifetime({ ...ltRef.current });
      }
      const lvl = Number(localStorage.getItem("poker-level"));
      if (lvl === 0 || lvl === 1 || lvl === 2) setLevel(lvl);
      const np = Number(localStorage.getItem("poker-players"));
      if (np >= 2 && np <= 5) setNumPlayers(np);
      const md = Number(localStorage.getItem("poker-mode"));
      if (md === 1) setMode(1);
      const hist = localStorage.getItem("poker-history");
      if (hist) {
        histRef.current = JSON.parse(hist);
        setHistory([...histRef.current]);
      }
      const lk = localStorage.getItem("poker-leaks");
      if (lk) {
        leaksRef.current = JSON.parse(lk);
        setLeaks(leaksRef.current.map((r) => [...r]));
      }
    } catch {}
  }, []);

  const snap = useCallback((withCoach: boolean): Snap => {
    const e = engRef.current!;
    const np = e.get_players();
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
        const who = actor === 0 ? "You" : np === 2 ? "Bot" : `Bot ${actor}`;
        const v = actor === 0 ? youVerbs[act] : botVerbs[act];
        log.push(amt > 0 && act !== 1 && act !== 0 ? `${who} ${v} ${amt}` : `${who} ${v}`);
      }
    }
    const heroTurn = !!e.hero_turn();
    const seats: Seat[] = [];
    for (let p = 0; p < np; p++) {
      seats.push({
        c0: e.p_card(p, 0),
        c1: e.p_card(p, 1),
        stack: e.p_stack(p),
        folded: !!e.p_folded(p),
        range: e.p_range(p),
        cat: e.p_cat(p),
        mask: e.p_mask(p),
        isButton: !!e.is_button(p),
      });
    }
    return {
      np,
      seats,
      board: [0, 1, 2, 3, 4].map((i) => e.board_card(i)),
      pot: e.get_pot(),
      toCall: e.to_call(),
      heroTurn,
      curActor: e.cur_actor(),
      over: !!e.hand_over(),
      byFold: !!e.by_fold(),
      winners: e.winners(),
      minTo: e.min_raise_to(),
      maxTo: e.max_raise_to(),
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
      chen: e.hand_chen(),
      street: e.get_street(),
      canRaise: !!e.can_raise(),
      rebuys: e.hero_rebuys(),
      log,
    };
  }, []);

  // seat anchor positions inside the table panel, for the chip flights
  const anchorOf = useCallback((seat: number, np: number, r: DOMRect) => {
    if (seat === 0) return { x: r.width * 0.16, y: r.height * 0.74 };
    const nb = np - 1;
    return { x: r.width * (0.1 + (0.8 * (seat - 0.5)) / nb), y: r.height * 0.08 };
  }, []);

  // take a snapshot and spawn the visual effects implied by the state change
  const pushSnap = useCallback(
    (withCoach: boolean) => {
      const prev = lastRef.current;
      const next = snap(withCoach);
      // lifetime totals (decision deltas any time, profit at hand end)
      let milestone = 0;
      if (prev) {
        const lt = ltRef.current;
        lt.best += Math.max(0, next.nBest - prev.nBest);
        lt.ok += Math.max(0, next.nOk - prev.nOk);
        lt.bad += Math.max(0, next.nBad - prev.nBad);
        if (!prev.over && next.over) {
          lt.hands += 1;
          lt.profit += next.profit - prev.profit;
        }
        try { localStorage.setItem("poker-lifetime", JSON.stringify(lt)); } catch {}
        setLifetime({ ...lt });
        if (next.nBad > prev.nBad) streakRef.current = 0;
        else if (next.nBest + next.nOk > prev.nBest + prev.nOk) {
          streakRef.current += 1;
          if ([5, 10, 20, 50, 100].includes(streakRef.current)) milestone = streakRef.current;
        }
        setStreak(streakRef.current);
        // record the decision for the hand review, and count leaks
        const decided =
          next.nBest + next.nOk + next.nBad > prev.nBest + prev.nOk + prev.nBad;
        if (decided && next.lastEq >= 0) {
          curDecRef.current.push({
            street: prev.street,
            cls: next.lastCls,
            grade: next.grade,
            eq: next.lastEq,
            po: next.lastPo,
            adv: next.lastAdv,
          });
          if (next.grade === 0) {
            leaksRef.current[prev.street][next.lastCls === 0 ? 0 : 1] += 1;
            try { localStorage.setItem("poker-leaks", JSON.stringify(leaksRef.current)); } catch {}
            setLeaks(leaksRef.current.map((row) => [...row]));
          }
        }
        // close out the hand record
        if (!prev.over && next.over) {
          histRef.current.unshift({
            n: next.hands,
            hero: [next.seats[0].c0, next.seats[0].c1],
            board: [...next.board],
            delta: next.profit - prev.profit,
            won: !!(next.winners & 1),
            byFold: next.byFold,
            heroFolded: next.seats[0].folded,
            cat: next.seats[0].cat,
            decisions: [...curDecRef.current],
          });
          if (histRef.current.length > 30) histRef.current.length = 30;
          try { localStorage.setItem("poker-history", JSON.stringify(histRef.current)); } catch {}
          setHistory([...histRef.current]);
          curDecRef.current = [];
        }
      }
      // the latest bot action becomes a small speech bubble
      if (prev && next.log.length > prev.log.length) {
        const fresh = next.log.slice(prev.log.length).filter((l) => l.startsWith("Bot"));
        if (fresh.length) {
          const id = ++fxId.current;
          setBotSay({ id, text: fresh[fresh.length - 1] });
          window.setTimeout(() => setBotSay((b) => (b && b.id === id ? null : b)), 2000);
        }
      }
      // stagger newly revealed board cards
      const prevBc = prev ? prev.board.filter((c) => c >= 0).length : 0;
      const bc = next.board.filter((c) => c >= 0).length;
      const d = [0, 0, 0, 0, 0];
      for (let i = prevBc; i < bc; i++) d[i] = (i - prevBc) * (prevBc === 0 && bc === 3 ? 0.15 : 0.35);
      boardDelays.current = d;

      if (prev && prev.np === next.np && !reduce && tableRef.current) {
        const r = tableRef.current.getBoundingClientRect();
        const potA = { x: r.width * 0.84, y: r.height * 0.1 };
        const addFly = (f: { x: number; y: number }, t: { x: number; y: number }, amt: number, delay = 0) =>
          setFlies((fl) => [...fl, { id: ++fxId.current, fx: f.x, fy: f.y, tx: t.x, ty: t.y, label: String(amt), delay }]);
        const sameHand = prev.hands === next.hands || (!prev.over && next.over);
        if (sameHand) {
          for (let p = 0; p < next.np; p++) {
            const paid = prev.seats[p].stack - next.seats[p].stack;
            if (paid > 0) addFly(anchorOf(p, next.np, r), potA, paid);
          }
          if (!prev.over && next.over) {
            let won = prev.pot;
            for (let p = 0; p < next.np; p++) won += Math.max(0, prev.seats[p].stack - next.seats[p].stack);
            const winnerSeats: number[] = [];
            for (let p = 0; p < next.np; p++)
              if (next.winners & (1 << p)) winnerSeats.push(p);
            for (const w of winnerSeats)
              addFly(potA, anchorOf(w, next.np, r), Math.floor(won / winnerSeats.length), 0.5);
            const delta = next.profit - prev.profit;
            const heroA = anchorOf(0, next.np, r);
            setFloats((fl) => [
              ...fl,
              {
                id: ++fxId.current,
                x: heroA.x,
                y: heroA.y - 20,
                text: `${delta >= 0 ? "+" : ""}${delta}`,
                color: delta >= 0 ? "var(--moss)" : "var(--accent)",
              },
            ]);
            if (next.winners & 1 && !next.byFold) {
              const glyphs = ["♠", "♥", "♦", "♣"];
              const colors = ["var(--moss)", "var(--gold)", "var(--accent)"];
              setConfetti((cf) => [
                ...cf,
                ...Array.from({ length: 14 }, (_, i) => ({
                  id: ++fxId.current,
                  x: potA.x,
                  y: potA.y,
                  dx: (Math.random() - 0.5) * 260,
                  dy: -30 - Math.random() * 140,
                  rot: (Math.random() - 0.5) * 540,
                  glyph: glyphs[i % 4],
                  color: colors[i % 3],
                })),
              ]);
            }
          }
          if (milestone) {
            const heroA = anchorOf(0, next.np, r);
            setFloats((fl) => [
              ...fl,
              {
                id: ++fxId.current,
                x: heroA.x + 60,
                y: heroA.y - 44,
                text: `${milestone} good calls in a row`,
                color: "var(--gold)",
              },
            ]);
          }
        }
        if (next.street > prev.street && prev.hands === next.hands) {
          const id = ++fxId.current;
          setFlash({ id, label: STREETS[next.street] });
          window.setTimeout(() => setFlash((f) => (f && f.id === id ? null : f)), 1300);
        }
      }
      lastRef.current = next;
      setS(next);
    },
    [snap, reduce, anchorOf]
  );

  // the bots think, then act, one visible step at a time
  const scheduleBot = useCallback(() => {
    const e = engRef.current;
    if (!e) return;
    if (!e.bot_turn()) {
      setThinking(false);
      return;
    }
    setThinking(true);
    if (botTimer.current) window.clearTimeout(botTimer.current);
    botTimer.current = window.setTimeout(() => {
      e.bot_step();
      pushSnap(true);
      scheduleBot();
    }, reduce ? 120 : 550 + Math.random() * 500);
  }, [pushSnap, reduce]);

  const deal = useCallback(() => {
    const e = engRef.current;
    if (!e) return;
    if (botTimer.current) window.clearTimeout(botTimer.current);
    setFlies([]);
    setFloats([]);
    setConfetti([]);
    setFlash(null);
    setBotSay(null);
    e.new_hand();
    lastRef.current = null; // a fresh hand diffs against nothing
    curDecRef.current = [];
    setHandId((n) => n + 1);
    pushSnap(true);
    scheduleBot();
    bumpVibe("gamer", 6);
  }, [pushSnap, scheduleBot]);

  const pickLevel = (l: number) => {
    setLevel(l);
    engRef.current?.set_level(l);
    try { localStorage.setItem("poker-level", String(l)); } catch {}
  };
  const pickPlayers = (n: number) => {
    setNumPlayers(n);
    engRef.current?.set_players(n);
    try { localStorage.setItem("poker-players", String(n)); } catch {}
    if (engRef.current && ready) deal(); // applies with a fresh hand
  };
  const pickMode = (m: number) => {
    setMode(m);
    engRef.current?.set_mode(m);
    try { localStorage.setItem("poker-mode", String(m)); } catch {}
    if (engRef.current && ready) deal();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // the ?v pairs this JS with the engine build it needs: the engine is
        // cached hard (browser + service worker), so any change to the
        // exports must bump this together with the .bin
        const buf = await fetch("/poker.bin?v=7").then((r) => r.arrayBuffer());
        if (cancelled) return;
        const e = (await WebAssembly.instantiate(buf)).instance.exports as unknown as Engine;
        engRef.current = e;
        e.new_session((Date.now() & 0xffffffff) >>> 0);
        const lvl = Number(localStorage.getItem("poker-level"));
        if (lvl === 0 || lvl === 2) e.set_level(lvl);
        const np = Number(localStorage.getItem("poker-players"));
        if (np >= 2 && np <= 5) e.set_players(np);
        if (Number(localStorage.getItem("poker-mode")) === 1) e.set_mode(1);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (botTimer.current) window.clearTimeout(botTimer.current);
    };
  }, []);

  // deal the first hand once the engine is up and the guide is out of the way
  useEffect(() => {
    if (ready && !s && !showGuide) deal();
  }, [ready, s, showGuide, deal]);

  // default the raise slider to a half-pot raise whenever it's our turn
  useEffect(() => {
    if (!s || !s.heroTurn) return;
    const heroBetNow = s.maxTo - s.seats[0].stack;
    const half = heroBetNow + s.toCall + Math.round((s.pot + s.toCall) * 0.5);
    setRaiseTo(Math.max(s.minTo, Math.min(s.maxTo, Math.round(half / 5) * 5)));
  }, [s]);

  const act = (cls: number, to = 0) => {
    const e = engRef.current;
    if (!e || !s || !s.heroTurn) return;
    e.hero_act(cls, to);
    pushSnap(true);
    scheduleBot();
    bumpVibe("curiosity", 4);
  };

  if (failed)
    return <p className="text-sm text-muted">couldn&apos;t load the wasm engine.</p>;
  if (showGuide) return <Guide onClose={closeGuide} />;
  if (!ready || !s)
    return (
      <div className="panel grid h-40 place-items-center">
        <p className="animate-pulse text-sm text-muted">shuffling…</p>
      </div>
    );

  const hero = s.seats[0];
  // raise to = my current bet + the call + a fraction of the pot after calling
  const heroBetNow = s.maxTo - hero.stack;
  const potAfterCall = s.pot + s.toCall;
  const halfPotTo = round5(heroBetNow + s.toCall + Math.round(potAfterCall * 0.5));
  const potTo = round5(heroBetNow + s.toCall + potAfterCall);
  const clamp = (t: number) => Math.max(s.minTo, Math.min(s.maxTo, round5(t)));
  const accuracyDen = s.nBest + s.nOk + s.nBad;
  const accuracy = accuracyDen ? Math.round(((s.nBest + s.nOk) / accuracyDen) * 100) : 100;

  // what the hero holds, in words
  const holdingLine = () => {
    if (s.street === 0) {
      const a = hero.c0, b = hero.c1;
      const ra = a >> 2, rb = b >> 2;
      const strength =
        s.chen >= 18 ? "a premium starting hand"
        : s.chen >= 12 ? "a strong starting hand"
        : s.chen >= 7 ? "a playable starting hand"
        : "a below-average starting hand";
      if (ra === rb) return `You hold a pair of ${RANKS[ra]}s, ${strength}.`;
      const hi = RANKS[Math.max(ra, rb)], lo = RANKS[Math.min(ra, rb)];
      const suited = (a & 3) === (b & 3);
      return `You hold ${hi}${lo} ${suited ? "suited" : "offsuit"}, ${strength}.`;
    }
    if (s.nowCat <= 0) return "You have no made hand yet, just high cards.";
    return `You have ${CATS[s.nowCat]} right now.`;
  };
  // the coach reads ranges: say so when it matters
  const aggressive = s.seats.some((p, i) => i > 0 && !p.folded && p.range >= 2);
  const rangeLine = () =>
    aggressive
      ? "Someone has shown aggression, so your equity here is measured against the stronger hands that betting represents, not random cards."
      : null;
  const outsLine = () => {
    if (s.outs <= 0 || s.street < 1 || s.street > 2) return null;
    const mult = s.street === 1 ? 4 : 2;
    const pct = Math.min(95, s.outs * mult);
    return `About ${s.outs} cards improve your hand. The shortcut: ${s.outs} outs times ${mult} is roughly ${pct}% to hit ${s.street === 1 ? "by the river" : "on the river"}.`;
  };
  const evLine = () => {
    if (s.toCall <= 0 || s.coachEq < 0) return null;
    const ev = Math.round((s.coachEq / 1000) * (s.pot + s.toCall) - s.toCall);
    return `Calling ${s.toCall} into a ${s.pot} pot: at ${(s.coachEq / 10).toFixed(0)}% equity that call averages ${ev >= 0 ? "+" : ""}${ev} chips.`;
  };

  const botName = (p: number) => (s.np === 2 ? "Bot" : `Bot ${p}`);
  const resultLine = () => {
    if (!s.over) return null;
    const heroWon = !!(s.winners & 1);
    if (s.byFold) {
      if (heroWon) return "Everyone folded. You win the pot.";
      if (hero.folded) {
        const w = s.seats.findIndex((p, i) => i > 0 && (s.winners & (1 << i)));
        return `You folded. ${w > 0 ? botName(w) : "The table"} takes the pot.`;
      }
      return "You folded.";
    }
    const winnerSeats = s.seats.map((_, i) => i).filter((i) => s.winners & (1 << i));
    if (heroWon && winnerSeats.length > 1)
      return `Split pot. ${CATS[hero.cat] ?? ""} all around.`;
    if (heroWon) return `You win with ${CATS[hero.cat] ?? ""}.`;
    const w = winnerSeats[0];
    const yours = hero.folded ? "" : ` against your ${CATS[hero.cat] ?? ""}`;
    return `${botName(w)} wins with ${CATS[s.seats[w].cat] ?? ""}${yours}.`;
  };

  // the player's most common graded mistake, from lifetime leak counters
  const leakLine = () => {
    const names = ["preflop", "on the flop", "on the turn", "on the river"];
    let bs = -1, bt = -1, bc = 2; // only speak up after 3 of the same mistake
    for (let st = 0; st < 4; st++)
      for (let ty = 0; ty < 2; ty++)
        if (leaks[st][ty] > bc) { bc = leaks[st][ty]; bs = st; bt = ty; }
    if (bs < 0) return null;
    return `Your most common mistake: ${bt === 0 ? "folding too much" : "putting chips in too loose"} ${names[bs]} (${bc} times).`;
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

  // showdown highlight: ring each winner's five cards, dim what didn't play
  const showdownNow = s.over && !s.byFold;
  const winnerBoardMask = showdownNow
    ? s.seats.reduce((m, p, i) => (s.winners & (1 << i) ? m | p.mask : m), 0)
    : 0;
  const seatUsed = (p: number, i: number) =>
    showdownNow && !!(s.winners & (1 << p)) && !!((s.seats[p].mask >> i) & 1);
  const boardUsed = (i: number) => showdownNow && !!((winnerBoardMask >> (2 + i)) & 1);

  return (
    <div className="flex flex-col gap-4">
      {/* table setup */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">players</span>
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => pickPlayers(n)}
              className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                numPlayers === n
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {n}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">opponent</span>
          {["easy", "normal", "hard"].map((name, i) => (
            <button
              key={name}
              onClick={() => pickLevel(i)}
              className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                level === i
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {name}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">stakes</span>
          {["practice", "bankroll"].map((name, i) => (
            <button
              key={name}
              onClick={() => pickMode(i)}
              className={`rounded-md border px-2.5 py-1 text-[11px] transition ${
                mode === i
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {name}
            </button>
          ))}
        </span>
        <button onClick={() => setShowGuide(true)} className="tlink ml-auto text-[11px] !text-muted hover:!text-accent">
          how to play
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* ---- the table ---- */}
        <div ref={tableRef} className="panel relative overflow-hidden p-5">
          {/* chip flights */}
          {flies.map((f) => (
            <motion.div
              key={f.id}
              className="pointer-events-none absolute left-0 top-0 z-20"
              initial={{ x: f.fx, y: f.fy, opacity: 0.95, scale: 1 }}
              animate={{ x: f.tx, y: f.ty, opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.6, delay: f.delay, ease: "easeInOut" }}
              onAnimationComplete={() => setFlies((fl) => fl.filter((x) => x.id !== f.id))}
            >
              <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-bold text-accent-fg shadow-md">
                {f.label}
              </span>
            </motion.div>
          ))}
          {/* floating win/loss */}
          {floats.map((f) => (
            <motion.div
              key={f.id}
              className="pointer-events-none absolute left-0 top-0 z-20"
              initial={{ x: f.x, y: f.y, opacity: 0 }}
              animate={{ x: f.x, y: f.y - 46, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.5, delay: 0.55 }}
              onAnimationComplete={() => setFloats((fl) => fl.filter((x) => x.id !== f.id))}
            >
              <span className="font-mono text-xl font-bold" style={{ color: f.color }}>
                {f.text}
              </span>
            </motion.div>
          ))}
          {/* showdown-win confetti */}
          {confetti.map((c) => (
            <motion.span
              key={c.id}
              className="pointer-events-none absolute left-0 top-0 z-20 text-lg"
              style={{ color: c.color }}
              initial={{ x: c.x, y: c.y, opacity: 1, rotate: 0 }}
              animate={{ x: c.x + c.dx, y: c.y + c.dy + 120, opacity: 0, rotate: c.rot }}
              transition={{ duration: 1.3, delay: 0.55, ease: "easeOut" }}
              onAnimationComplete={() => setConfetti((cf) => cf.filter((x) => x.id !== c.id))}
            >
              {c.glyph}
            </motion.span>
          ))}
          {/* street label flash */}
          <AnimatePresence>
            {flash && (
              <motion.div
                key={flash.id}
                className="pointer-events-none absolute inset-x-0 top-[36%] z-10 text-center"
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: [0, 1, 1, 0], y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, times: [0, 0.2, 0.75, 1] }}
              >
                <span className="font-serif text-2xl italic text-muted">{flash.label}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* bot seats (wraps on small screens so nobody gets clipped) */}
          <div className={`flex flex-wrap items-start gap-y-3 ${s.np > 3 ? "gap-x-4 sm:justify-between" : "gap-x-10"}`}>
            {s.seats.slice(1).map((b, k) => {
              const p = k + 1;
              const revealed = b.c0 >= 0;
              return (
                <div key={p} className={`flex items-start gap-2 ${b.folded ? "opacity-40" : ""}`}>
                  <div className="flex gap-1">
                    <Card key={`b${p}0-${handId}-${b.c0}`} c={b.c0} hidden={!revealed && !b.folded} small delay={0.12 + p * 0.07} glow={seatUsed(p, 0)} dim={showdownNow && revealed && !seatUsed(p, 0)} />
                    <Card key={`b${p}1-${handId}-${b.c1}`} c={b.c1} hidden={!revealed && !b.folded} small delay={0.16 + p * 0.07} glow={seatUsed(p, 1)} dim={showdownNow && revealed && !seatUsed(p, 1)} />
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      {botName(p)}
                      {b.isButton && <span className="rounded-full border border-line px-1 text-[8px] uppercase tracking-wide text-muted">d</span>}
                      {thinking && s.curActor === p && (
                        <span className="typing-dots inline-flex items-center gap-1" aria-label="thinking">
                          <span /><span /><span />
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-[11px] text-muted">{b.folded ? "folded" : b.stack}</p>
                  </div>
                </div>
              );
            })}
            <div className="ml-auto text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted">pot</p>
              <motion.p
                key={s.pot}
                initial={reduce ? false : { scale: 1.3 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="font-mono text-2xl font-bold text-fg"
              >
                {s.pot}
              </motion.p>
            </div>
          </div>

          {/* the latest bot action */}
          <div className="h-6 pt-1">
            <AnimatePresence>
              {botSay && (
                <motion.span
                  key={botSay.id}
                  initial={{ opacity: 0, y: 4, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="inline-block rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] italic text-muted"
                >
                  {botSay.text}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* board: each street's new cards deal in with a stagger */}
          <div className="my-4 flex justify-center gap-2">
            {s.board.map((c, i) => (
              <Card key={`bd-${handId}-${i}-${c}`} c={c} delay={boardDelays.current[i]} glow={boardUsed(i)} dim={showdownNow && c >= 0 && !boardUsed(i)} />
            ))}
          </div>

          {/* hero row */}
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-3 ${hero.folded ? "opacity-40" : ""}`}>
              <Card key={`h0-${handId}`} c={hero.c0} glow={seatUsed(0, 0)} dim={showdownNow && !hero.folded && !seatUsed(0, 0)} />
              <Card key={`h1-${handId}`} c={hero.c1} delay={0.08} glow={seatUsed(0, 1)} dim={showdownNow && !hero.folded && !seatUsed(0, 1)} />
              <div>
                <p className="text-sm font-medium">
                  You {hero.isButton && <span className="ml-1 rounded-full border border-line px-1.5 text-[9px] uppercase tracking-wide text-muted">dealer</span>}
                </p>
                <p className="font-mono text-xs text-muted">{hero.folded ? "folded" : hero.stack}</p>
              </div>
            </div>
            {!s.over && s.toCall > 0 && s.heroTurn && (
              <p className="font-mono text-xs text-muted">{s.toCall} to call</p>
            )}
          </div>

          {/* actions */}
          <div className="mt-5 flex flex-wrap gap-2">
            {s.over ? (
              <>
                <motion.p
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : 0.55, duration: 0.4 }}
                  className="w-full text-sm"
                >
                  {resultLine()}
                </motion.p>
                <motion.button whileTap={{ scale: 0.95 }} onClick={deal} className="btn-solid px-5 py-2.5 text-sm">
                  Next hand
                </motion.button>
              </>
            ) : hero.folded ? (
              <p className="text-xs text-muted">You folded. The hand plays out.</p>
            ) : (
              <>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => act(0)}
                  disabled={!s.heroTurn}
                  className="rounded-md border-2 border-accent/60 bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/15 disabled:opacity-40"
                >
                  Fold
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => act(1)}
                  disabled={!s.heroTurn}
                  className="rounded-md border-2 border-moss/60 bg-moss/10 px-4 py-2.5 text-sm font-medium text-moss transition hover:bg-moss/20 disabled:opacity-40"
                >
                  {s.toCall > 0 ? `Call ${Math.min(s.toCall, hero.stack)}` : "Check"}
                </motion.button>
                {s.maxTo > s.toCall && s.canRaise && (
                  <>
                    <motion.button whileTap={{ scale: 0.94 }} onClick={() => act(2, clamp(halfPotTo))} disabled={!s.heroTurn} className="btn-term px-3.5 py-2.5 text-sm disabled:opacity-40">
                      {s.toCall > 0 ? "Raise" : "Bet"} ½ pot
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.94 }} onClick={() => act(2, clamp(potTo))} disabled={!s.heroTurn} className="btn-term px-3.5 py-2.5 text-sm disabled:opacity-40">
                      {s.toCall > 0 ? "Raise" : "Bet"} pot
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.94 }} onClick={() => act(2, s.maxTo)} disabled={!s.heroTurn} className="btn-term px-3.5 py-2.5 text-sm disabled:opacity-40">
                      All in
                    </motion.button>
                    <div className="flex w-full items-center gap-3 pt-1">
                      <input
                        type="range"
                        min={s.minTo}
                        max={s.maxTo}
                        step={5}
                        value={raiseTo}
                        onChange={(ev) => setRaiseTo(Number(ev.target.value))}
                        disabled={!s.heroTurn}
                        className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)] disabled:opacity-40"
                        aria-label="raise size"
                      />
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={() => act(2, clamp(raiseTo))}
                        disabled={!s.heroTurn}
                        className="btn-term whitespace-nowrap px-3.5 py-1.5 text-xs disabled:opacity-40"
                      >
                        {s.toCall > 0 ? "Raise to" : "Bet"} {raiseTo}
                      </motion.button>
                    </div>
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
                onClick={() => { setCoachOn(!coachOn); lastRef.current = null; pushSnap(!coachOn); }}
                className={`rounded-md border px-2.5 py-1 text-[11px] transition ${coachOn ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
              >
                {coachOn ? "on" : "off"}
              </button>
            </div>
            {coachOn && !s.over && s.heroTurn && s.coachEq >= 0 && (
              <div className="mt-3 space-y-2.5">
                <p className="text-xs leading-relaxed text-fg">{holdingLine()}</p>
                {rangeLine() && (
                  <p className="text-xs leading-relaxed text-gold">{rangeLine()}</p>
                )}
                {outsLine() && (
                  <p className="text-xs leading-relaxed text-muted">{outsLine()}</p>
                )}
                <div>
                  <div className="mb-0.5 flex justify-between font-mono text-[11px]">
                    <span className="text-muted">your equity</span>
                    <span className="tabular-nums text-fg">{(s.coachEq / 10).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-md bg-surface-2">
                    <motion.div
                      className="h-full rounded-md bg-moss/70"
                      initial={false}
                      animate={{ width: `${s.coachEq / 10}%` }}
                      transition={{ type: "spring", stiffness: 160, damping: 24 }}
                    />
                  </div>
                </div>
                {s.toCall > 0 && (
                  <div>
                    <div className="mb-0.5 flex justify-between font-mono text-[11px]">
                      <span className="text-muted">pot odds need</span>
                      <span className="tabular-nums text-fg">{(s.coachPo / 10).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-md bg-surface-2">
                      <motion.div
                        className="h-full rounded-md bg-accent/70"
                        initial={false}
                        animate={{ width: `${s.coachPo / 10}%` }}
                        transition={{ type: "spring", stiffness: 160, damping: 24 }}
                      />
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
            {coachOn && !s.over && !s.heroTurn && !hero.folded && (
              <p className="mt-3 text-xs text-muted">waiting on the table…</p>
            )}
            {coachOn && !s.over && hero.folded && (
              <p className="mt-3 text-xs text-muted">you folded this one; watch how it plays out.</p>
            )}
            {!coachOn && (
              <p className="mt-3 text-xs text-muted">
                The coach is off. It still grades every decision, it just stops showing you the numbers before you act.
              </p>
            )}
            {fb && (
              <motion.p
                key={accuracyDen}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35 }}
                className={`mt-3 border-t border-line pt-3 text-xs leading-relaxed ${fb.cls}`}
              >
                {fb.text}
              </motion.p>
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
              {mode === 1 && (
                <>
                  <span className="text-muted">rebuys</span>
                  <span className="text-right tabular-nums">{s.rebuys}</span>
                </>
              )}
              <span className="text-muted">streak</span>
              <span className={`text-right tabular-nums ${streak >= 5 ? "text-gold" : ""}`}>{streak}</span>
              <span className="text-muted">accuracy</span>
              <span className="text-right tabular-nums">{accuracy}%</span>
            </div>
            {leakLine() && (
              <p className="mt-3 border-t border-line pt-2.5 text-xs leading-relaxed text-gold">
                {leakLine()}
              </p>
            )}
            {lifetime.hands > 0 && (
              <div className="mt-3 border-t border-line pt-2.5">
                <p className="text-[10px] uppercase tracking-widest text-muted">lifetime</p>
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[12px]">
                  <span className="text-muted">hands</span>
                  <span className="text-right tabular-nums">{lifetime.hands}</span>
                  <span className="text-muted">profit</span>
                  <span className={`text-right tabular-nums ${lifetime.profit >= 0 ? "text-moss" : "text-accent"}`}>
                    {lifetime.profit >= 0 ? "+" : ""}{(lifetime.profit / 10).toFixed(1)} BB
                  </span>
                  <span className="text-muted">accuracy</span>
                  <span className="text-right tabular-nums">
                    {lifetime.best + lifetime.ok + lifetime.bad > 0
                      ? Math.round(((lifetime.best + lifetime.ok) / (lifetime.best + lifetime.ok + lifetime.bad)) * 100)
                      : 100}%
                  </span>
                </div>
              </div>
            )}
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

      {/* hand history review */}
      {history.length > 0 && (
        <div className="panel max-h-80 overflow-y-auto p-4">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
            hand history · tap a hand to review it
          </p>
          <div className="space-y-0.5">
            {history.map((h) => {
              const mistakes = h.decisions.filter((d) => d.grade === 0).length;
              const open = openHand === h.n;
              return (
                <div key={h.n}>
                  <button
                    onClick={() => setOpenHand(open ? null : h.n)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-surface-2"
                  >
                    <span className="font-mono text-muted">#{h.n}</span>
                    <CardsTxt cs={h.hero} />
                    <span className={`font-mono tabular-nums ${h.delta >= 0 ? "text-moss" : "text-accent"}`}>
                      {h.delta >= 0 ? "+" : ""}{h.delta}
                    </span>
                    {mistakes > 0 ? (
                      <span className="text-accent">{mistakes} mistake{mistakes > 1 ? "s" : ""}</span>
                    ) : h.decisions.length > 0 ? (
                      <span className="text-moss">clean</span>
                    ) : null}
                    <span className="ml-auto text-muted">{open ? "hide" : "review"}</span>
                  </button>
                  {open && (
                    <div className="space-y-1.5 px-2 pb-3 pt-1 text-xs leading-relaxed text-muted">
                      <p>
                        board:{" "}
                        {h.board.some((c) => c >= 0) ? (
                          <CardsTxt cs={h.board} />
                        ) : (
                          "never came, the hand ended preflop"
                        )}
                      </p>
                      <p>
                        {h.heroFolded
                          ? "You folded."
                          : h.won && h.byFold
                          ? "Everyone folded to you."
                          : h.won
                          ? `You won with ${CATS[h.cat] ?? "the best hand"}.`
                          : h.cat >= 0
                          ? `You lost with ${CATS[h.cat]}.`
                          : "You lost the hand."}
                      </p>
                      {h.decisions.map((d, i) => (
                        <p
                          key={i}
                          className={d.grade === 0 ? "text-accent" : d.grade === 1 ? "text-gold" : "text-moss"}
                        >
                          {["preflop", "flop", "turn", "river"][d.street]}: you{" "}
                          {d.cls === 0 ? "folded" : d.cls === 1 ? "checked or called" : "raised"} with{" "}
                          {(d.eq / 10).toFixed(0)}% equity
                          {d.po > 0 ? ` against a ${(d.po / 10).toFixed(0)}% price` : ""}.{" "}
                          {d.grade === 2
                            ? "Good."
                            : d.grade === 1
                            ? `The coach preferred ${ADVICE[d.adv]}.`
                            : `Mistake: the math said ${ADVICE[d.adv]}.`}
                        </p>
                      ))}
                      {h.decisions.length === 0 && <p>No decisions were graded this hand.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="max-w-2xl space-y-2 text-xs leading-relaxed text-muted">
        <p>
          How the training works: at every decision the C++ engine deals
          thousands of hands to every live opponent and runs out the board to
          estimate your equity, which is the share of the pot your hand wins
          on average. The opponents&apos; hands are not random: they are
          weighted toward the ranges their betting represents, so a raise
          lowers your equity like it should. The coach compares that equity
          to the pot odds, which is the price a call is asking you to pay. If
          your equity beats the price, calling makes money in the long run.
          If it does not, the call loses money no matter how the hand turns
          out, and the coach counts it as a mistake. The bots read your
          betting the same way, so they notice when you only raise good
          hands.
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
