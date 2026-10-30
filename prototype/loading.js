// Marathon City loading screen. Plain JavaScript, no dependencies.
// Draws a 320x200 pixel-art screen into any RGBA buffer ({width, height, data})
// such as a canvas ImageData. Palette: homage to the 1980s Denver "rainbow skyline"
// colours (navy / gold / red-orange-yellow stripes / green + blue skyline).
//
// Browser:  const h = MarathonLoading.mount(canvas);  h.setProgress(0.42);  h.ready();
// Node:     const { drawLoading } = require('./loading.js');
//           drawLoading(img, { progress: 0.6, t: 1.25 });   // t = seconds (animation clock)
'use strict';

const W = 320, H = 200;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const PAL = {
  navy: hex('#0D2A6B'), navyDeep: hex('#081C4C'), navyShadow: hex('#05143A'), navyLite: hex('#1B3F8F'),
  gold: hex('#FDD835'), goldDark: hex('#B88A00'), goldLite: hex('#FFF59D'),
  red: hex('#D62828'), orangeRed: hex('#E8501E'), orange: hex('#F57C00'), yellowOrange: hex('#FBA41A'), yellow: hex('#FDD835'),
  sun: hex('#FFF3A0'), white: hex('#FFFFFF'), snowShade: hex('#C9D6F2'),
  green: hex('#43A047'), greenLite: hex('#66BB6A'), greenDark: hex('#2E7D32'),
  blue: hex('#1E88E5'), indigo: hex('#3949AB'), muted: hex('#6F86C9'),
};
const STRIPES = [PAL.red, PAL.orangeRed, PAL.orange, PAL.yellowOrange, PAL.yellow];
const RAINBOW = [PAL.red, PAL.orangeRed, PAL.orange, PAL.yellowOrange, PAL.yellow, PAL.green, PAL.blue, PAL.indigo];

const MESSAGES = [
  'Reticulating splines', 'Lacing up shoes', 'Syncing with Strava', 'Pouring concrete on 17th Street',
  'Zoning LoHi', 'Counting stories', 'Stretching hamstrings', 'Gilding the Capitol dome',
  'Hydrating at mile 13', 'Painting bike lanes on Broadway', 'Raising the Union Station sign',
  'Calibrating altitude to 5280 ft', 'Planting trees in Wash Park', 'Splitting negative splits',
];
const messageFor = (p) => MESSAGES[Math.min(MESSAGES.length - 1, Math.floor(Math.max(0, p) * MESSAGES.length))];

// 3x5 small font (same glyphs as render.py)
const FONT = {"A": "010101111101101", "B": "110101110101110", "C": "011100100100011", "D": "110101101101110", "E": "111100110100111", "F": "111100110100100", "G": "011100101101011", "H": "101101111101101", "I": "111010010010111", "J": "001001001101010", "K": "101101110101101", "L": "100100100100111", "M": "101111111101101", "N": "110101101101101", "O": "010101101101010", "P": "110101110100100", "Q": "010101101110011", "R": "110101110101101", "S": "011100010001110", "T": "111010010010010", "U": "101101101101111", "V": "101101101101010", "W": "101101111111101", "X": "101101010101101", "Y": "101101010010010", "Z": "111001010100111", "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110", "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001110", " ": "000000000000000", ".": "000000000000010", ",": "000000000010100", ":": "000010000010000", "-": "000000111000000", "/": "001001010100100", "+": "000010111010000", "#": "101111101111101", "(": "010100100100010", ")": "010001001001010", "'": "010010000000000", "%": "101001010100101", "&": "010101010101011", "=": "000111000111000", ">": "100010001010100", "<": "001010100010001", "!": "010010010000010", "*": "000101010101000"};
// 5x7 chunky title font
const BIG = {
  M: ['10001', '11011', '11111', '10101', '10001', '10001', '10001'],
  A: ['01110', '11011', '10001', '11111', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  O: ['01110', '11011', '10001', '10001', '10001', '11011', '01110'],
  N: ['10001', '11001', '11101', '10111', '10011', '10001', '10001'],
  C: ['01111', '11000', '10000', '10000', '10000', '11000', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  D: ['11110', '10011', '10001', '10001', '10001', '10011', '11110'],
  // extra glyphs used by the intro/onboarding screens (render_intro.js)
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '11011', '01110'],
  S: ['01111', '11000', '10000', '01110', '00001', '00011', '11110'],
  V: ['10001', '10001', '10001', '10001', '11011', '01010', '00100'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  G: ['01111', '11000', '10000', '10011', '10001', '11001', '01111'],
  W: ['10001', '10001', '10001', '10101', '11111', '11011', '10001'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

// --- geometry -------------------------------------------------------------
const CX = 160, CY = 100, R = 90, YB = 138;           // badge: half-dome + title band
function badgeDist(x, y) {                          // >=0 inside, distance to edge
  if (y <= CY) return R - Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
  return Math.min(R - Math.abs(x + 0.5 - CX), YB - y);
}
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAR = { x: 34, y: 150, w: 216, h: 16, segs: 25 };   // frame box; track inside 4px bevel

// --- drawing primitives ---------------------------------------------------
function makeCtx(img) {
  const { data } = img, w = img.width;
  const set = (x, y, c) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  };
  const rect = (x, y, rw, rh, c) => { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(x + i, y + j, c); };
  const small = (s, x, y, c, sc = 1, shadow = null) => {
    s = s.toUpperCase();
    for (const pass of shadow ? [0, 1] : [1]) {
      let cx = x;
      for (const ch of s) {
        const g = FONT[ch] || FONT[' '];
        for (let k = 0; k < 15; k++) if (g[k] === '1') {
          const px = cx + (k % 3) * sc, py = y + Math.floor(k / 3) * sc;
          if (pass === 0) rect(px + sc, py + sc, sc, sc, shadow); else rect(px, py, sc, sc, c);
        }
        cx += 4 * sc;
      }
    }
  };
  const smallWidth = (s, sc = 1) => s.length * 4 * sc - sc;
  return { set, rect, small, smallWidth };
}

function drawBig(g, s, x, y, sc, face, bevel, shadow) {
  const cells = [];
  let cx = x;
  for (const ch of s) {
    const gl = BIG[ch] || BIG[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (gl[r][c] === '1') cells.push([cx + c * sc, y + r * sc, gl, r, c]);
    cx += 6 * sc;
  }
  for (const [px, py] of cells) g.rect(px + 2, py + 2, sc, sc, shadow);          // drop shadow
  for (const [px, py, gl, r, c] of cells) {
    g.rect(px, py, sc, sc, face);
    const below = r < 6 && gl[r + 1][c] === '1';
    if (!below) g.rect(px, py + sc - 1, sc, 1, bevel);                          // bottom bevel edge
  }
}
const bigWidth = (s, sc) => s.length * 6 * sc - sc;

// --- scene ----------------------------------------------------------------
function drawBackground(g, t) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // subtle dithered vignette toward the edges
    const d = Math.abs(x - 160) / 160 + Math.abs(y - 100) / 140;
    g.set(x, y, d > 1.05 && (x + y) % 2 === 0 ? PAL.navyDeep : PAL.navy);
  }
  for (let i = 0; i < 70; i++) {                  // twinkling pixel stars
    const x = Math.floor(hash(i, 1) * W), y = Math.floor(hash(i, 2) * 140);
    if (badgeDist(x, y) > -5) continue;
    const tw = Math.sin(t * (1.5 + hash(i, 3) * 3) + i) ;
    if (tw > -0.3) g.set(x, y, tw > 0.7 ? PAL.goldLite : PAL.muted);
    if (tw > 0.92 && hash(i, 4) > 0.6) { g.set(x - 1, y, PAL.muted); g.set(x + 1, y, PAL.muted); g.set(x, y - 1, PAL.muted); g.set(x, y + 1, PAL.muted); }
  }
}

// mountain heights (y of ridge) across x
const PEAKS = [[102, 60, 0.95], [146, 34, 1.15], [178, 50, 1.0], [210, 54, 0.9]];
function ridgeY(x) {
  let y = 999;
  for (const [px, py, s] of PEAKS) y = Math.min(y, py + Math.abs(x - px) * s);
  return Math.floor(y);
}
// skyline: [x0, width, topY, kind]
const SKYLINE = [
  [68, 12, 86, 's'], [80, 10, 82, 's'], [90, 8, 80, 's'], [98, 7, 74, 'r'], [105, 9, 70, 's'], [114, 6, 77, 's'],
  [120, 12, 62, 'cash'], [132, 8, 66, 's'], [140, 9, 57, 's'], [149, 6, 70, 's'], [155, 14, 72, 'dome'],
  [169, 8, 64, 's'], [177, 10, 54, 'spire'], [187, 7, 68, 's'], [194, 10, 74, 's'], [204, 8, 70, 'r'],
  [212, 9, 79, 's'], [221, 9, 84, 's'], [230, 10, 84, 's'], [240, 14, 87, 's'],
];
function drawBadge(g, t) {
  // badge drop shadow
  for (let y = 10; y < YB + 4; y++) for (let x = CX - R - 2; x < CX + R + 6; x++)
    if (badgeDist(x - 3, y - 3) >= 0 && badgeDist(x, y) < 0) g.set(x, y, PAL.navyShadow);
  const inner = (x, y) => badgeDist(x, y) >= 4;
  // sky stripes (thick at top, gaps widen downward) + sun crossed by the gaps
  const bands = []; let y0 = CY - R + 4;
  [[9, 1], [8, 2], [7, 2], [6, 3], [5, 3], [5, 4]].forEach(([th, gap], i) => { bands.push([y0, th, STRIPES[Math.min(i, 4)]]); y0 += th + gap; });
  const sunX = 198, sunY = 36, sunR = 12;
  for (let y = CY - R; y < 96; y++) for (let x = CX - R; x < CX + R; x++) {
    if (!inner(x, y)) continue;
    let c = PAL.navy;
    for (const [by, th, col] of bands) if (y >= by && y < by + th) c = col;
    if (c !== PAL.navy && Math.hypot(x - sunX, y - sunY) < sunR) c = PAL.sun;
    g.set(x, y, c);
  }
  // mountains: navy, lit left face slightly lighter, white snowcaps with jagged hem
  for (let x = CX - R; x < CX + R; x++) {
    const top = ridgeY(x);
    let peak = PEAKS[0]; for (const p of PEAKS) if (p[1] + Math.abs(x - p[0]) * p[2] <= top + 0.5) peak = p;
    for (let y = top; y < 96; y++) {
      if (!inner(x, y)) continue;
      const depth = y - top, cap = 9 + (peak[1] < 40 ? 4 : 0) - Math.abs(x - peak[0]) * 0.35 + ((x * 7) % 3);
      let c = x < peak[0] ? PAL.navyLite : PAL.navy;
      if (y - peak[1] < 16 && depth < cap) c = x < peak[0] ? PAL.white : PAL.snowShade;
      if (depth === 0) c = y - peak[1] < 16 ? PAL.white : PAL.navyLite;
      g.set(x, y, c);
    }
  }
  // stepped green skyline with navy window dots
  for (const [x0, w, top, kind] of SKYLINE) {
    for (let x = x0; x < x0 + w; x++) for (let y = top; y < 96; y++) {
      if (!inner(x, y)) continue;
      let c = x === x0 ? PAL.greenLite : (x === x0 + w - 1 ? PAL.greenDark : PAL.green);
      if (kind === 'cash') { const dx = Math.abs(x - (x0 + w / 2 - 0.5)); if (y < top + 4 && dx > w / 2 - 4 + (y - top)) continue; }
      if (kind === 'r' && y < top + 2 && (x - x0) % 3 === 1) continue;
      if ((x - x0) % 3 === 1 && (y - top) % 4 === 2 && y > top + 2 && y < 90 && hash(x, y) > 0.35) c = PAL.navy;
      g.set(x, y, c);
    }
    if (kind === 'dome') {
      const mx = x0 + w / 2;
      for (let y = top - 9; y < top; y++) for (let x = x0 + 2; x < x0 + w - 2; x++) {
        const dy = top - y; const half = Math.sqrt(Math.max(0, 25 - (dy - 1) * (dy - 1) * 0.6)) + 0.5;
        if (Math.abs(x + 0.5 - mx) < half) g.set(x, y, Math.abs(x + 0.5 - mx) < 1.5 && dy > 5 ? PAL.gold : (x < mx ? PAL.goldLite : PAL.gold));
      }
      g.set(Math.floor(mx), top - 10, PAL.goldLite); g.set(Math.floor(mx), top - 11, PAL.gold);
    }
    if (kind === 'spire') for (let k = 1; k < 9; k++) g.set(x0 + Math.floor(w / 2), top - k, k > 6 ? PAL.goldLite : PAL.greenLite);
  }
  // blue reflecting stripes / band at the base of the dome
  for (let y = 90; y <= CY + 2; y++) for (let x = CX - R; x < CX + R; x++) {
    if (!inner(x, y)) continue;
    const k = y - 90;
    const c = k === 0 || k === 3 || k === 6 || k === 9 ? PAL.navy : (k < 6 ? PAL.blue : PAL.indigo);
    if (y >= 92 || c === PAL.navy) g.set(x, y, c);
  }
  // title band
  for (let y = CY + 3; y < YB; y++) for (let x = CX - R; x < CX + R; x++) if (inner(x, y)) g.set(x, y, PAL.navy);
  // gold beveled outline
  for (let y = CY - R - 1; y <= YB; y++) for (let x = CX - R - 1; x <= CX + R + 1; x++) {
    const d = badgeDist(x, y);
    if (d < 0 || d >= 4) continue;
    let c = PAL.gold;
    if (d < 1) c = PAL.goldDark;
    else if (d >= 3) c = PAL.goldDark;
    else if (d < 2 && (y < CY - 20 || x < CX - R + 3) && x < CX + 30) c = PAL.goldLite;
    g.set(x, y, c);
  }
}

function drawTitle(g, t, readyFlash) {
  const s = 'MARATHON CITY', sc = 2;
  const x = Math.round(CX - bigWidth(s, sc) / 2), y = CY + 10;
  const face = readyFlash ? PAL.gold : PAL.white;
  drawBig(g, s, x, y, sc, face, readyFlash ? PAL.goldDark : PAL.snowShade, PAL.navyShadow);
}

function drawBar(g, p, t, flash) {
  const { x, y, w, h, segs } = BAR;
  // beveled gold frame: dark outline, light top/left, dark bottom/right
  g.rect(x, y, w, h, PAL.goldDark);
  g.rect(x + 1, y + 1, w - 2, h - 2, PAL.gold);
  g.rect(x + 1, y + 1, w - 2, 1, PAL.goldLite); g.rect(x + 1, y + 1, 1, h - 2, PAL.goldLite);
  g.rect(x + 1, y + h - 2, w - 2, 1, PAL.goldDark); g.rect(x + w - 2, y + 1, 1, h - 2, PAL.goldDark);
  g.rect(x + 3, y + 3, w - 6, h - 6, PAL.goldDark);                         // inner recess line
  const tx = x + 4, ty = y + 4, tw = w - 8, th = h - 8;
  g.rect(tx, ty, tw, th, PAL.navyDeep);
  const sw = tw / segs, n = Math.floor(Math.min(1, Math.max(0, p)) * segs + 1e-6);
  for (let i = 0; i < n; i++) {
    const sx = Math.round(tx + i * sw) + 1, ex = Math.round(tx + (i + 1) * sw) - 1;
    let c = RAINBOW[i % RAINBOW.length];
    if (flash) c = PAL.goldLite;
    const lead = i === n - 1 && n < segs && Math.floor(t * 6) % 2 === 0;
    g.rect(sx, ty + 1, ex - sx, th - 2, lead ? PAL.goldLite : c);
    g.rect(sx, ty + 1, ex - sx, 1, PAL.white.map((v, k) => Math.round((v + c[k]) / 2)));   // top highlight
    g.rect(sx, ty + th - 2, ex - sx, 1, c.map((v) => Math.round(v * 0.7)));                // bottom shade
  }
  // percentage
  const pct = Math.round(Math.min(1, Math.max(0, p)) * 100) + '%';
  g.small(pct, x + w + 8, y + 3, PAL.gold, 2, PAL.navyShadow);
  // tiny runner jogging on top of the bar at the fill head
  const hx = Math.round(tx + n * sw) - 4, hy = y - 9;
  const fr = Math.floor(t * 10) % 2;
  const RUN = fr ? ['00110', '00110', '01100', '11110', '00100', '01010', '10001', '10000'] : ['00110', '00110', '00100', '01110', '01101', '00100', '01010', '01001'];
  if (p < 1) RUN.forEach((row, r) => [...row].forEach((b, c) => { if (b === '1') g.set(hx + c, hy + r, r < 2 ? PAL.goldLite : (r < 5 ? PAL.red : PAL.white)); }));
}

function drawStatus(g, p, t, opts) {
  let msg, col = PAL.white;
  if (opts.message != null) msg = opts.message;
  else if (p >= 1) { msg = 'READY!'; col = PAL.gold; }
  else msg = messageFor(p) + '.'.repeat(1 + (Math.floor(t * 4) % 3));
  const base = msg.replace(/\.+$/, '');
  const x = Math.round(160 - g.smallWidth(p >= 1 || opts.message != null ? msg : base + '...', 2) / 2);
  if (p >= 1 && Math.floor(t * 5) % 2) return;
  g.small(msg, x, 174, col, 2, PAL.navyShadow);
}

function drawFooter(g) {
  g.small('V0.1', 6, 192, PAL.muted);
  const s = '(C) MARATHON CITY 2026';
  g.small(s, W - 6 - g.smallWidth(s), 192, PAL.muted);
}

// opts: { progress 0..1, t seconds, message? (override), fade 0..1 (to black), flash? }
function drawLoading(img, opts = {}) {
  const p = opts.progress || 0, t = opts.t || 0;
  const g = makeCtx(img);
  drawBackground(g, t);
  drawBadge(g, t);
  drawTitle(g, t, !!opts.flash);
  drawBar(g, p, t, !!opts.flash);
  drawStatus(g, p, t, opts);
  drawFooter(g);
  const f = opts.fade || 0;
  if (f > 0) for (let i = 0; i < img.data.length; i += 4) for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(img.data[i + k] * (1 - f));
  return img;
}

// Browser helper: crisp-scaled canvas, rAF loop, progress setter.
function mount(canvas, { scale = 3 } = {}) {
  canvas.width = W; canvas.height = H;
  canvas.style.width = W * scale + 'px'; canvas.style.height = H * scale + 'px';
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d'); const img = ctx.createImageData(W, H);
  const state = { progress: 0, shown: 0, message: null, fade: 0, flash: false, readyAt: null };
  const t0 = performance.now(); let raf;
  const frame = (now) => {
    const t = (now - t0) / 1000;
    state.shown += (state.progress - state.shown) * 0.15;                // ease toward target
    if (Math.abs(state.progress - state.shown) < 0.002) state.shown = state.progress;
    if (state.readyAt != null) { const dt = t - state.readyAt; state.flash = dt < 0.15; state.fade = Math.max(0, Math.min(1, (dt - 0.6) / 0.5)); }
    drawLoading(img, { progress: state.shown, t, message: state.message, fade: state.fade, flash: state.flash });
    ctx.putImageData(img, 0, 0);
    if (state.fade < 1) raf = requestAnimationFrame(frame); else if (state.onDone) state.onDone();
  };
  raf = requestAnimationFrame(frame);
  return {
    setProgress(p) { state.progress = Math.max(0, Math.min(1, p)); },
    setMessage(m) { state.message = m; },
    ready(onDone) { state.progress = 1; state.shown = 1; state.onDone = onDone; state.readyAt = (performance.now() - t0) / 1000; },
    stop() { cancelAnimationFrame(raf); },
  };
}

const api = { W, H, PAL, RAINBOW, STRIPES, MESSAGES, messageFor, drawLoading, mount,
  // shared helpers (reused by render_intro.js so the onboarding screens match exactly)
  FONT, BIG, hash, makeCtx, drawBig, bigWidth, drawBackground, drawBadge, drawTitle, drawFooter };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MarathonLoading = api;
