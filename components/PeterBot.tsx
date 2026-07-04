"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PixelPeter } from "@/components/PixelPeter";
import { readMessage } from "@/components/VibeRadar";
import { bumpVibe, getVibe, getVibeSamples } from "@/lib/vibeBus";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Why is Zion in C-tier?",
  "What did you do at NVIDIA?",
  "How does the map game work?",
];

export function PeterBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [clock, setClock] = useState("");
  const [typing, setTyping] = useState(false); // actively typing right now
  const [kbOpen, setKbOpen] = useState(false); // on-screen keyboard
  const [touchDevice, setTouchDevice] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // physical keystrokes flash the matching on-screen key
  const flashKey = (k: string) => {
    setPressedKey(k);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressedKey(null), 130);
  };

  // taps on the on-screen keyboard type into the input
  const tapKey = (k: string) => {
    flashKey(k);
    if (k === "del") onType(input.slice(0, -1));
    else if (k === "space") onType(input + " ");
    else if (k === "return") send(input);
    else onType(input + k);
  };
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onType = (value: string) => {
    setInput(value);
    setTyping(value.trim().length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    // dots stop ~1.2s after the last keystroke, like a real chat
    typingTimer.current = setTimeout(() => setTyping(false), 1200);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, input]);

  // touch devices get the native keyboard on focus; ours is button-only there
  useEffect(() => {
    setTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // the phone's clock is real
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    // texting the secret to peter counts as finding it
    if (/cheese/i.test(content)) window.dispatchEvent(new Event("cheesemode"));
    const next: Msg[] = [...messages, { role: "user", content }];
    // feed the visitor-vibe radar from this message's style
    const style = readMessage(content);
    bumpVibe("chaos", style.chaos * 0.3);
    bumpVibe("curiosity", style.curiosity * 0.35);
    bumpVibe("menace", style.menace * 0.4);

    // typing dots appear immediately, phone style
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setTyping(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          // the bot can see the visitor's vibe graph
          vibe: getVibe(),
          vibeSamples: getVibeSamples(),
        }),
      });
      if (res.status === 503) {
        setOffline(true);
        setBusy(false);
        return;
      }
      if (res.status === 429) {
        setMessages([
          ...next,
          { role: "assistant", content: "Easy. Give me a minute, then ask again." },
        ]);
        setBusy(false);
        return;
      }
      if (!res.ok || !res.body) throw new Error("bad response");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.replace(/^data: /, "").trim();
          if (!data || data === "[DONE]") continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              setMessages([...next, { role: "assistant", content: acc }]);
            }
          } catch {
            // partial JSON across chunks; ignore
          }
        }
      }
    } catch {
      setMessages((m) => [
        ...m.filter((x) => x.content !== ""),
        { role: "assistant", content: "Something broke. Try again, or just email me." },
      ]);
    }
    setBusy(false);
  };

  return (
    <>
      {/* launcher */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Chat with PeterBot"
        className={`fixed bottom-5 right-5 z-[70] h-12 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg shadow-lg transition hover:opacity-90 ${
          open ? "hidden sm:flex" : "flex"
        }`}
      >
        {open ? "put phone away" : "text me"}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: 620, rotate: 6, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: 620, rotate: 5, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed inset-0 z-[80] flex h-full w-full flex-col overflow-hidden bg-bg shadow-2xl sm:inset-auto sm:bottom-20 sm:right-5 sm:h-[min(34rem,calc(100vh-7rem))] sm:w-[min(22rem,calc(100vw-2.5rem))] sm:rounded-[2.4rem] sm:border-[6px] sm:border-[#2a2620]"
          >
            {/* status bar + dynamic island */}
            <div className="relative flex items-center justify-between px-6 pb-1 pt-2.5">
              <span className="font-mono text-[10px] font-bold">{clock || " "}</span>
              <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#2a2620]" />
              <span className="font-mono text-[9px] text-muted">5G ▂▄▆█</span>
            </div>

            {/* contact header, iMessage style */}
            <div className="relative flex flex-col items-center border-b border-line pb-2.5 pt-1">
              <button
                onClick={() => setOpen(false)}
                aria-label="close chat"
                className="absolute right-4 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-line text-muted sm:hidden"
              >
                ✕
              </button>
              <PixelPeter size={38} />
              <p className="mt-1 text-xs font-medium">Peter Zhao</p>
              <p className="font-mono text-[9px] text-muted">
                PeterBot · Llama 3.3 70B · online
              </p>
            </div>

            {/* thread */}
            <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-4">
              {offline ? (
                <p className="text-sm leading-relaxed text-muted">
                  The bot is asleep right now (no API key configured). Email me
                  instead: peterzhaoofficial@gmail.com
                </p>
              ) : messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted">
                    today
                  </p>
                  <p className="text-sm text-muted">Some things people text me:</p>
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="block w-full rounded-2xl border border-line bg-surface px-3 py-2 text-left text-sm transition hover:border-accent hover:text-accent"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                messages.map((m, i) =>
                  m.role === "user" ? (
                    <div
                      key={i}
                      className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm leading-relaxed text-accent-fg"
                    >
                      {m.content}
                    </div>
                  ) : (
                    <div key={i} className="flex max-w-[85%] items-end gap-1.5">
                      <PixelPeter size={22} />
                      <div className="rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2 text-sm leading-relaxed">
                        {m.content}
                        {busy && i === messages.length - 1 && (
                          <span
                            className={`typing-dots inline-flex gap-1 py-1 ${
                              m.content ? "ml-1.5 align-baseline" : ""
                            }`}
                          >
                            <span /><span /><span />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                )
              )}
              {/* your own typing bubble: eases in after a few characters,
                  eases out when you pause */}
              <AnimatePresence>
                {!offline && !busy && typing && input.trim().length > 2 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.75, y: 6 }}
                    transition={{ type: "spring", stiffness: 320, damping: 22 }}
                    style={{ transformOrigin: "bottom right" }}
                    className="ml-auto w-fit rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5"
                  >
                    <span
                      className="typing-dots inline-flex gap-1"
                      style={{ "--dot": "var(--accent-fg)" } as React.CSSProperties}
                    >
                      <span /><span /><span />
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* message bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-line p-3"
            >
              <button
                type="button"
                aria-label="toggle keyboard"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setKbOpen(!kbOpen);
                }}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm transition ${
                  kbOpen
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-muted hover:border-accent hover:text-accent"
                }`}
              >
                ⌨
              </button>
              <input
                value={input}
                onChange={(e) => onType(e.target.value)}
                onFocus={() => !touchDevice && setKbOpen(true)}
                onKeyDown={(e) => {
                  const k = e.key === " " ? "space" : e.key === "Backspace" ? "del" : e.key === "Enter" ? "return" : e.key.toLowerCase();
                  flashKey(k);
                }}
                placeholder={busy ? "Peter is typing…" : "Text message"}
                disabled={busy || offline}
                className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none transition focus:border-accent"
              />
              <button
                type="submit"
                aria-label="send"
                disabled={busy || offline || !input.trim()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-base font-bold text-accent-fg transition hover:opacity-90 disabled:opacity-40"
              >
                ↑
              </button>
            </form>

            {/* on-screen keyboard, phone style */}
            <AnimatePresence>
              {kbOpen && !offline && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="overflow-hidden border-t border-line bg-surface-2/60"
                >
                  <div className="space-y-1.5 px-2 pb-2 pt-2">
                    {[
                      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
                      ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
                      ["z", "x", "c", "v", "b", "n", "m", "del"],
                    ].map((row, ri) => (
                      <div key={ri} className="flex justify-center gap-1">
                        {row.map((k) => (
                          <button
                            key={k}
                            type="button"
                            aria-label={k}
                            onPointerDown={(e) => {
                              e.preventDefault(); // keep the input focused
                              tapKey(k);
                            }}
                            className={`h-8 min-w-7 flex-1 max-w-9 rounded-md border text-xs font-medium shadow-sm transition-all duration-75 ${
                              pressedKey === k
                                ? "scale-90 border-accent bg-accent text-accent-fg"
                                : "border-line bg-surface"
                            }`}
                          >
                            {k === "del" ? "⌫" : k}
                          </button>
                        ))}
                      </div>
                    ))}
                    <div className="flex justify-center gap-1">
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          setKbOpen(false);
                        }}
                        className="h-8 w-12 rounded-md border border-line bg-surface text-xs shadow-sm"
                      >
                        ▾
                      </button>
                      <button
                        type="button"
                        aria-label="space"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          tapKey("space");
                        }}
                        className={`h-8 flex-1 rounded-md border text-xs shadow-sm transition-all duration-75 ${
                          pressedKey === "space"
                            ? "scale-95 border-accent bg-accent text-accent-fg"
                            : "border-line bg-surface"
                        }`}
                      >
                        space
                      </button>
                      <button
                        type="button"
                        aria-label="return"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          tapKey("return");
                        }}
                        className={`h-8 w-16 rounded-md border text-xs font-medium shadow-sm transition-all duration-75 ${
                          pressedKey === "return"
                            ? "scale-95 border-accent bg-accent text-accent-fg"
                            : "border-line bg-surface text-accent"
                        }`}
                      >
                        return
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* home indicator */}
            <div className="pb-1.5">
              <div className="mx-auto h-1 w-24 rounded-full bg-line" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
