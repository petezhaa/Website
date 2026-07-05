// The hand-written half of the /now page — the part no API can fill in.
// Keep it short, honest, and in my own voice; update it when life shifts.
// (The other half — last film, recent games — is pulled live on the page.)

export const NOW_UPDATED = "July 2026";

export const NOW_LINES: { label: string; text: string }[] = [
  {
    label: "learning",
    text: "GPU systems programming and enough CUDA to be useful, mostly by breaking simulators until they explain themselves.",
  },
  {
    label: "reading",
    text: "more history than fiction lately — the older the campaign, the better.",
  },
  {
    label: "side project",
    text: "this website. The map game's engine is Rust compiled to WebAssembly, and I keep finding excuses to add modes.",
  },
  {
    label: "offline",
    text: "hiking when the calendar allows. The national park tier list on the home page is a live document, and I stand by Zion in C tier.",
  },
];
