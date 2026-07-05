// Stardew Peter: the PixelPeter portrait grown a body, farmer build —
// flannel in the site's rust, denim overalls, boots. 16x28, front-facing
// idle, same palette family as the 16x16 portrait so it reads as the same
// guy who moved to the valley.
const GRID = [
  "....HHHHHHHH....",
  "...HHHHHHHHHH...",
  "..HHhhHHHHhhHH..",
  "..HHHHHHHHHHHH..",
  "..HHHHHHHHHHHH..",
  "..HHHHssssHHHH..",
  "..HHssssssssHH..",
  "..HssssssssssH..",
  "..HsseesseessH..",
  "..sbssssssssbs..",
  "..SssssssssssS..",
  "..SssttttttssS..",
  "...SssssssssS...",
  ".....ssssss.....",
  "...FFFFFFFFFF...",
  "..FFFFFFFFFFFF..",
  "..FFFkDFFDkFFF..",
  "..FFFDDFFDDFFF..",
  "..sFDDDDDDDDFs..",
  "..ssDDDDDDDDss..",
  "....DDDDDDDD....",
  "....DDDdDDDD....",
  "....DDDDDDDD....",
  "....DDD..DDD....",
  "....DDD..DDD....",
  "....ddd..ddd....",
  "....BBB..BBB....",
  "...BBBB..BBBB...",
];

const COLORS: Record<string, string> = {
  H: "#3a2c1f", // hair
  h: "#5b4630", // hair highlight
  s: "#f0c298", // skin
  S: "#d99e73", // skin shade
  b: "#eb9d80", // blush
  e: "#382a1d", // eyes
  t: "#fffdf5", // the smile
  F: "#bf5b32", // flannel (the site's rust, naturally)
  f: "#97462a", // flannel shade
  k: "#e3cd76", // overall buckles
  D: "#3f5d8c", // denim
  d: "#2f4668", // denim shade
  B: "#5f4126", // boots
};

export function StardewPeter({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size / 16) * 28}
      viewBox="0 0 16 28"
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
