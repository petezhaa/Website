// Challenge links are entirely self-contained: the mode, the RNG seed, and
// your six guesses are packed into the URL, base64url-encoded. No backend, no
// storage. A friend who opens /c/<code> replays the exact same six rounds
// (the Rust engine's game_start(mode, seed) is deterministic) against your
// "ghost" pins. VERSION guards against engine changes that would shift rounds.

export type Challenge = {
  mode: number;
  seed: number;
  guesses: [number, number][]; // [lon, lat] per round
  score: number;
  streak: number;
  beat: number; // "beat a random clicker by Nx"
};

const VERSION = 1; // bump when the WASM mode list / coordinates change

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeChallenge(c: Challenge): string {
  const n = Math.min(c.guesses.length, 12);
  const buf = new ArrayBuffer(7 + 1 + n * 4 + 5);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o++, VERSION);
  dv.setUint8(o++, c.mode & 0xff);
  dv.setUint32(o, c.seed >>> 0);
  o += 4;
  dv.setUint8(o++, n);
  for (let i = 0; i < n; i++) {
    const [lon, lat] = c.guesses[i];
    dv.setInt16(o, Math.round((Math.max(-180, Math.min(180, lon)) / 180) * 32767));
    o += 2;
    dv.setInt16(o, Math.round((Math.max(-90, Math.min(90, lat)) / 90) * 32767));
    o += 2;
  }
  dv.setUint16(o, Math.min(65535, Math.max(0, Math.round(c.score))));
  o += 2;
  dv.setUint8(o++, Math.min(255, Math.max(0, Math.round(c.streak))));
  dv.setUint16(o, Math.min(65535, Math.max(0, Math.round(c.beat * 10))));
  o += 2;
  return toB64Url(new Uint8Array(buf));
}

export function decodeChallenge(code: string): Challenge | null {
  try {
    const bytes = fromB64Url(code);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    if (dv.getUint8(o++) !== VERSION) return null;
    const mode = dv.getUint8(o++);
    const seed = dv.getUint32(o) >>> 0;
    o += 4;
    const n = dv.getUint8(o++);
    if (n > 12 || 8 + n * 4 + 5 > bytes.length) return null;
    const guesses: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const lon = (dv.getInt16(o) / 32767) * 180;
      o += 2;
      const lat = (dv.getInt16(o) / 32767) * 90;
      o += 2;
      guesses.push([lon, lat]);
    }
    const score = dv.getUint16(o);
    o += 2;
    const streak = dv.getUint8(o++);
    const beat = dv.getUint16(o) / 10;
    return { mode, seed, guesses, score, streak, beat };
  } catch {
    return null;
  }
}

// rank title for the share card, mirrors the game's own tiers
export function rankTitle(pct: number): string {
  if (pct >= 90) return "Cartographer";
  if (pct >= 70) return "Navigator";
  if (pct >= 50) return "Tourist";
  if (pct >= 30) return "Lost";
  return "Where even is that";
}
