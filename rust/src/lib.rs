//! mapgame — the geography game engine for peterzhao.dev, written in Rust.
//!
//! Compiled to a bare WebAssembly module (no wasm-bindgen, no JS glue):
//!   cargo build --release --target wasm32-unknown-unknown
//!
//! Rust owns the quiz data, round order, spherical distance math, scoring,
//! streaks, and the speed bonus. TypeScript owns what the browser owns:
//! projecting the map, animating the reveal, and handing clicks over the
//! FFI boundary. Strings cross as pointers into linear memory.

#![allow(static_mut_refs)]

const ROUNDS: usize = 6;
const EARTH_KM: f64 = 6371.0;
const ROUND_MS: f64 = 20_000.0; // answer fast for bonus points

struct Place {
    name: &'static [u8], // null-terminated for the FFI boundary
    lat: f64,
    lon: f64,
}

macro_rules! place {
    ($name:literal, $lat:expr, $lon:expr) => {
        Place { name: concat!($name, "\0").as_bytes(), lat: $lat, lon: $lon }
    };
}

// ---- mode 0: U.S. states ----
static STATES: &[Place] = &[
    place!("Wisconsin", 44.6, -89.7),
    place!("California", 37.2, -119.3),
    place!("Texas", 31.4, -99.3),
    place!("Florida", 28.6, -82.4),
    place!("New York", 42.9, -75.5),
    place!("Washington", 47.4, -120.4),
    place!("Colorado", 39.0, -105.5),
    place!("Maine", 45.4, -69.2),
    place!("Illinois", 40.0, -89.2),
    place!("Arizona", 34.3, -111.7),
    place!("Tennessee", 35.8, -86.3),
    place!("Minnesota", 46.3, -94.3),
];

// ---- mode 1: countries ----
static COUNTRIES: &[Place] = &[
    place!("Japan", 36.2, 138.3),
    place!("Brazil", -10.8, -52.9),
    place!("Egypt", 26.8, 30.8),
    place!("Mongolia", 46.9, 103.5),
    place!("France", 46.6, 2.5),
    place!("Kenya", 0.5, 37.9),
    place!("Australia", -25.3, 133.8),
    place!("Norway", 61.6, 9.1),
    place!("India", 22.9, 79.6),
    place!("Peru", -9.2, -74.4),
    place!("Turkey", 39.0, 35.4),
    place!("Vietnam", 16.6, 106.3),
];

// ---- mode 2: historical battles ----
static BATTLES: &[Place] = &[
    place!("Gettysburg (1863)", 39.81, -77.23),
    place!("Hastings (1066)", 50.91, 0.49),
    place!("Thermopylae (480 BC)", 38.80, 22.54),
    place!("Waterloo (1815)", 50.68, 4.41),
    place!("Stalingrad (1942)", 48.71, 44.51),
    place!("Midway (1942)", 28.20, -177.35),
    place!("Cannae (216 BC)", 41.30, 16.13),
    place!("Agincourt (1415)", 50.46, 2.14),
    place!("Yorktown (1781)", 37.23, -76.51),
    place!("Sekigahara (1600)", 35.37, 136.46),
    place!("Tours (732)", 47.39, 0.69),
    place!("Marathon (490 BC)", 38.12, 23.97),
];

// ---- mode 3: where presidents were born ----
static PRESIDENTS: &[Place] = &[
    place!("Theodore Roosevelt — b. 1858", 40.74, -73.99), // NYC. the guy.
    place!("Abraham Lincoln — b. 1809", 37.53, -85.74),    // Hodgenville, KY
    place!("George Washington — b. 1732", 38.19, -76.93),  // Westmoreland Co, VA
    place!("Barack Obama — b. 1961", 21.31, -157.86),      // Honolulu, HI
    place!("John F. Kennedy — b. 1917", 42.33, -71.12),    // Brookline, MA
    place!("Ronald Reagan — b. 1911", 41.63, -89.79),      // Tampico, IL
    place!("Jimmy Carter — b. 1924", 32.03, -84.39),       // Plains, GA
    place!("Dwight Eisenhower — b. 1890", 33.76, -96.54),  // Denison, TX
    place!("Richard Nixon — b. 1913", 33.89, -117.81),     // Yorba Linda, CA
    place!("Ulysses S. Grant — b. 1822", 38.89, -84.23),   // Point Pleasant, OH
];

// ---- mode 4: where the chips are actually made ----
static FABS: &[Place] = &[
    place!("TSMC Fab 18 — 3nm", 23.11, 120.27),        // Tainan, Taiwan
    place!("Samsung Pyeongtaek", 37.00, 127.06),       // South Korea
    place!("Intel Gordon Moore Park", 45.54, -122.96), // Hillsboro, Oregon
    place!("TSMC Arizona", 33.69, -112.13),            // Phoenix
    place!("Micron HQ fab", 43.53, -116.14),           // Boise, Idaho
    place!("SK Hynix Icheon", 37.27, 127.44),          // South Korea
    place!("GlobalFoundries Fab 1", 51.13, 13.72),     // Dresden, Germany
    place!("Intel Fab 34", 53.37, -6.51),              // Leixlip, Ireland
    place!("TI Sherman fab", 33.71, -96.65),           // Texas
    place!("ASML HQ (the EUV machines)", 51.40, 5.40), // Veldhoven, NL
];

// ---- mode 5: world capitals ----
static CAPITALS: &[Place] = &[
    place!("Reykjavik, Iceland", 64.15, -21.94),
    place!("Canberra, Australia", -35.28, 149.13),
    place!("Ottawa, Canada", 45.42, -75.70),
    place!("Brasilia, Brazil", -15.79, -47.88),
    place!("Cairo, Egypt", 30.04, 31.24),
    place!("Tokyo, Japan", 35.68, 139.69),
    place!("Wellington, New Zealand", -41.29, 174.78),
    place!("Nairobi, Kenya", -1.29, 36.82),
    place!("Ulaanbaatar, Mongolia", 47.89, 106.91),
    place!("Bern, Switzerland", 46.95, 7.45),
    place!("Hanoi, Vietnam", 21.03, 105.85),
    place!("Astana, Kazakhstan", 51.17, 71.43),
    place!("Lima, Peru", -12.05, -77.04),
    place!("Madrid, Spain", 40.42, -3.70),
    place!("Helsinki, Finland", 60.17, 24.94),
    place!("Kathmandu, Nepal", 27.72, 85.32),
];

// ---- mode 6: national parks (the tier list, now with consequences) ----
static PARKS: &[Place] = &[
    place!("Yellowstone", 44.6, -110.5),
    place!("Yosemite", 37.85, -119.55),
    place!("Grand Canyon", 36.10, -112.10),
    place!("Zion (C tier, fight me)", 37.30, -113.05),
    place!("Black Canyon of the Gunnison", 38.57, -107.72),
    place!("Glacier", 48.70, -113.80),
    place!("Acadia", 44.35, -68.21),
    place!("Great Smoky Mountains", 35.60, -83.50),
    place!("Rocky Mountain", 40.40, -105.70),
    place!("Olympic", 47.80, -123.60),
    place!("Arches", 38.70, -109.57),
    place!("Badlands", 43.75, -102.50),
    place!("Everglades", 25.30, -80.90),
    place!("Death Valley", 36.50, -117.00),
    place!("Denali", 63.10, -151.00),
    place!("Crater Lake", 42.94, -122.10),
];

// ---- mode 7: where's Peter? (an autobiographical tour of my actual life) ----
static WHERES_PETER: &[Place] = &[
    place!("where I grew up (Pulaski, WI)", 44.67, -88.24),
    place!("my parents' restaurant, China Wok", 44.67, -88.21), // Pulaski, WI
    place!("Green Bay — go Packers", 44.51, -88.02),
    place!("UW–Madison, three majors", 43.08, -89.41),
    place!("Amazon, summer 2025", 47.62, -122.34), // Seattle
    place!("NVIDIA, where I am now", 37.37, -121.96), // Santa Clara
];

struct Mode {
    name: &'static [u8],
    places: &'static [Place],
    scale_km: f64, // distance worth half points
    us_map: bool,
}

static MODES: &[Mode] = &[
    Mode { name: b"U.S. States\0", places: STATES, scale_km: 350.0, us_map: true },
    Mode { name: b"Countries\0", places: COUNTRIES, scale_km: 1100.0, us_map: false },
    Mode { name: b"Historical Battles\0", places: BATTLES, scale_km: 800.0, us_map: false },
    Mode { name: b"Presidential Birthplaces\0", places: PRESIDENTS, scale_km: 400.0, us_map: true },
    Mode { name: b"Chip Fabs of the World\0", places: FABS, scale_km: 800.0, us_map: false },
    Mode { name: b"World Capitals\0", places: CAPITALS, scale_km: 600.0, us_map: false },
    Mode { name: b"National Parks\0", places: PARKS, scale_km: 300.0, us_map: true },
    Mode { name: b"Where's Peter?\0", places: WHERES_PETER, scale_km: 300.0, us_map: true },
];

// ---- game state (wasm is single-threaded; a static is honest about that) ----
struct Game {
    mode: usize,
    order: [usize; 16],
    round: usize,
    total: u32,
    streak: u32,
    best_streak: u32,
    last_pts: u32,
    last_bonus: u32,
    last_dist: f64,
    guessed: bool,
    rng: u32,
}

static mut GAME: Game = Game {
    mode: 0,
    order: [0; 16],
    round: 0,
    total: 0,
    streak: 0,
    best_streak: 0,
    last_pts: 0,
    last_bonus: 0,
    last_dist: 0.0,
    guessed: false,
    rng: 0x2f5233,
};

fn rng_next(g: &mut Game) -> u32 {
    let mut x = g.rng;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    g.rng = if x == 0 { 0x9e3779b9 } else { x };
    g.rng
}

/// Proper haversine — Rust's core float intrinsics compile straight to wasm,
/// so unlike the freestanding C++ version there's no hand-rolled cosine here.
fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let (la1, la2) = (lat1.to_radians(), lat2.to_radians());
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2) + la1.cos() * la2.cos() * (dlon / 2.0).sin().powi(2);
    2.0 * EARTH_KM * a.sqrt().atan2((1.0 - a).sqrt())
}

fn current(g: &Game) -> &'static Place {
    &MODES[g.mode].places[g.order[g.round]]
}

// ================= exports =================

#[no_mangle]
pub extern "C" fn mode_count() -> i32 {
    MODES.len() as i32
}

#[no_mangle]
pub extern "C" fn mode_name(m: i32) -> *const u8 {
    MODES.get(m as usize).map_or(b"\0".as_ptr(), |md| md.name.as_ptr())
}

#[no_mangle]
pub extern "C" fn mode_uses_us_map(m: i32) -> i32 {
    MODES.get(m as usize).map_or(0, |md| md.us_map as i32)
}

#[no_mangle]
pub extern "C" fn mode_scale_km(m: i32) -> f64 {
    MODES.get(m as usize).map_or(800.0, |md| md.scale_km)
}

#[no_mangle]
pub extern "C" fn round_count() -> i32 {
    ROUNDS as i32
}

#[no_mangle]
pub extern "C" fn game_start(m: i32, seed: u32) {
    let g = unsafe { &mut GAME };
    g.mode = (m as usize).min(MODES.len() - 1);
    g.rng = if seed == 0 { 0x2f5233 } else { seed };
    let n = MODES[g.mode].places.len();
    for i in 0..n {
        g.order[i] = i;
    }
    for i in (1..n).rev() {
        // Fisher–Yates
        let j = (rng_next(g) as usize) % (i + 1);
        g.order.swap(i, j);
    }
    g.round = 0;
    g.total = 0;
    g.streak = 0;
    g.best_streak = 0;
    g.last_pts = 0;
    g.last_bonus = 0;
    g.last_dist = 0.0;
    g.guessed = false;
}

#[no_mangle]
pub extern "C" fn prompt_name() -> *const u8 {
    unsafe { current(&GAME).name.as_ptr() }
}

#[no_mangle]
pub extern "C" fn target_lat() -> f64 {
    unsafe { current(&GAME).lat }
}

#[no_mangle]
pub extern "C" fn target_lon() -> f64 {
    unsafe { current(&GAME).lon }
}

/// Score a guess. Base points fall off smoothly with distance (half points
/// at the mode's scale distance, <25 km is a bullseye). Answering inside the
/// 20-second window earns a speed bonus of up to 100 — but only if the guess
/// was decent. Total per round caps at 1000. Accurate streaks are tracked.
#[no_mangle]
pub extern "C" fn submit_guess(lat: f64, lon: f64, elapsed_ms: f64) -> i32 {
    let g = unsafe { &mut GAME };
    if g.guessed {
        return g.last_pts as i32;
    }
    let p = current(g);
    let d = haversine_km(lat, lon, p.lat, p.lon);
    let s = MODES[g.mode].scale_km;

    let mut base = (1000.0 * s * s / (s * s + d * d) + 0.5) as u32;
    if d < 25.0 {
        base = 1000; // bullseye — take the win
    }

    let mut bonus = 0u32;
    if base >= 400 && elapsed_ms >= 0.0 && elapsed_ms < ROUND_MS {
        bonus = (100.0 * (1.0 - elapsed_ms / ROUND_MS)) as u32;
    }

    let pts = (base + bonus).min(1000);
    if base >= 700 {
        g.streak += 1;
        g.best_streak = g.best_streak.max(g.streak);
    } else {
        g.streak = 0;
    }

    g.last_dist = d;
    g.last_pts = pts;
    g.last_bonus = bonus;
    g.total += pts;
    g.guessed = true;
    pts as i32
}

#[no_mangle]
pub extern "C" fn last_distance_km() -> f64 {
    unsafe { GAME.last_dist }
}

#[no_mangle]
pub extern "C" fn last_points() -> i32 {
    unsafe { GAME.last_pts as i32 }
}

#[no_mangle]
pub extern "C" fn last_bonus() -> i32 {
    unsafe { GAME.last_bonus as i32 }
}

#[no_mangle]
pub extern "C" fn streak() -> i32 {
    unsafe { GAME.streak as i32 }
}

#[no_mangle]
pub extern "C" fn best_streak() -> i32 {
    unsafe { GAME.best_streak as i32 }
}

#[no_mangle]
pub extern "C" fn current_round() -> i32 {
    unsafe { GAME.round as i32 }
}

#[no_mangle]
pub extern "C" fn total_score() -> i32 {
    unsafe { GAME.total as i32 }
}

#[no_mangle]
pub extern "C" fn max_score() -> i32 {
    (ROUNDS * 1000) as i32
}

#[no_mangle]
pub extern "C" fn game_finished() -> i32 {
    let g = unsafe { &GAME };
    (g.round >= ROUNDS - 1 && g.guessed) as i32
}

/// Advance to the next round. Returns 0 if the game is over.
#[no_mangle]
pub extern "C" fn next_round() -> i32 {
    let g = unsafe { &mut GAME };
    if !g.guessed || g.round >= ROUNDS - 1 {
        return 0;
    }
    g.round += 1;
    g.guessed = false;
    1
}
