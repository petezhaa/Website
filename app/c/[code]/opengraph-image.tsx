import { ImageResponse } from "next/og";
import { decodeChallenge, rankTitle } from "@/lib/challenge";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Map game challenge";

// Satori constraints: flexbox only (no grid), inline styles, literal hex
// (no CSS variables), one default font. Kept deliberately simple.
export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const c = decodeChallenge(code);
  const score = c?.score ?? 0;
  const pct = Math.round((score / 6000) * 100);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#161814",
          color: "#e8e4d8",
          padding: 72,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 30,
          }}
        >
          <span style={{ color: "#9a967f", letterSpacing: 3 }}>
            PETER&apos;S MAP GAME
          </span>
          <span style={{ color: "#d3805a" }}>petezha.xyz</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 40, color: "#9a967f" }}>beat my score</span>
          <span style={{ fontSize: 190, fontWeight: 800, lineHeight: 1, color: "#e8e4d8" }}>
            {score.toLocaleString()}
          </span>
          <span style={{ fontSize: 46, color: "#d3805a", marginTop: 12 }}>
            {rankTitle(pct)} · {pct}% · same six rounds
          </span>
        </div>

        <span style={{ fontSize: 32, color: "#9a967f" }}>
          {c && c.beat >= 1
            ? `beat a random clicker by ${c.beat.toFixed(1)}× — think you can do better?`
            : "think you can do better?"}
        </span>
      </div>
    ),
    { ...size }
  );
}
