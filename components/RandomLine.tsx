"use client";

import { useEffect, useState } from "react";

// picks one line per visit, after mount so the server and client agree
export function RandomLine({ lines }: { lines: string[] }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    setLine(lines[Math.floor(Math.random() * lines.length)] ?? null);
  }, [lines]);

  if (!line) return null;
  return (
    <p className="mt-4 font-mono text-xs text-muted">
      {line}{" "}
      <span className="text-muted/60">
        (a language model wrote this from my live stats)
      </span>
    </p>
  );
}
