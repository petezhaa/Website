// Pixel Peter, 16x16, Stardew Valley portrait style: soft palette, two-tone
// fluffy curtain hair, blush, jaw shading, big smile, navy suit + tie, and
// the ear stud. Drawn from the real headshot.
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
  "..sbssssssssbsg.",
  "..SssssssssssS..",
  "..SssttttttssS..",
  "...SssssssssS...",
  "..NnnwwiiwwnnN..",
  ".NnnnwwiiwwnnnN.",
  "NnnnnwwiiwwnnnnN",
];

const COLORS: Record<string, string> = {
  H: "#3a2c1f", // hair
  h: "#5b4630", // hair highlight
  s: "#f0c298", // skin
  S: "#d99e73", // skin shade (jaw, chin)
  b: "#eb9d80", // blush
  e: "#382a1d", // eyes
  t: "#fffdf5", // the smile
  w: "#f5f3ec", // shirt collar
  i: "#32415e", // tie
  n: "#1d3557", // suit
  N: "#16283f", // suit shade
  g: "#e3cd76", // ear stud
};

export function PixelPeter({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
      className="shrink-0 rounded-[2px] bg-surface-2"
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
