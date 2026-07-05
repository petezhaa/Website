// history.rs — one engine, three history games, standalone Rust -> wasm32
// (same rustc recipe as nim.rs). A curated event table feeds:
//   guess-year   pick the year on a slider; closeness + speed scored,
//                with more slack the older the event (nobody should need
//                the exact year of the Hijra to par)
//   which-first  two events, click the earlier; the year gap SHRINKS as
//                your streak grows
//   timeline     six shuffled events, order them; scored by correct pairs
//                (Kendall tau against true chronology)
//
// Years: negative = BC. Dates follow standard reference chronology.
//
// Build: rustc --target wasm32-unknown-unknown --crate-type cdylib
//        -C opt-level=z -C lto=fat -C codegen-units=1 -C panic=abort
//        -C strip=symbols -o public/history.bin rust/history.rs

#![allow(static_mut_refs)]

struct Event {
    name: &'static [u8],
    year: i32,
}

macro_rules! ev {
    ($name:literal, $year:expr) => {
        Event { name: concat!($name, "\0").as_bytes(), year: $year }
    };
}

static EVENTS: &[Event] = &[
    ev!("Great Pyramid of Giza completed", -2560),
    ev!("Code of Hammurabi written", -1754),
    ev!("First recorded Olympic Games", -776),
    ev!("Founding of Rome (traditional)", -753),
    ev!("Roman Republic founded", -509),
    ev!("Battle of Marathon", -490),
    ev!("Battle of Thermopylae", -480),
    ev!("Parthenon completed", -438),
    ev!("Death of Alexander the Great", -323),
    ev!("Qin unifies China", -221),
    ev!("Battle of Cannae", -216),
    ev!("Julius Caesar assassinated", -44),
    ev!("Battle of Actium", -31),
    ev!("Vesuvius buries Pompeii", 79),
    ev!("Colosseum completed", 80),
    ev!("Edict of Milan", 313),
    ev!("Visigoths sack Rome", 410),
    ev!("Fall of the Western Roman Empire", 476),
    ev!("Hagia Sophia completed", 537),
    ev!("The Hijra", 622),
    ev!("Battle of Tours", 732),
    ev!("Charlemagne crowned emperor", 800),
    ev!("Norse camp in Newfoundland", 1021),
    ev!("The Great Schism", 1054),
    ev!("Battle of Hastings", 1066),
    ev!("First Crusade takes Jerusalem", 1099),
    ev!("Magna Carta sealed", 1215),
    ev!("Death of Genghis Khan", 1227),
    ev!("Mongols sack Baghdad", 1258),
    ev!("Marco Polo sets out for China", 1271),
    ev!("Mansa Musa's pilgrimage to Mecca", 1324),
    ev!("Tenochtitlan founded", 1325),
    ev!("Black Death reaches Europe", 1347),
    ev!("Zheng He's first voyage", 1405),
    ev!("Gutenberg's printing press", 1440),
    ev!("Fall of Constantinople", 1453),
    ev!("Columbus reaches the Americas", 1492),
    ev!("Treaty of Tordesillas", 1494),
    ev!("Luther's Ninety-five Theses", 1517),
    ev!("Fall of Tenochtitlan", 1521),
    ev!("Magellan expedition circles the globe", 1522),
    ev!("Pizarro captures Atahualpa", 1532),
    ev!("Copernicus publishes heliocentrism", 1543),
    ev!("Council of Trent convenes", 1545),
    ev!("Spanish Armada defeated", 1588),
    ev!("Tokugawa shogunate established", 1603),
    ev!("Jamestown founded", 1607),
    ev!("Galileo turns a telescope on the sky", 1610),
    ev!("Defenestration of Prague", 1618),
    ev!("Peace of Westphalia", 1648),
    ev!("Charles I executed", 1649),
    ev!("Taj Mahal completed", 1653),
    ev!("Ottomans besiege Vienna", 1683),
    ev!("Newton's Principia published", 1687),
    ev!("The Glorious Revolution", 1688),
    ev!("Salem witch trials", 1692),
    ev!("Seven Years' War begins", 1756),
    ev!("Watt patents his steam engine", 1769),
    ev!("American Declaration of Independence", 1776),
    ev!("French Revolution begins", 1789),
    ev!("Haitian independence", 1804),
    ev!("Napoleon crowned emperor", 1804),
    ev!("Battle of Waterloo", 1815),
    ev!("Congress of Vienna concludes", 1815),
    ev!("First photograph taken", 1826),
    ev!("First Opium War begins", 1839),
    ev!("The Communist Manifesto published", 1848),
    ev!("Indian Rebellion of 1857", 1857),
    ev!("On the Origin of Species published", 1859),
    ev!("Battle of Gettysburg", 1863),
    ev!("Meiji Restoration", 1868),
    ev!("Suez Canal opens", 1869),
    ev!("US transcontinental railroad completed", 1869),
    ev!("German Empire proclaimed", 1871),
    ev!("Telephone patented", 1876),
    ev!("Berlin Conference on Africa", 1884),
    ev!("Eiffel Tower completed", 1889),
    ev!("First modern Olympics", 1896),
    ev!("Wright brothers fly", 1903),
    ev!("Special relativity published", 1905),
    ev!("Titanic sinks", 1912),
    ev!("First World War begins", 1914),
    ev!("Russian Revolution", 1917),
    ev!("Treaty of Versailles", 1919),
    ev!("Penicillin discovered", 1928),
    ev!("Wall Street crash", 1929),
    ev!("Second World War begins", 1939),
    ev!("D-Day landings", 1944),
    ev!("First atomic bomb detonated", 1945),
    ev!("ENIAC unveiled", 1946),
    ev!("Transistor invented", 1947),
    ev!("Indian independence", 1947),
    ev!("People's Republic of China founded", 1949),
    ev!("Korean War begins", 1950),
    ev!("DNA double helix described", 1953),
    ev!("Sputnik launched", 1957),
    ev!("Cuban Missile Crisis", 1962),
    ev!("Apollo 11 Moon landing", 1969),
    ev!("Intel 4004, the first microprocessor", 1971),
    ev!("First email sent", 1971),
    ev!("Apple founded", 1976),
    ev!("IBM PC released", 1981),
    ev!("Macintosh released", 1984),
    ev!("Berlin Wall falls", 1989),
    ev!("First website goes online", 1991),
    ev!("Soviet Union dissolves", 1991),
    ev!("NVIDIA founded", 1993),
    ev!("Google founded", 1998),
    ev!("GeForce 256, the first \"GPU\"", 1999),
    ev!("Human genome sequenced", 2003),
    ev!("iPhone announced", 2007),
    ev!("Bitcoin genesis block", 2009),
    // ---- US history ----
    ev!("Mayflower Compact signed", 1620),
    ev!("Boston Tea Party", 1773),
    ev!("US Constitutional Convention", 1787),
    ev!("Louisiana Purchase", 1803),
    ev!("Indian Removal Act", 1830),
    ev!("Seneca Falls Convention", 1848),
    ev!("Emancipation Proclamation", 1863),
    ev!("Reconstruction ends", 1877),
    ev!("Nineteenth Amendment ratified", 1920),
    ev!("The New Deal begins", 1933),
    ev!("Pearl Harbor attacked", 1941),
    ev!("Brown v. Board of Education", 1954),
    ev!("Montgomery Bus Boycott", 1955),
    ev!("Civil Rights Act signed", 1964),
    ev!("MLK assassinated", 1968),
    // ---- Chinese history (yes, including the Three Kingdoms) ----
    ev!("Birth of Confucius", -551),
    ev!("Warring States period begins", -475),
    ev!("Han dynasty founded", -202),
    ev!("Battle of Red Cliffs", 208),
    ev!("Three Kingdoms period begins", 220),
    ev!("Jin reunifies China", 280),
    ev!("Tang dynasty founded", 618),
    ev!("An Lushan Rebellion begins", 755),
    ev!("Song dynasty founded", 960),
    ev!("Kublai Khan proclaims the Yuan", 1271),
    ev!("Ming dynasty founded", 1368),
    ev!("Forbidden City completed", 1420),
    ev!("Qing dynasty begins", 1644),
    ev!("Taiping Rebellion begins", 1850),
    ev!("Boxer Rebellion", 1900),
    ev!("Qing dynasty falls", 1912),
    ev!("The Long March begins", 1934),
];

const ROUNDS: usize = 6;
const ROUND_MS: f64 = 20_000.0;

static mut RNG: u32 = 0x2545f491;

fn rnd(n: u32) -> u32 {
    unsafe {
        let mut x = RNG;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        RNG = if x == 0 { 0x9e3779b9 } else { x };
        RNG % n.max(1)
    }
}

fn seed_rng(seed: u32) {
    unsafe { RNG = if seed == 0 { 0x2545f491 } else { seed } }
}

#[no_mangle]
pub extern "C" fn n_events() -> i32 {
    EVENTS.len() as i32
}

#[no_mangle]
pub extern "C" fn event_name(i: i32) -> *const u8 {
    EVENTS
        .get(i as usize)
        .map_or(b"\0".as_ptr(), |e| e.name.as_ptr())
}

#[no_mangle]
pub extern "C" fn event_year(i: i32) -> i32 {
    EVENTS.get(i as usize).map_or(0, |e| e.year)
}

// ---------------- guess the year ----------------

static mut GY_ORDER: [usize; 256] = [0; 256];
static mut GY_ROUND: usize = 0;
static mut GY_TOTAL: i32 = 0;
static mut GY_LAST: i32 = 0;
static mut GY_GUESSED: bool = false;

#[no_mangle]
pub extern "C" fn gy_start(seed: u32) {
    seed_rng(seed);
    unsafe {
        let n = EVENTS.len();
        for i in 0..n {
            GY_ORDER[i] = i;
        }
        for i in (1..n).rev() {
            let j = rnd((i + 1) as u32) as usize;
            GY_ORDER.swap(i, j);
        }
        GY_ROUND = 0;
        GY_TOTAL = 0;
        GY_LAST = 0;
        GY_GUESSED = false;
    }
}

#[no_mangle]
pub extern "C" fn gy_round() -> i32 {
    unsafe { GY_ROUND as i32 }
}

#[no_mangle]
pub extern "C" fn gy_rounds() -> i32 {
    ROUNDS as i32
}

#[no_mangle]
pub extern "C" fn gy_event() -> i32 {
    unsafe { GY_ORDER[GY_ROUND.min(ROUNDS - 1)] as i32 }
}

/// score a year guess: half points at a slack that scales with the event's
/// age (guessing the pyramid within a century is fine; guessing the iPhone
/// within a century is not), speed bonus if close, bullseye within 2 years.
#[no_mangle]
pub extern "C" fn gy_submit(guess: i32, elapsed_ms: f64) -> i32 {
    unsafe {
        if GY_GUESSED || GY_ROUND >= ROUNDS {
            return GY_LAST;
        }
        let actual = EVENTS[GY_ORDER[GY_ROUND]].year;
        let age = (2026 - actual).max(20) as f64;
        let s = (age / 12.0).max(6.0); // years off that still earns half points
        let d = (guess - actual).abs() as f64;
        let mut base = (1000.0 * s * s / (s * s + d * d) + 0.5) as i32;
        if d <= 2.0 {
            base = 1000;
        }
        let mut bonus = 0;
        if base >= 400 && elapsed_ms >= 0.0 && elapsed_ms < ROUND_MS {
            bonus = (100.0 * (1.0 - elapsed_ms / ROUND_MS)) as i32;
        }
        GY_LAST = (base + bonus).min(1000);
        GY_TOTAL += GY_LAST;
        GY_GUESSED = true;
        GY_LAST
    }
}

#[no_mangle]
pub extern "C" fn gy_last() -> i32 {
    unsafe { GY_LAST }
}

#[no_mangle]
pub extern "C" fn gy_total() -> i32 {
    unsafe { GY_TOTAL }
}

#[no_mangle]
pub extern "C" fn gy_finished() -> i32 {
    unsafe { (GY_ROUND >= ROUNDS - 1 && GY_GUESSED) as i32 }
}

#[no_mangle]
pub extern "C" fn gy_next() -> i32 {
    unsafe {
        if !GY_GUESSED || GY_ROUND >= ROUNDS - 1 {
            return 0;
        }
        GY_ROUND += 1;
        GY_GUESSED = false;
        1
    }
}

// ---------------- which came first ----------------

static mut WF_A: usize = 0;
static mut WF_B: usize = 0;
static mut WF_STREAK: i32 = 0;
static mut WF_BEST: i32 = 0;
static mut WF_ALIVE: bool = true;

fn wf_deal() {
    unsafe {
        // the year gap tightens as the streak grows: 400 years down to 15
        let target = (400 / (WF_STREAK + 1)).max(15);
        for _ in 0..400 {
            let a = rnd(EVENTS.len() as u32) as usize;
            let b = rnd(EVENTS.len() as u32) as usize;
            if a == b {
                continue;
            }
            let gap = (EVENTS[a].year - EVENTS[b].year).abs();
            if gap > 0 && gap <= target * 3 && gap >= (target / 4).max(1) {
                WF_A = a;
                WF_B = b;
                return;
            }
        }
        // fallback: any distinct non-tied pair
        loop {
            let a = rnd(EVENTS.len() as u32) as usize;
            let b = rnd(EVENTS.len() as u32) as usize;
            if a != b && EVENTS[a].year != EVENTS[b].year {
                WF_A = a;
                WF_B = b;
                return;
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn wf_start(seed: u32) {
    seed_rng(seed);
    unsafe {
        WF_STREAK = 0;
        WF_BEST = 0;
        WF_ALIVE = true;
    }
    wf_deal();
}

#[no_mangle]
pub extern "C" fn wf_a() -> i32 {
    unsafe { WF_A as i32 }
}

#[no_mangle]
pub extern "C" fn wf_b() -> i32 {
    unsafe { WF_B as i32 }
}

/// answer with 1 if you think A came first, 0 for B. returns 1 correct.
#[no_mangle]
pub extern "C" fn wf_answer(picked_a: i32) -> i32 {
    unsafe {
        if !WF_ALIVE {
            return 0;
        }
        let a_first = EVENTS[WF_A].year < EVENTS[WF_B].year;
        let correct = (picked_a != 0) == a_first;
        if correct {
            WF_STREAK += 1;
            if WF_STREAK > WF_BEST {
                WF_BEST = WF_STREAK;
            }
            wf_deal();
            1
        } else {
            WF_ALIVE = false;
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn wf_streak() -> i32 {
    unsafe { WF_STREAK }
}

#[no_mangle]
pub extern "C" fn wf_best() -> i32 {
    unsafe { WF_BEST }
}

#[no_mangle]
pub extern "C" fn wf_alive() -> i32 {
    unsafe { WF_ALIVE as i32 }
}

// ---------------- timeline builder ----------------

static mut TL: [usize; ROUNDS] = [0; ROUNDS];

#[no_mangle]
pub extern "C" fn tl_deal(seed: u32) {
    seed_rng(seed);
    unsafe {
        let mut chosen = [false; 256];
        let mut k = 0;
        while k < ROUNDS {
            let i = rnd(EVENTS.len() as u32) as usize;
            // no duplicate years in a hand: ordering must be unambiguous
            let dup = (0..k).any(|j| EVENTS[TL[j]].year == EVENTS[i].year);
            if !chosen[i] && !dup {
                chosen[i] = true;
                TL[k] = i;
                k += 1;
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn tl_event(k: i32) -> i32 {
    unsafe {
        if k >= 0 && (k as usize) < ROUNDS {
            TL[k as usize] as i32
        } else {
            0
        }
    }
}

/// score a proposed ordering: args are positions in the dealt hand (0..5) in
/// the player's chronological order. Returns correctly-ordered pairs, 0..15.
#[no_mangle]
pub extern "C" fn tl_score(p0: i32, p1: i32, p2: i32, p3: i32, p4: i32, p5: i32) -> i32 {
    let p = [p0, p1, p2, p3, p4, p5];
    // validate: must be a permutation of 0..5
    let mut seen = [false; ROUNDS];
    for &x in &p {
        if x < 0 || x as usize >= ROUNDS || seen[x as usize] {
            return -1;
        }
        seen[x as usize] = true;
    }
    unsafe {
        let mut good = 0;
        for i in 0..ROUNDS {
            for j in (i + 1)..ROUNDS {
                if EVENTS[TL[p[i] as usize]].year <= EVENTS[TL[p[j] as usize]].year {
                    good += 1;
                }
            }
        }
        good
    }
}
