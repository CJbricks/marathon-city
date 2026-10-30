// Time-of-day lighting, ported from prototype/lighting.js.
// The city view calls lightingAt(new Date()) so dawn, day, dusk, and night
// follow the phone's clock, not a fixed preview hour. The keyframes are the
// same numbers the Python renderer used, which is why a 6:30 shot and the
// in-app dawn should agree.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const KEYFRAMES = [
  { at: 0, phase: "night", sky: ["#070b24", "#121a40", "#26305e"], cloud: "#2a3256", ambient: [0.3, 0.34, 0.52], mountain: [0.28, 0.3, 0.48], snow: [0.42, 0.46, 0.66], windowLight: 1, stars: 1, streetLights: 1 },
  { at: 5 * 60, phase: "night", sky: ["#070b24", "#141c44", "#2c3462"], cloud: "#2a3256", ambient: [0.3, 0.34, 0.52], mountain: [0.28, 0.3, 0.48], snow: [0.42, 0.46, 0.66], windowLight: 1, stars: 1, streetLights: 1 },
  { at: 6 * 60 + 30, phase: "dawn", sky: ["#27305e", "#8a6f9e", "#f4a77a"], cloud: "#e8a8a0", ambient: [0.66, 0.58, 0.68], mountain: [0.66, 0.56, 0.7], snow: [1, 0.76, 0.8], windowLight: 0.55, stars: 0.2, streetLights: 0.8 },
  { at: 8 * 60 + 15, phase: "morning", sky: ["#5f92d8", "#8ebfec", "#e8eef0"], cloud: "#fbf6ee", ambient: [1.02, 0.96, 0.88], mountain: [0.97, 0.95, 0.96], snow: [1, 0.95, 0.92], windowLight: 0.05, stars: 0, streetLights: 0 },
  { at: 12 * 60 + 30, phase: "midday", sky: ["#5b8fd6", "#93c0ee", "#d6e8f4"], cloud: "#f4f8fc", ambient: [1, 1, 1], mountain: [1, 1, 1], snow: [1, 1, 1], windowLight: 0, stars: 0, streetLights: 0 },
  { at: 16 * 60, phase: "afternoon", sky: ["#5888d0", "#98c0e8", "#e4e6e0"], cloud: "#f8f4ec", ambient: [1, 0.98, 0.94], mountain: [0.97, 0.95, 0.95], snow: [1, 0.98, 0.95], windowLight: 0.05, stars: 0, streetLights: 0 },
  { at: 18 * 60, phase: "golden hour", sky: ["#4f7cc4", "#e8b48a", "#ffd27a"], cloud: "#ffe0b0", ambient: [1.04, 0.86, 0.66], mountain: [0.8, 0.7, 0.72], snow: [1, 0.86, 0.76], windowLight: 0.2, stars: 0, streetLights: 0.2 },
  { at: 19 * 60 + 30, phase: "dusk", sky: ["#1e1d4a", "#7a4a7e", "#ff8f5e"], cloud: "#c86a7a", ambient: [0.58, 0.46, 0.6], mountain: [0.48, 0.38, 0.56], snow: [1, 0.64, 0.74], windowLight: 0.9, stars: 0.3, streetLights: 1 },
  { at: 20 * 60 + 45, phase: "night", sky: ["#070b24", "#121a40", "#26305e"], cloud: "#2a3256", ambient: [0.3, 0.34, 0.52], mountain: [0.28, 0.3, 0.48], snow: [0.42, 0.46, 0.66], windowLight: 1, stars: 1, streetLights: 1 },
];

const SUNRISE = 6 * 60 + 45;
const SUNSET = 19 * 60 + 15;
const MOONRISE = 19 * 60 + 45;
const MOONSET = 6 * 60 + 15;

const PHASES = [
  [5 * 60 + 45, "night"],
  [7 * 60 + 30, "dawn"],
  [11 * 60, "morning"],
  [14 * 60 + 30, "midday"],
  [17 * 60 + 30, "afternoon"],
  [18 * 60 + 30, "golden hour"],
  [19 * 60, "evening"],
  [20 * 60 + 15, "dusk"],
  [1440, "night"],
];

const phaseName = (m) => PHASES.find(([end]) => m < end)[1];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const round = (a) => a.map((v) => Math.round(v));

function arc(m, rise, set) {
  const len = (set - rise + 1440) % 1440;
  return ((m - rise + 1440) % 1440) / len;
}

export function lightingAtMinutes(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  let i = KEYFRAMES.length - 1;
  while (KEYFRAMES[i].at > m) i--;
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[(i + 1) % KEYFRAMES.length];
  const span = (b.at - a.at + 1440) % 1440 || 1440;
  const t = (m - a.at) / span;
  const L = { minutes: m, phase: phaseName(m), t: +t.toFixed(3) };
  L.sky = [0, 1, 2].map((k) => round(lerpArr(hex(a.sky[k]), hex(b.sky[k]), t)));
  L.cloud = round(lerpArr(hex(a.cloud), hex(b.cloud), t));
  for (const k of ["ambient", "mountain", "snow"]) {
    L[k] = lerpArr(a[k], b[k], t).map((v) => +v.toFixed(3));
  }
  for (const k of ["windowLight", "stars", "streetLights"]) L[k] = +lerp(a[k], b[k], t).toFixed(3);
  const ps = arc(m, SUNRISE, SUNSET);
  const sunAlt = ps <= 1 ? Math.sin(Math.PI * ps) : -Math.sin(Math.PI * (ps - 1) * 0.5) * 0.2;
  const low = Math.max(0, 1 - Math.max(0, sunAlt) / 0.35);
  L.sun = {
    x: +lerp(0.06, 0.62, Math.min(1, ps)).toFixed(3),
    alt: +sunAlt.toFixed(3),
    visible: ps <= 1,
    color: round(lerpArr([255, 246, 210], [255, 150, 70], low)),
  };
  const pm = arc(m, MOONRISE, MOONSET);
  L.moon = {
    x: +lerp(0.88, 0.18, Math.min(1, pm)).toFixed(3),
    alt: +(pm <= 1 ? Math.sin(Math.PI * pm) * 0.8 : -0.2).toFixed(3),
    visible: pm <= 1,
    color: [236, 238, 220],
  };
  return L;
}

export function lightingAt(date) {
  const d = date || new Date();
  return lightingAtMinutes(d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60);
}

export function rgbCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}
