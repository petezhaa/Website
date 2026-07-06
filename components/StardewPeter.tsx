// Stardew Peter, in the actual Stardew farmer style this time: the head is
// half the sprite, the face is flat and wide, there is NO mouth, the eyes are
// 2x2 with a white catchlight, the arms hang as straight columns, and the
// legs are stubs. The outfit carries the identity, it's the "age four,
// allegedly" fit: buzz cut, gray sweatshirt, red band, crest, the 83 pants.
const GRID = [
  "...HHHHHHHHHH...",
  "..HHHHHHHHHHHH..",
  "..HHhHHHHHHhHH..",
  "..HHssssssssHH..",
  "..ssssssssssss..",
  "..ssssssssssss..",
  "..ssEEssssEEss..",
  "..ssEWssssEWss..",
  "..ssssssssssss..",
  "..sSssssssssSs..",
  "..SSssssssssSS..",
  "...SSSSSSSSSS...",
  "..NGGGGGGGGGGN..",
  "..NGGGGGGGGkGN..",
  "..NGRRRRRRRRGN..",
  "..NGGGGGGGGGGN..",
  "..sGGGGGGGGGGs..",
  "....GGGGGGGG....",
  "....PPPPPPPP....",
  "....PPPPPwwP....",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "....BBB..BBB....",
  "...BBBB..BBBB...",
];

const COLORS: Record<string, string> = {
  H: "#2a2018", // buzz-cut black hair
  h: "#4a3a28", // the one hair highlight streak stardew allows
  s: "#f0c298", // skin
  S: "#d99e73", // skin shade (the flat stardew chin)
  E: "#382a1d", // eyes
  W: "#ffffff", // the catchlight
  G: "#8a8a8f", // gray sweatshirt
  N: "#26242a", // sleeve columns
  R: "#c03a2e", // the red lettering band
  k: "#e3cd76", // the chest crest
  P: "#1f1d22", // pants
  w: "#f5f3ec", // the 83 patch
  B: "#15131a", // shoes
};

export function StardewPeter({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size / 16) * 24}
      viewBox="0 0 16 24"
      shapeRendering="crispEdges"
      aria-hidden
      className="sd-bob shrink-0"
    >
      {GRID.flatMap((row, y) =>
        row.split("").map((cell, x) =>
          COLORS[cell] ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLORS[cell]} />
          ) : null
        )
      )}
    </svg>
  );
}
