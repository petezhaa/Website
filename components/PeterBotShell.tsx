"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// The phone is one of the heaviest client components (keyboard grid, chat
// state, motion choreography) and most visitors never open it, so the page
// ships only this launcher, and the first tap fetches the rest.
const Phone = dynamic(() => import("@/components/PeterBot").then((m) => m.PeterBot), {
  ssr: false,
});

export function PeterBotShell() {
  const [wanted, setWanted] = useState(false);

  if (wanted) return <Phone initialOpen />;

  return (
    <button
      onClick={() => setWanted(true)}
      aria-label="Chat with PeterBot"
      className="btn-solid fixed bottom-5 right-5 z-[70] flex h-12 items-center gap-2 px-5 text-sm font-medium shadow-lg"
    >
      text me
    </button>
  );
}
