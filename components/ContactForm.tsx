"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { bumpVibe } from "@/lib/vibeBus";

const EMAIL = "peterzhaoofficial@gmail.com";

// No backend: submitting composes the email in the visitor's own mail app.
// The preview window shows exactly what that email will look like, as you
// type it — so the mailto isn't a leap of faith.
export function ContactForm() {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const subject = name ? `Hi Peter — from ${name}` : "Hi Peter";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    bumpVibe("curiosity", 15);
    const body = encodeURIComponent(
      `${message}\n\n— ${name || "someone from your website"}${from ? ` (${from})` : ""}`
    );
    // let the plane leave the button before the mail app steals focus
    setTimeout(() => {
      window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${body}`;
      setTimeout(() => setSending(false), 1500);
    }, 500);
  };

  const fieldCls =
    "w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-accent";

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 text-left">
      <div className="flex gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className={fieldCls}
        />
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          type="email"
          placeholder="Your email"
          className={fieldCls}
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        rows={4}
        placeholder="Internship? Project? Zion discourse? Type it here."
        className={`${fieldCls} resize-none`}
      />

      {/* the email, assembling itself as you type */}
      <AnimatePresence>
        {(message || name) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="panel">
              <div className="panel-titlebar">
                <span className="win-dots">
                  <i className="bg-accent/60" />
                  <i className="bg-gold/60" />
                  <i className="bg-moss/60" />
                </span>
Preview — this is what I&apos;ll get
              </div>
              <div className="space-y-1 px-4 py-3 font-mono text-[11px] text-muted">
                <p>
                  <span className="text-fg">to:</span> {EMAIL}
                </p>
                <p>
                  <span className="text-fg">subject:</span> {subject}
                </p>
                <p className="whitespace-pre-wrap border-t border-line pt-2 text-[12px] leading-relaxed text-fg">
                  {message || "…"}
                </p>
                <p className="pt-1">
                  — {name || "someone from your website"}
                  {from ? ` (${from})` : ""}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="submit"
        whileTap={{ scale: 0.97 }}
        className="btn-solid relative overflow-hidden px-6 py-3 text-sm"
      >
        <AnimatePresence mode="wait">
          {sending ? (
            <motion.span
              key="plane"
              initial={{ x: 0, opacity: 1 }}
              animate={{ x: 180, y: -26, opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeIn" }}
              className="inline-block"
            >
              ✈
            </motion.span>
          ) : (
            <motion.span key="label" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Send it
            </motion.span>
          )}
        </AnimatePresence>
        {sending && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="absolute inset-0 grid place-items-center text-sm"
          >
            opening your mail app…
          </motion.span>
        )}
      </motion.button>

      <p className="flex items-center justify-center gap-2 text-center font-mono text-[11px] text-muted">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-moss" />
        </span>
        replies fast, genuinely · or copy:{" "}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(EMAIL).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="text-accent underline decoration-accent/30 underline-offset-2 transition hover:decoration-accent"
        >
          {copied ? "copied!" : EMAIL}
        </button>
      </p>
    </form>
  );
}
