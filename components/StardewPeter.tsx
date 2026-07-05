// Stardew Peter, drawn from the "age four, allegedly" photo: buzz cut, gray
// sweatshirt with the red lettering band and the little chest crest, black
// sleeve panels, dark pants with the 83 patch — and the hands-on-hips scowl,
// which is the whole point. 16x25, front-facing idle.
const GRID = [
  "....HHHHHHHH....",
  "...HHHHHHHHHH...",
  "..HHHHHHHHHHHH..",
  "..HHssssssssHH..",
  "..ssssssssssss..",
  "..sssHssssHsss..",
  "..sseesssseess..",
  "..ssssssssssss..",
  "..sbssssssssbs..",
  "..SsssmmmmsssS..",
  "..SssssssssssS..",
  "...SssssssssS...",
  ".....ssssss.....",
  "...GGGGGGGGGG...",
  "..NNGGGGGGGGNN..",
  ".NNGGGGGGGGkGNN.",
  ".NsGRRRRRRRRGsN.",
  "..sGGGGGGGGGGs..",
  "....GGGGGGGG....",
  "....PPPPPPPP....",
  "....PPPPPPwwP...",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "....BBB..BBB....",
  "...BBBB..BBBB...",
];

const COLORS: Record<string, string> = {
  H: "#2a2018", // buzz-cut black hair (and the scowl brows)
  s: "#f0c298", // skin
  S: "#d99e73", // skin shade
  b: "#eb9d80", // toddler cheeks
  e: "#382a1d", // eyes
  m: "#b06e4e", // the pout. not a smile. he was four and unimpressed.
  G: "#8a8a8f", // gray sweatshirt
  N: "#26242a", // black shoulder panels
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
      height={(size / 16) * 25}
      viewBox="0 0 16 25"
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
