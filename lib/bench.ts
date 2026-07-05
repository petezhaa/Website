// bench.ts — the JavaScript contender. Same haversine recipe, operation for
// operation, as bench.cpp and bench.rs (hand-rolled sin/cos/atan), so all three
// return an identical checksum. This is the one that doesn't get compiled to
// wasm, which is the whole point of the race.

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const D2R = 0.017453292519943295;
const R = 6371.0;

function hsin(x: number): number {
  const k = Math.floor(x / TWO_PI + 0.5);
  x = x - k * TWO_PI;
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return (
    x *
    (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880)))))
  );
}
function hcos(x: number): number {
  return hsin(x + HALF_PI);
}
function hatan(t: number): number {
  let inv = false;
  if (t > 1) {
    t = 1 / t;
    inv = true;
  }
  const t2 = t * t;
  const r =
    t *
    (0.9998660 +
      t2 * (-0.3302995 + t2 * (0.1801410 + t2 * (-0.0851330 + t2 * 0.0208351))));
  return inv ? HALF_PI - r : r;
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const la1 = lat1 * D2R;
  const la2 = lat2 * D2R;
  const dlat = (lat2 - lat1) * D2R;
  const dlon = (lon2 - lon1) * D2R;
  const s1 = hsin(dlat * 0.5);
  const s2 = hsin(dlon * 0.5);
  let a = s1 * s1 + hcos(la1) * hcos(la2) * s2 * s2;
  if (a < 0) a = 0;
  if (a > 1) a = 1;
  const y = Math.sqrt(a);
  const x = Math.sqrt(1 - a);
  const c = x === 0 ? HALF_PI : hatan(y / x);
  return 2 * R * c;
}

// one step of xorshift32, kept in unsigned 32-bit space to match C++/Rust
function xs(s: number): number {
  s = (s ^ (s << 13)) >>> 0;
  s = (s ^ (s >>> 17)) >>> 0;
  s = (s ^ (s << 5)) >>> 0;
  return s >>> 0;
}

export function benchRun(n: number): number {
  let s = 0x2545f491 >>> 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    s = xs(s);
    const lat1 = (s / 4294967296) * 180 - 90;
    s = xs(s);
    const lon1 = (s / 4294967296) * 360 - 180;
    s = xs(s);
    const lat2 = (s / 4294967296) * 180 - 90;
    s = xs(s);
    const lon2 = (s / 4294967296) * 360 - 180;
    sum += haversine(lat1, lon1, lat2, lon2);
  }
  return sum;
}
