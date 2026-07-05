import { ImageResponse } from "next/og";
import {
  decodeHeresy,
  PARK_LIST,
  canonTier,
  TIER_LABELS,
  TIER_HEX,
} from "@/lib/heresy";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Park ranking heresy";

// Satori-safe: flexbox only, inline styles, literal hex, one default font.
export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const h = decodeHeresy(code) ?? [];
  const n = h.length;
  // the boldest moves first (largest tier jump), capped so the card breathes
  const bold = [...h]
    .sort(
      (a, b) =>
        Math.abs(canonTier(b.index) - b.tier) -
        Math.abs(canonTier(a.index) - a.tier)
    )
    .slice(0, 4);

  const chip = (digit: number) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 46,
        height: 46,
        borderRadius: 8,
        background: TIER_HEX[digit] ?? "#feff7f",
        color: "#26241e",
        fontSize: 30,
        fontWeight: 800,
      }}
    >
      {TIER_LABELS[digit]}
    </div>
  );

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
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30 }}>
          <span style={{ color: "#9a967f", letterSpacing: 3 }}>
            NATIONAL PARK RANKINGS
          </span>
          <span style={{ color: "#d3805a" }}>petezha.xyz</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 64, fontWeight: 800, color: "#e8e4d8" }}>
            {n} {n === 1 ? "heresy" : "heresies"} against the canon
          </span>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
            {bold.map(({ index, tier }) => (
              <div
                key={index}
                style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}
              >
                <span style={{ fontSize: 36, color: "#e8e4d8", width: 520 }}>
                  {PARK_LIST[index] ?? "Unknown"}
                </span>
                {chip(canonTier(index))}
                <span style={{ fontSize: 34, color: "#9a967f" }}>→</span>
                {chip(tier)}
              </div>
            ))}
          </div>
        </div>

        <span style={{ fontSize: 30, color: "#9a967f" }}>
          the tier list reverted every one of these. think you can do better?
        </span>
      </div>
    ),
    { ...size }
  );
}
