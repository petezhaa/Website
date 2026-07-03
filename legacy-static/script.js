// ---------- scroll reveal ----------
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// ---------- the AM I COOKED button ----------
const cookedBtn = document.getElementById("cookedBtn");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// no fake reassurance. real answers only.
const VERDICTS = [
  "no. and asking twice doesn't change the answer. lock in.",
  "you have NVIDIA on the resume. next question.",
  "cooked? you triple majored ON PURPOSE.",
  "honest answer: you're fine. honest-honest answer: back to work.",
  "ranking: 1) not cooked 2) everyone who said be realistic",
  "wait — you built a 480V power system at 19 and you're asking ME?",
  "mildly seasoned. never cooked.",
  "the ceiling remains unlocated. keep going.",
];
let verdictIndex = 0;
let toastEl = null;

function showVerdict() {
  if (toastEl) toastEl.remove();
  toastEl = document.createElement("div");
  toastEl.className = "decree";
  toastEl.setAttribute("role", "status");
  toastEl.textContent = VERDICTS[verdictIndex % VERDICTS.length];
  verdictIndex++;
  document.body.appendChild(toastEl);
  const el = toastEl;
  setTimeout(() => {
    if (el === toastEl) { el.remove(); toastEl = null; }
  }, 3400);
}

function rainStars(x, y) {
  if (reduceMotion) return;
  const bits = ["★", "⚡", "?!", "✦"];
  for (let i = 0; i < 14; i++) {
    const bit = document.createElement("span");
    bit.className = "mini-egg";
    bit.textContent = bits[i % bits.length];
    bit.style.color = ["#e4572e", "#f7b32b", "#17847b"][i % 3];
    bit.style.left = x + (i / 13 - 0.5) * 280 + (((i * 37) % 40) - 20) + "px";
    bit.style.top = y + (((i * 53) % 60) - 30) + "px";
    bit.style.animationDelay = (i % 5) * 0.06 + "s";
    document.body.appendChild(bit);
    setTimeout(() => bit.remove(), 2000);
  }
}

if (cookedBtn) {
  cookedBtn.addEventListener("click", () => {
    cookedBtn.classList.remove("crack");
    void cookedBtn.offsetWidth; // restart the shake animation
    cookedBtn.classList.add("crack");
    const rect = cookedBtn.getBoundingClientRect();
    rainStars(rect.left + rect.width / 2, rect.top + rect.height / 3);
    showVerdict();
  });
}
