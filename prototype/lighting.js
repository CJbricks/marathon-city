// Marathon City time-of-day lighting. Plain JavaScript, no dependencies.
// Works in the browser (window.MarathonLighting / ES import via bundler) and in
// Node (require('./lighting.js') or CLI: `node lighting.js 18:45` -> JSON).
//
//   const L = lightingAt(new Date());   // uses the device's LOCAL clock
//   L.sky = [top, mid, horizon]  (RGB arrays, palette-shift these into bands)
//   L.ambient = [r,g,b] multiplier for the city/ground   (1 = untouched)
//   L.mountain / L.snow = multipliers for rock / snow pixels (alpenglow)
//   L.cloud = RGB, L.windowLight 0..1, L.stars 0..1, L.streetLights 0..1
//   L.sun / L.moon = { x: 0..1 across the view, alt: -1..1 above horizon, visible, color }
//   L.phase = name of the nearest keyframe, L.minutes = minutes after midnight
'use strict';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Keyframes at local minutes-after-midnight; values interpolate linearly
// between neighbours and wrap around midnight.
const KEYFRAMES = [
  { at: 0,         phase: 'night',   sky: ['#070b24', '#121a40', '#26305e'], cloud: '#2a3256',
    ambient: [0.30, 0.34, 0.52], mountain: [0.28, 0.30, 0.48], snow: [0.42, 0.46, 0.66], windowLight: 1, stars: 1, streetLights: 1 },
  { at: 5 * 60,    phase: 'night',   sky: ['#070b24', '#141c44', '#2c3462'], cloud: '#2a3256',
    ambient: [0.30, 0.34, 0.52], mountain: [0.28, 0.30, 0.48], snow: [0.42, 0.46, 0.66], windowLight: 1, stars: 1, streetLights: 1 },
  { at: 6 * 60 + 30, phase: 'dawn',  sky: ['#27305e', '#8a6f9e', '#f4a77a'], cloud: '#e8a8a0',
    ambient: [0.66, 0.58, 0.68], mountain: [0.66, 0.56, 0.70], snow: [1.0, 0.76, 0.80], windowLight: 0.55, stars: 0.2, streetLights: 0.8 },
  { at: 8 * 60 + 15, phase: 'morning', sky: ['#5f92d8', '#8ebfec', '#e8eef0'], cloud: '#fbf6ee',
    ambient: [1.02, 0.96, 0.88], mountain: [0.97, 0.95, 0.96], snow: [1.0, 0.95, 0.92], windowLight: 0.05, stars: 0, streetLights: 0 },
  { at: 12 * 60 + 30, phase: 'midday', sky: ['#5b8fd6', '#93c0ee', '#d6e8f4'], cloud: '#f4f8fc',
    ambient: [1, 1, 1], mountain: [1, 1, 1], snow: [1, 1, 1], windowLight: 0, stars: 0, streetLights: 0 },
  { at: 16 * 60,   phase: 'afternoon', sky: ['#5888d0', '#98c0e8', '#e4e6e0'], cloud: '#f8f4ec',
    ambient: [1.0, 0.98, 0.94], mountain: [0.97, 0.95, 0.95], snow: [1, 0.98, 0.95], windowLight: 0.05, stars: 0, streetLights: 0 },
  { at: 18 * 60,   phase: 'golden hour', sky: ['#4f7cc4', '#e8b48a', '#ffd27a'], cloud: '#ffe0b0',
    ambient: [1.04, 0.86, 0.66], mountain: [0.80, 0.70, 0.72], snow: [1.0, 0.86, 0.76], windowLight: 0.2, stars: 0, streetLights: 0.2 },
  { at: 19 * 60 + 30, phase: 'dusk', sky: ['#1e1d4a', '#7a4a7e', '#ff8f5e'], cloud: '#c86a7a',
    ambient: [0.58, 0.46, 0.60], mountain: [0.48, 0.38, 0.56], snow: [1.0, 0.64, 0.74], windowLight: 0.9, stars: 0.3, streetLights: 1 },
  { at: 20 * 60 + 45, phase: 'night', sky: ['#070b24', '#121a40', '#26305e'], cloud: '#2a3256',
    ambient: [0.30, 0.34, 0.52], mountain: [0.28, 0.30, 0.48], snow: [0.42, 0.46, 0.66], windowLight: 1, stars: 1, streetLights: 1 },
];
const SUNRISE = 6 * 60 + 45, SUNSET = 19 * 60 + 15;   // local minutes (fixed, Denver-ish)
const MOONRISE = 19 * 60 + 45, MOONSET = 6 * 60 + 15;

// Human-readable phase for captions (by local clock).
const PHASES = [[5 * 60 + 45, 'night'], [7 * 60 + 30, 'dawn'], [11 * 60, 'morning'], [14 * 60 + 30, 'midday'],
  [17 * 60 + 30, 'afternoon'], [18 * 60 + 30, 'golden hour'], [19 * 60, 'evening'], [20 * 60 + 15, 'dusk'], [1440, 'night']];
const phaseName = (m) => PHASES.find(([end]) => m < end)[1];

const lerp = (a, b, t) => a + (b - a) * t;
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const round = (a) => a.map((v) => Math.round(v));

function arc(m, rise, set) {            // 0..1 progress through the arc, wraps midnight
  const len = (set - rise + 1440) % 1440;
  const p = ((m - rise + 1440) % 1440) / len;
  return p;                              // >1 means below horizon
}

function lightingAtMinutes(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  let i = KEYFRAMES.length - 1;
  while (KEYFRAMES[i].at > m) i--;
  const a = KEYFRAMES[i], b = KEYFRAMES[(i + 1) % KEYFRAMES.length];
  const span = ((b.at - a.at) + 1440) % 1440 || 1440;
  const t = (m - a.at) / span;
  const L = { minutes: m, phase: phaseName(m), from: a.phase, to: b.phase, t: +t.toFixed(3) };
  L.sky = [0, 1, 2].map((k) => round(lerpArr(hex(a.sky[k]), hex(b.sky[k]), t)));
  L.cloud = round(lerpArr(hex(a.cloud), hex(b.cloud), t));
  for (const k of ['ambient', 'mountain', 'snow']) L[k] = lerpArr(a[k], b[k], t).map((v) => +v.toFixed(3));
  for (const k of ['windowLight', 'stars', 'streetLights']) L[k] = +lerp(a[k], b[k], t).toFixed(3);

  // Sun: view faces west toward the Front Range; it climbs from the left and
  // sets behind the mountains right of centre.
  const ps = arc(m, SUNRISE, SUNSET);
  const sunAlt = ps <= 1 ? Math.sin(Math.PI * ps) : -Math.sin(Math.PI * (ps - 1) * 0.5) * 0.2;
  const low = Math.max(0, 1 - Math.max(0, sunAlt) / 0.35);       // 1 near horizon
  L.sun = { x: +lerp(0.06, 0.62, Math.min(1, ps)).toFixed(3), alt: +sunAlt.toFixed(3), visible: ps <= 1,
            color: round(lerpArr([255, 246, 210], [255, 150, 70], low)) };
  const pm = arc(m, MOONRISE, MOONSET);
  L.moon = { x: +lerp(0.88, 0.18, Math.min(1, pm)).toFixed(3), alt: +(pm <= 1 ? Math.sin(Math.PI * pm) * 0.8 : -0.2).toFixed(3),
             visible: pm <= 1, color: [236, 238, 220] };
  return L;
}

function lightingAt(date) {             // local device clock
  const d = date || new Date();
  return lightingAtMinutes(d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60);
}

const api = { KEYFRAMES, PHASES, phaseName, SUNRISE, SUNSET, lightingAt, lightingAtMinutes };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MarathonLighting = api;

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const arg = process.argv[2];
  let L;
  if (arg) { const [h, mm] = arg.split(':').map(Number); L = lightingAtMinutes(h * 60 + (mm || 0)); }
  else L = lightingAt(new Date());
  process.stdout.write(JSON.stringify(L) + '\n');
}
