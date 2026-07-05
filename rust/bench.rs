// bench.rs — standalone Rust compiled straight to wasm32 with rustc (no cargo).
// Same haversine recipe, operation for operation, as bench.cpp and bench.ts:
// hand-rolled sin/cos/atan so all three return an identical checksum and only
// the speed differs. sqrt/floor are the wasm float instructions.
//
// Build: rustc --target wasm32-unknown-unknown --crate-type cdylib
//              -C opt-level=3 -C panic=abort -o public/benchrs.bin rust/bench.rs

const PI: f64 = 3.141592653589793;
const TWO_PI: f64 = 6.283185307179586;
const HALF_PI: f64 = 1.5707963267948966;
const D2R: f64 = 0.017453292519943295;
const R: f64 = 6371.0;

fn hsin(mut x: f64) -> f64 {
    let k = (x / TWO_PI + 0.5).floor();
    x -= k * TWO_PI; // [-pi, pi]
    if x > HALF_PI {
        x = PI - x;
    } else if x < -HALF_PI {
        x = -PI - x;
    }
    let x2 = x * x;
    x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0
        + x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))))
}
fn hcos(x: f64) -> f64 {
    hsin(x + HALF_PI)
}
fn hatan(mut t: f64) -> f64 {
    let inv = t > 1.0;
    if inv {
        t = 1.0 / t;
    }
    let t2 = t * t;
    let r = t * (0.9998660 + t2 * (-0.3302995 + t2 * (0.1801410
        + t2 * (-0.0851330 + t2 * 0.0208351))));
    if inv { HALF_PI - r } else { r }
}
fn haversine(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let la1 = lat1 * D2R;
    let la2 = lat2 * D2R;
    let dlat = (lat2 - lat1) * D2R;
    let dlon = (lon2 - lon1) * D2R;
    let s1 = hsin(dlat * 0.5);
    let s2 = hsin(dlon * 0.5);
    let mut a = s1 * s1 + hcos(la1) * hcos(la2) * s2 * s2;
    if a < 0.0 {
        a = 0.0;
    }
    if a > 1.0 {
        a = 1.0;
    }
    let y = a.sqrt();
    let x = (1.0 - a).sqrt();
    let c = if x == 0.0 { HALF_PI } else { hatan(y / x) };
    2.0 * R * c
}

#[no_mangle]
pub extern "C" fn bench_run(n: i32) -> f64 {
    let mut s: u32 = 0x2545F491;
    let mut sum = 0.0f64;
    for _ in 0..n {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        let lat1 = (s as f64 / 4294967296.0) * 180.0 - 90.0;
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        let lon1 = (s as f64 / 4294967296.0) * 360.0 - 180.0;
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        let lat2 = (s as f64 / 4294967296.0) * 180.0 - 90.0;
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        let lon2 = (s as f64 / 4294967296.0) * 360.0 - 180.0;
        sum += haversine(lat1, lon1, lat2, lon2);
    }
    sum
}
