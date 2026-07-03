"use client";

import { useState } from "react";

const EMAIL = "peterzhaoofficial@gmail.com";

// No backend: submitting composes the email in the visitor's own mail app.
export function ContactForm() {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(
      name ? `Hi Peter — from ${name}` : "Hi Peter"
    );
    const body = encodeURIComponent(
      `${message}\n\n— ${name || "someone from your website"}${from ? ` (${from})` : ""}`
    );
    window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
  };

  const fieldCls =
    "w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm outline-none transition focus:border-accent";

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-md flex-col gap-3 text-left">
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
      <button
        type="submit"
        className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-fg transition hover:opacity-90"
      >
        Send it
      </button>
      <p className="text-center font-mono text-[11px] text-muted">
        opens your mail app · or copy:{" "}
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
