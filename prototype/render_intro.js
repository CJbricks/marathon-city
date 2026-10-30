// Renders the Marathon City intro/onboarding stills (title, city pick, Strava connect, start date)
// plus intro_sheet.png, using the exact same font/palette/helpers as loading.js.
// ffmpeg + nearest-neighbour upscale, SCALE=3 (same approach as render_loading.js).
'use strict';
const { spawnSync } = require('child_process');
const L = require('./loading.js');
const { W, H, PAL, STRIPES, makeCtx, drawBig, bigWidth, drawBackground, drawBadge, drawTitle, drawFooter } = L;
const SCALE = 3;
const STRAVA = [0xFC, 0x4C, 0x02], STRAVA_LITE = [0xFF, 0x8A, 0x50], STRAVA_DARK = [0xA8, 0x30, 0x00];
const newImg = () => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) });
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));

// --- shared UI pieces -------------------------------------------------------
// beveled frame, same construction as the loading bar frame
function frame(g, x, y, w, h, s) {
  if (s.shadow !== false) g.rect(x + 2, y + 2, w, h, PAL.navyShadow);
  g.rect(x, y, w, h, s.dark);
  g.rect(x + 1, y + 1, w - 2, h - 2, s.mid);
  g.rect(x + 1, y + 1, w - 2, 1, s.lite); g.rect(x + 1, y + 1, 1, h - 2, s.lite);
  g.rect(x + 1, y + h - 2, w - 2, 1, s.dark); g.rect(x + w - 2, y + 1, 1, h - 2, s.dark);
  if (s.fill) { g.rect(x + 3, y + 3, w - 6, h - 6, s.dark); g.rect(x + 4, y + 4, w - 8, h - 8, s.fill); }
}
const GOLD = { dark: PAL.goldDark, mid: PAL.gold, lite: PAL.goldLite };
const DIM = { dark: PAL.navyShadow, mid: PAL.navyLite, lite: PAL.muted };
const ORANGE = { dark: STRAVA_DARK, mid: STRAVA, lite: STRAVA_LITE };

// chunky button: bevel frame, solid face, centred 2x small-font label with shadow
function button(g, x, y, w, h, label, st, txt, txtShadow) {
  frame(g, x, y, w, h, st);
  g.rect(x + 2, y + 2, w - 4, h - 4, st.mid);
  g.rect(x + 2, y + 2, w - 4, 1, st.lite);
  const tw = g.smallWidth(label, 2);
  g.small(label, Math.round(x + (w - tw) / 2), Math.round(y + (h - 10) / 2), txt, 2, txtShadow);
}
const centerSmall = (g, s, y, c, sc = 1, sh = null) => g.small(s, Math.round(160 - g.smallWidth(s, sc) / 2), y, c, sc, sh);

// small header: MARATHON CITY flanked by rainbow speed stripes
function header(g) {
  const s = 'MARATHON CITY', tw = bigWidth(s, 1), x = Math.round(160 - tw / 2), y = 5;
  drawBig(g, s, x, y, 1, PAL.white, PAL.snowShade, PAL.navyShadow);
  const cols = [PAL.red, PAL.orange, PAL.yellowOrange, PAL.yellow];
  cols.forEach((c, i) => {
    const len = 34 - i * 6;
    g.rect(x - 6 - len, y + i * 2, len, 1, c);
    g.rect(x + tw + 6, y + i * 2, len, 1, c);
  });
}
// step indicator 1-2-3 (only on the new-city flow)
function steps(g, cur) {
  const y = 18, gap = 22, x0 = 160 - gap - 5;
  g.rect(x0 + 5, y + 5, gap * 2, 1, PAL.navyLite);
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * gap, n = i + 1;
    if (n < cur) g.rect(x0 + 5 + i * gap, y + 5, gap, 1, PAL.gold);
    const st = n === cur ? GOLD : n < cur ? { dark: PAL.greenDark, mid: PAL.green, lite: PAL.greenLite } : { dark: PAL.navyLite, mid: PAL.navyDeep, lite: PAL.navyDeep };
    g.rect(x + 1, y + 1, 11, 11, PAL.navyShadow);
    g.rect(x, y, 11, 11, st.dark); g.rect(x + 1, y + 1, 9, 9, st.mid);
    g.rect(x + 1, y + 1, 9, 1, st.lite); g.rect(x + 1, y + 1, 1, 9, st.lite);
    g.small(String(n), x + 4, y + 3, n === cur ? PAL.navyDeep : n < cur ? PAL.white : PAL.muted);
  }
}
function screenTitle(g, s, y = 36) {
  drawBig(g, s, Math.round(160 - bigWidth(s, 2) / 2), y, 2, PAL.white, PAL.snowShade, PAL.navyShadow);
}

// --- city icons (48x40, drawn in badge style: striped sunset sky, navy peaks, green blocks) ---
function sky(g, x, y, w, h, sun) {
  g.rect(x, y, w, h, PAL.navy);
  let yy = y + 1;
  [[4, 1], [3, 1], [3, 2], [2, 2], [2, 2]].forEach(([th, gap], i) => { g.rect(x, yy, w, th, STRIPES[i]); yy += th + gap; });
  if (sun) for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const px = sun[0] + i - 4, py = sun[1] + j - 4;
    if (Math.hypot(i - 4, j - 4) < 4.4 && px >= x && px < x + w) {
      const k = (() => { let b = y + 1; for (const [th, gp] of [[4, 1], [3, 1], [3, 2], [2, 2], [2, 2]]) { if (py >= b && py < b + th) return 1; b += th + gp; } return 0; })();
      if (k) g.set(px, py, PAL.sun);
    }
  }
}
function block(g, x, top, w, base, opts = {}) {     // green building w/ navy windows, lit left / dark right
  for (let xx = x; xx < x + w; xx++) for (let yy = top; yy < base; yy++) {
    let c = xx === x ? PAL.greenLite : xx === x + w - 1 ? PAL.greenDark : PAL.green;
    if ((xx - x) % 3 === 1 && (yy - top) % 4 === 2 && yy < base - 2 && w > 3 && L.hash(xx, yy) > 0.3) c = PAL.navy;
    g.set(xx, yy, opts.col && c === PAL.green ? opts.col : c);
  }
}
function peak(g, px, py, s, x0, x1, base, cap = 6) {
  for (let x = x0; x < x1; x++) {
    const top = Math.floor(py + Math.abs(x - px) * s);
    for (let y = top; y < base; y++) {
      let c = x < px ? PAL.navyLite : PAL.navy;
      if (y - py < cap && y - top < 3 + ((x * 7) % 2)) c = x < px ? PAL.white : PAL.snowShade;
      g.set(x, y, c);
    }
  }
}
function water(g, x, y, w) { g.rect(x, y, w, 1, PAL.navy); g.rect(x, y + 1, w, 2, PAL.blue); g.rect(x, y + 3, w, 1, PAL.navy); }
const ICONS = {
  DENVER(g, x, y) {
    sky(g, x, y, 48, 40, [x + 34, y + 9]);
    peak(g, x + 10, y + 9, 0.9, x, x + 30, y + 36, 8); peak(g, x + 38, y + 13, 0.9, x + 22, x + 48, y + 36, 7);
    block(g, x + 2, y + 31, 6, y + 36); block(g, x + 8, y + 27, 6, y + 36); block(g, x + 14, y + 22, 7, y + 36);
    block(g, x + 21, y + 28, 7, y + 36); block(g, x + 28, y + 19, 6, y + 36); block(g, x + 34, y + 26, 6, y + 36); block(g, x + 40, y + 31, 7, y + 36);
    // capitol dome
    [[23, 24, 3], [22, 25, 2], [22, 25, 1]].forEach(() => {});
    for (let j = 0; j < 4; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) <= (j === 0 ? 0 : j === 1 ? 1 : 2)) g.set(x + 24 + i, y + 24 + j, i < 0 ? PAL.goldLite : PAL.gold);
    for (let k = 1; k < 6; k++) g.set(x + 31, y + 19 - k, k > 3 ? PAL.goldLite : PAL.greenLite);
    water(g, x, y + 36, 48);
  },
  AUSTIN(g, x, y) {
    sky(g, x, y, 48, 40, [x + 10, y + 9]);
    block(g, x + 2, y + 27, 7, y + 36); block(g, x + 33, y + 22, 6, y + 36); block(g, x + 39, y + 28, 7, y + 36);
    // Frost tower: notched crown
    block(g, x + 26, y + 14, 7, y + 36);
    for (let k = 0; k < 6; k++) g.set(x + 29, y + 13 - k, PAL.greenLite);
    g.set(x + 27, y + 13, PAL.greenLite); g.set(x + 31, y + 13, PAL.greenLite);
    // capitol: wide base + tall dome
    block(g, x + 9, y + 29, 16, y + 36);
    for (let j = 0; j < 9; j++) { const half = j < 2 ? 0 : j < 4 ? 2 : 4; for (let i = -half; i <= half; i++) g.set(x + 17 + i, y + 20 + j, i < 0 ? PAL.goldLite : PAL.gold); }
    g.set(x + 17, y + 18, PAL.goldLite); g.set(x + 17, y + 19, PAL.gold);
    water(g, x, y + 36, 48);
  },
  BOULDER(g, x, y) {
    sky(g, x, y, 48, 40, [x + 38, y + 8]);
    // the Flatirons: tilted triangular slabs (steep west face, long east slope), clipped to the icon
    for (const [ax, top, ls, rs] of [[10, 11, 0.45, 1.1], [24, 15, 0.45, 1.0], [36, 20, 0.5, 1.0]]) {
      for (let yy = top; yy < 32; yy++) {
        const d = yy - top, l = Math.round(ax - d * ls), r = Math.round(ax + d * rs);
        for (let xx = l; xx <= r; xx++) if (xx >= 0 && xx < 48)
          g.set(x + xx, y + yy, xx === l ? PAL.yellowOrange : (xx - l) % 5 === 4 ? PAL.red : PAL.orangeRed);
      }
    }
    // green foothills + low town
    for (let xx = x; xx < x + 48; xx++) { const t = Math.floor(29 + Math.sin((xx - x) / 5) * 2); for (let yy = y + t; yy < y + 36; yy++) g.set(xx, yy, yy === y + t ? PAL.greenLite : PAL.greenDark); }
    block(g, x + 8, y + 31, 5, y + 36); block(g, x + 16, y + 30, 6, y + 36); block(g, x + 30, y + 31, 6, y + 36); block(g, x + 38, y + 30, 5, y + 36);
    water(g, x, y + 36, 48);
  },
  'NEW YORK'(g, x, y) {
    sky(g, x, y, 48, 40, null);
    [[1, 24, 5], [6, 18, 5], [11, 22, 5], [27, 16, 5], [32, 21, 6], [38, 14, 5], [43, 23, 5]].forEach(([dx, t, w]) => block(g, x + dx, y + t, w, y + 36));
    // Empire State: stepped tower + spire
    block(g, x + 16, y + 16, 11, y + 36); block(g, x + 18, y + 11, 7, y + 16); block(g, x + 20, y + 7, 3, y + 11);
    for (let k = 1; k < 6; k++) g.set(x + 21, y + 7 - k, k > 3 ? PAL.goldLite : PAL.greenLite);
    water(g, x, y + 36, 48);
  },
  TOKYO(g, x, y) {
    sky(g, x, y, 48, 40, [x + 9, y + 8]);
    peak(g, x + 34, y + 17, 1.4, x + 18, x + 48, y + 36, 5);   // Fuji
    block(g, x + 1, y + 27, 6, y + 36); block(g, x + 7, y + 30, 6, y + 36); block(g, x + 28, y + 28, 7, y + 36); block(g, x + 35, y + 31, 6, y + 36); block(g, x + 41, y + 26, 6, y + 36);
    // Tokyo Tower: red/white lattice A-frame
    const tx = x + 20, top = y + 8;
    for (let j = 0; j < 28; j++) {
      const half = Math.floor(j * j / 110) + (j > 8 ? 1 : 0);
      const c = Math.floor(j / 4) % 2 ? PAL.white : PAL.red;
      g.set(tx - half, top + j, c); g.set(tx + half, top + j, c);
      if (j % 4 === 0) for (let i = -half; i <= half; i++) g.set(tx + i, top + j, c);
      if (j === 12 || j === 13) for (let i = -half - 1; i <= half + 1; i++) g.set(tx + i, top + j, PAL.red);
    }
    for (let k = 1; k < 5; k++) g.set(tx, top - k, PAL.red);
    water(g, x, y + 36, 48);
  },
};
// desaturate a region (greyed-out "coming soon" look) toward muted navy-grey
function desat(img, x, y, w, h) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const k = (j * W + i) * 4, d = img.data;
    const lum = (0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]) / 255;
    const c = mix(PAL.navyDeep, PAL.muted, Math.min(1, lum * 1.1));
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2];
  }
}

// --- screens ------------------------------------------------------------------
function base(img, step) {
  const g = makeCtx(img);
  drawBackground(g, 1.0);
  if (step) { header(g); steps(g, step); }
  drawFooter(g);
  return g;
}

function screenHome(img) {           // title / main menu: reuses the loading badge + title verbatim
  const g = makeCtx(img);
  drawBackground(g, 1.0); drawBadge(g, 1.0); drawTitle(g, 1.0, false);
  const by = 146, bh = 16;
  // RESUME CITY (selected) + blinking-style cursor arrows
  button(g, 30, by, 122, bh, 'RESUME CITY', GOLD, PAL.navyDeep, null);
  g.small('>', 22, by + 3, PAL.gold, 2, PAL.navyShadow);
  // NEW CITY (unselected)
  button(g, 168, by, 122, bh, 'NEW CITY', DIM, PAL.white, PAL.navyShadow);
  // save-file card under RESUME (tab connects it to the button)
  const cx = 30, cy = 167, cw = 260, ch = 19;
  g.rect(cx + 2, cy + 2, cw, ch, PAL.navyShadow);
  g.rect(cx, cy, cw, ch, PAL.goldDark); g.rect(cx + 1, cy + 1, cw - 2, ch - 2, PAL.navyDeep);
  g.rect(cx + 1, cy + 1, cw - 2, 1, PAL.gold);
  g.rect(60, by + bh, 3, cy - by - bh + 1, PAL.goldDark); g.rect(120, by + bh, 3, cy - by - bh + 1, PAL.goldDark);
  // tiny floppy-disk save icon
  const fx = cx + 6, fy = cy + 5;
  g.rect(fx, fy, 9, 9, PAL.blue); g.rect(fx + 2, fy, 5, 3, PAL.snowShade); g.rect(fx + 5, fy + 1, 1, 1, PAL.navy);
  g.rect(fx + 2, fy + 5, 5, 4, PAL.white); g.rect(fx + 8, fy, 1, 1, PAL.navy);
  const t1 = 'DENVER', t2 = '  -  98 BUILDINGS  -  LAST RUN 10/28/2026';
  const tx = fx + 14;
  g.small(t1, tx, cy + 7, PAL.gold);
  g.small(t2, tx + g.smallWidth(t1) + 1, cy + 7, PAL.white);
}

function screenCity(img) {
  const g = base(img, 1);
  screenTitle(g, 'PICK YOUR CITY');
  const cities = ['AUSTIN', 'DENVER', 'BOULDER', 'NEW YORK', 'TOKYO'];
  const cw = 58, gap = 4, x0 = Math.round(160 - (cw * 5 + gap * 4) / 2), cy = 62, chh = 82;
  cities.forEach((name, i) => {
    const sel = name === 'DENVER';
    const x = x0 + i * (cw + gap), y = sel ? cy - 2 : cy;
    frame(g, x, y, cw, chh, sel ? { ...GOLD, fill: PAL.navyDeep } : { ...DIM, fill: PAL.navyDeep });
    const ix = x + 5, iy = y + 5;
    ICONS[name](g, ix, iy);
    g.rect(ix - 1, iy + 40, 50, 1, sel ? PAL.goldDark : PAL.navyShadow);
    const nw = g.smallWidth(name);
    g.small(name, Math.round(x + (cw - nw) / 2), y + 52, sel ? PAL.white : PAL.muted, 1, PAL.navyShadow);
    if (sel) {
      const tg = 'READY', tw = g.smallWidth(tg) + 6, tx = Math.round(x + (cw - tw) / 2);
      g.rect(tx, y + 63, tw, 9, PAL.green); g.rect(tx, y + 63, tw, 1, PAL.greenLite); g.rect(tx, y + 71, tw, 1, PAL.greenDark);
      g.small(tg, tx + 3, y + 65, PAL.white);
    } else {
      desat(img, ix, iy, 48, 40);
      const tg = 'SOON', tw = g.smallWidth(tg) + 6, tx = Math.round(x + (cw - tw) / 2);
      g.rect(tx, y + 63, tw, 9, PAL.navyLite); g.rect(tx, y + 63, tw, 1, PAL.muted);
      g.small(tg, tx + 3, y + 65, PAL.snowShade);
    }
  });
  // selection cursor under Denver
  const dx = x0 + 1 * (cw + gap) + cw / 2;
  [[0, 1], [1, 3], [2, 5]].forEach(([r, w]) => g.rect(Math.round(dx - w / 2), cy + chh + 3 + r, w, 1, PAL.gold));
  button(g, 120, 154, 80, 18, 'NEXT >', GOLD, PAL.navyDeep, null);
  centerSmall(g, 'MORE CITIES COMING SOON', 180, PAL.muted);
}

function runner(g, x, y, fr) {
  const RUN = fr ? ['00110', '00110', '01100', '11110', '00100', '01010', '10001', '10000'] : ['00110', '00110', '00100', '01110', '01101', '00100', '01010', '01001'];
  RUN.forEach((row, r) => [...row].forEach((b, c) => { if (b === '1') g.set(x + c, y + r, r < 2 ? PAL.goldLite : (r < 5 ? PAL.red : PAL.white)); }));
}
function screenStrava(img) {
  const g = base(img, 2);
  screenTitle(g, 'CONNECT STRAVA');
  // chosen-city chip
  const chip = 'DENVER', cw = g.smallWidth(chip) + 18, cx = Math.round(160 - cw / 2), cy = 58;
  g.rect(cx + 1, cy + 1, cw, 11, PAL.navyShadow);
  g.rect(cx, cy, cw, 11, PAL.goldDark); g.rect(cx + 1, cy + 1, cw - 2, 9, PAL.navyDeep);
  // map pin
  [[1, 3], [0, 5], [0, 5], [1, 3], [1, 3], [2, 1], [2, 1]].forEach(([o, w], r) => g.rect(cx + 4 + o, cy + 2 + r, w, 1, PAL.red));
  g.set(cx + 6, cy + 4, PAL.white);
  g.small(chip, cx + 12, cy + 3, PAL.gold);
  // illustration: runner leaves a rainbow trail that turns into rising city blocks
  const gy = 112, ix = 58, iw = 204;
  g.rect(ix, gy, iw, 1, PAL.navyLite);
  g.rect(ix, gy + 1, iw, 2, PAL.blue); g.rect(ix, gy + 3, iw, 1, PAL.navy); g.rect(ix, gy + 4, iw, 1, PAL.indigo);
  const RB = [PAL.red, PAL.orangeRed, PAL.orange, PAL.yellowOrange, PAL.yellow];
  for (let i = 0; i < 9; i++) {                     // trail of rainbow footprints
    const x = ix + 4 + i * 8;
    g.rect(x, gy - 2 - (i % 2), 4, 2, RB[Math.min(4, Math.floor(i / 2))]);
  }
  runner(g, ix + 78, gy - 9, 1);
  // blocks growing taller to the right
  const hs = [6, 10, 9, 15, 13, 20, 18, 26, 22, 31, 27, 36];
  hs.forEach((h, i) => block(g, ix + 92 + i * 9, gy - h, 8, gy));
  // gold dome on the tallest pair
  for (let j = 0; j < 4; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) <= (j === 0 ? 0 : j === 1 ? 1 : 2)) g.set(ix + 92 + 9 * 9 + 4 + i, gy - 31 - 4 + j, i < 0 ? PAL.goldLite : PAL.gold);
  for (let k = 1; k < 7; k++) g.set(ix + 92 + 11 * 9 + 4, gy - 36 - k, k > 4 ? PAL.goldLite : PAL.greenLite);
  centerSmall(g, 'YOUR RUNS BUILD THE CITY', 124, PAL.white, 2, PAL.navyShadow);
  button(g, 66, 144, 188, 20, 'CONNECT WITH STRAVA', ORANGE, PAL.white, STRAVA_DARK);
  centerSmall(g, 'READ-ONLY ACCESS TO YOUR ACTIVITIES', 172, PAL.muted);
}

function radio(g, x, y, on) {
  g.rect(x, y, 10, 10, on ? PAL.goldDark : PAL.navyShadow);
  g.rect(x + 1, y + 1, 8, 8, on ? PAL.gold : PAL.navyLite);
  g.rect(x + 2, y + 2, 6, 6, PAL.navyDeep);
  if (on) { g.rect(x + 3, y + 3, 4, 4, PAL.gold); g.rect(x + 3, y + 3, 2, 1, PAL.goldLite); }
}
function screenStart(img) {
  const g = base(img, 3);
  screenTitle(g, 'BUILD YOUR CITY');
  const ox = 44, ow = 232;
  // option A: all history (not selected, dim)
  frame(g, ox, 60, ow, 30, { ...DIM, fill: PAL.navyDeep });
  radio(g, ox + 9, 66, false);
  g.small('ALL STRAVA HISTORY', ox + 26, 66, PAL.muted, 2, PAL.navyShadow);
  g.small('EVERY RUN SINCE DAY ONE', ox + 26, 80, PAL.muted);
  // option B: start from a date (selected, default = today -> a fresh city file)
  frame(g, ox, 96, ow, 44, { ...GOLD, fill: PAL.navyDeep });
  radio(g, ox + 9, 102, true);
  g.small('START FROM A DATE', ox + 26, 102, PAL.white, 2, PAL.navyShadow);
  const fx = ox + 26, fy = 117, fw = 126, fh = 17;       // pixel date field (inset, active)
  g.rect(fx, fy, fw, fh, PAL.goldDark); g.rect(fx + 1, fy + 1, fw - 1, fh - 1, PAL.goldLite); g.rect(fx + 1, fy + 1, fw - 2, fh - 2, PAL.navy);
  g.small('10 / 29 / 2026', fx + 5, fy + 4, PAL.white, 2, PAL.navyShadow);
  // calendar glyph (gold = active)
  const kx = fx + fw + 6, ky = fy + 2;
  g.rect(kx, ky, 13, 12, PAL.goldLite); g.rect(kx, ky, 13, 3, PAL.red); g.rect(kx + 3, ky - 1, 1, 2, PAL.white); g.rect(kx + 9, ky - 1, 1, 2, PAL.white);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) g.rect(kx + 2 + c * 4, ky + 5 + r * 3, 2, 2, (r === 1 && c === 2) ? PAL.red : PAL.navy);
  // TODAY tag
  const tg = 'TODAY', tw = g.smallWidth(tg) + 6, tx = kx + 19, ty = fy + 3;
  g.rect(tx, ty, tw, 9, PAL.green); g.rect(tx, ty, tw, 1, PAL.greenLite); g.rect(tx, ty + 8, tw, 1, PAL.greenDark);
  g.small(tg, tx + 3, ty + 2, PAL.white);
  button(g, 115, 150, 90, 20, 'BUILD!', GOLD, PAL.navyDeep, null);
  centerSmall(g, 'A FRESH CITY STARTING TODAY', 178, PAL.muted);
}

// --- output -------------------------------------------------------------------
const ff = (out, w, h, buf, extra = []) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', ...extra, '-frames:v', '1', out], { input: buf, maxBuffer: 1 << 30 });
  if (r.status) throw new Error(r.stderr.toString());
};
const SCREENS = [['intro_title.png', screenHome], ['intro_city.png', screenCity], ['intro_strava.png', screenStrava], ['intro_start.png', screenStart]];
const imgs = SCREENS.map(([out, fn]) => { const img = newImg(); fn(img); ff(out, W, H, Buffer.from(img.data.buffer), ['-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`]); return img; });
// sheet: 2x2 grid at native res with an 8px navyShadow gutter, then x3
{
  const G = 8, cols = 2, rows = 2, SW = cols * W + (cols + 1) * G, SH = rows * H + (rows + 1) * G;
  const sheet = new Uint8ClampedArray(SW * SH * 4);
  for (let i = 0; i < SW * SH; i++) { sheet.set(PAL.navyShadow, i * 4); sheet[i * 4 + 3] = 255; }
  imgs.forEach((img, n) => {
    const ox = G + (n % cols) * (W + G), oy = G + Math.floor(n / cols) * (H + G);
    for (let y = 0; y < H; y++) sheet.set(img.data.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * SW + ox) * 4);
  });
  ff('intro_sheet.png', SW, SH, Buffer.from(sheet.buffer), ['-vf', `scale=${SW * SCALE}:${SH * SCALE}:flags=neighbor`]);
}
console.log('wrote', SCREENS.map((s) => s[0]).join(', '), 'intro_sheet.png');
