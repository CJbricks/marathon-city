// Denver's colors and silhouettes.
//
// This is the only file that knows what a Denver building looks like.
// The mile rules live in rules.js and never import this. A future Austin
// theme is a sibling file with the same functions and different shapes:
// a different capitol, no gold dome, different ground. paintScene calls
// whichever theme the save names.
//
// The picture is twice as fine as the first version (a lot is 48 pixels
// across, a story is 6 pixels). The extra pixels are windows, doors,
// awnings, cornices, sidewalks, and the landmark silhouettes. Each of
// those is drawn as a solid block of color, not a smooth gradient, so
// nearest-neighbor zoom stays crisp.
//
// What should still be obvious when the whole city fits on a phone:
//   houses have pitched roofs, shops have a colored awning band,
//   offices are a glass grid, towers have an antenna, the capitol is
//   the gold dome, Union Station is the red roof and clock, the art
//   museum is one metal shard, a cathedral is two spires.

import { hex, mix, mul, pick, rng } from "../pixelPen";
import { STORY, project } from "../sceneLayout";

const WIN = hex("#243044");
const LIT = hex("#ffe58a");
const GLASS = hex("#9ed0f0");
const GLASS_R = hex("#4d7ea3");
const TRIM = hex("#f7f1e4");
const DOOR = hex("#3a2418");
const KNOB = hex("#e0c060");

const GROUND = {
  far: "#7a7a44",
  mid: "#a09654",
  near: "#c4b56a",
  // Picture pixels below the horizon. Doubled from the 640-wide picture
  // so the tan bands still break in the same place on the prairie.
  farUntil: 20,
  midUntil: 72,
};

const MOUNTAINS = {
  rock: "#8a90b0",
  rockShade: "#6a7094",
  snow: "#ffffff",
  snowShade: "#d5dced",
  foothill: "#6f8a6a",
  foothillShade: "#566e58",
  snowline: 124,
  main: { seed: 11, hmin: 56, hmax: 200 },
  foothills: { seed: 23, hmin: 24, hmax: 96 },
};

function lamp(t, k, variant, chance, night) {
  if (!night || chance <= 0) return false;
  const n = Math.abs((t * 17 + k * 13 + (variant | 0) * 9) % 100);
  return n < chance * 100;
}

// A regular window punched into a wall. The wall color stays wherever
// this returns null. row 0 of each story is the sill, so the floors
// read as stripes even after the picture is shrunk onto a phone.
function punchedWindow(side, t, k, night, variant, glassL, glassR, trim, chance) {
  const row = k % STORY;
  const col = t % 4;
  if (row === 0 || col === 0 || col === 3) return null;
  if (row === 1 || row === STORY - 1 || col === 1) return trim;
  if (lamp(t, k, variant, chance, night)) return LIT;
  return side === "L" ? glassL : glassR;
}

function houseDoor(side, t, n, k) {
  if (side !== "L") return null;
  const mid = Math.floor(n / 2);
  if (Math.abs(t - mid) > 2 || k < 1 || k > 10) return null;
  if (k >= 9) return TRIM;
  if (t === mid + 2 && (k === 5 || k === 6)) return KNOB;
  return DOOR;
}

function drawHouse(pen, b, ambient, night, victorian) {
  const rand = rng(b.variant || b.id * 97 || 1);
  const stories = b.status === "complete" ? b.targetStories : Math.max(0.35, b.storiesBuilt);
  const h = Math.max(STORY, Math.round(stories * STORY));
  const base = mul(
    hex(pick(rand, victorian ? ["#efe6d4", "#e7d2dc", "#d7e2ea", "#f3e2c4", "#e8dcc8"] : ["#c46a5a", "#d98c8c", "#e0a060", "#7f9a84", "#c9a56a", "#d8c4a0"])),
    ambient,
  );
  const roof = mul(hex(pick(rand, victorian ? ["#6e2434", "#3e4a58", "#2f4a38"] : ["#6b3a2a", "#8a4030", "#3d4a5a", "#4a4038"])), ambient);
  const trim = victorian ? TRIM : mix(base, 1.28);
  const inset = victorian ? 0.1 : 0.14;
  const u0 = b.x + inset;
  const v0 = b.y + inset;
  const u1 = b.x + 1 - inset;
  const v1 = b.y + 1 - inset;
  pen.box(u0, v0, u1, v1, 0, h, base);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 1) return null;
    if (k >= h - 2) return trim;
    const door = houseDoor(side, t, n, k);
    if (door) return door;
    return punchedWindow(side, t, k, night, b.variant, WIN, mix(WIN, 0.8), trim, 0.3);
  });
  pen.gable(u0, v0, u1, v1, h, victorian ? 12 : 8, roof);
  if (victorian) {
    // A bay stuck on the front face, and a corner turret. Those two
    // bumps are what separate a Victorian from a flat-front rowhouse
    // once you are close enough to see past the roof. Drawn after the
    // gable so the roof does not swallow them.
    pen.box(u0 + 0.12, v1 - 0.06, u0 + 0.48, v1 + 0.12, STORY, Math.max(STORY, h - STORY), mix(base, 1.08));
    pen.windows(u0 + 0.12, v1 - 0.06, u0 + 0.48, v1 + 0.12, Math.max(STORY, h - STORY), (side, t, n, k) => {
      if (t <= 0 || t >= n - 1 || k < 1) return null;
      return punchedWindow(side, t, k + STORY, night, b.variant, GLASS, GLASS_R, TRIM, 0.25);
    });
    const tx0 = u1 - 0.28;
    const tv0 = v0 + 0.06;
    pen.box(tx0, tv0, u1 + 0.04, v0 + 0.38, 0, h + 6, mix(base, 1.06));
    const [cx, cy] = project((tx0 + u1 + 0.04) / 2, (tv0 + v0 + 0.38) / 2, h + 6);
    pen.dome(cx, cy + 1, 6, roof);
  }
  const chimneyTop = h + (victorian ? 10 : 8);
  pen.box(u1 - 0.22, v0 + 0.1, u1 - 0.08, v0 + 0.26, h + 2, victorian ? 8 : 6, hex("#5c4038"));
  const cap = project(u1 - 0.15, v0 + 0.18, chimneyTop);
  pen.fillRect(cap[0] - 2, cap[1], 5, 2, hex("#3a3a3a"));
  if (!victorian && rand() < 0.55) {
    const [tx, ty] = project(b.x + 0.9, b.y + 0.12);
    pen.tree(tx, ty, false, hex("#2f7a32"));
  }
}

function drawShop(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 17 || 1);
  const stories = b.status === "complete" ? b.targetStories : Math.max(0.35, b.storiesBuilt);
  const h = Math.max(STORY * 2, Math.round(stories * STORY));
  const base = mul(hex(pick(rand, ["#a85a3a", "#8c4530", "#b86b45", "#9a5340"])), ambient);
  const awn = hex(pick(rand, ["#d03a3a", "#2f8a4a", "#2f5fb0", "#e0a020"]));
  const u0 = b.x + 0.08;
  const v0 = b.y + 0.1;
  const u1 = b.x + 0.92;
  const v1 = b.y + 0.92;
  const shopTop = STORY + 2;
  pen.box(u0, v0, u1, v1, 0, h, base);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 1) return null;
    if (k >= h - 2) return mix(base, 1.2);
    if (k <= shopTop) {
      if (k >= shopTop - 1) return awn;
      if (t % 5 === 0) return mix(GLASS, 0.55);
      return side === "L" ? GLASS : GLASS_R;
    }
    return punchedWindow(side, t, k, night, b.variant, WIN, mix(WIN, 0.82), mix(base, 1.25), 0.4);
  });
  // The awning sticks out past the wall. A stripe painted on the wall
  // disappears into the brick at phone size. A slab in front of the
  // shop does not.
  pen.box(u0 - 0.02, v0 + 0.02, u1 + 0.02, v1 + 0.1, shopTop - 1, 3, awn);
  pen.box(u0 + 0.06, v1 - 0.02, u0 + 0.28, v1 + 0.08, 0, 2, hex("#6a5a48"));
}

function drawOffice(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 13 || 1);
  const stories = b.status === "complete" ? b.targetStories : Math.max(0.35, b.storiesBuilt);
  const h = Math.max(STORY, Math.round(stories * STORY));
  const base = mul(hex(pick(rand, ["#8f9aa6", "#9aa8b4", "#7d8b98", "#a39888", "#b9b2a3"])), ambient);
  const u0 = b.x + 0.12;
  const v0 = b.y + 0.12;
  const u1 = b.x + 0.88;
  const v1 = b.y + 0.88;
  pen.box(u0, v0, u1, v1, 0, h, base);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 1 || k < 1) return null;
    if (k < STORY) {
      if (t % 3 === 0) return mix(base, 0.7);
      return side === "L" ? GLASS : GLASS_R;
    }
    const row = k % STORY;
    if (row === 0) return mix(base, side === "L" ? 0.86 : 0.62);
    if (t % 3 === 0) return null;
    if (lamp(t, k, b.variant, 0.22, night)) return LIT;
    return side === "L" ? WIN : mix(WIN, 0.8);
  });
  pen.box(u0 + 0.04, v0 + 0.04, u1 - 0.04, v1 - 0.04, h, 3, mix(base, 0.78));
  pen.box(b.x + 0.38, b.y + 0.34, b.x + 0.62, b.y + 0.58, h + 3, 5, hex("#7a8088"));
}

function drawTower(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 11 || 1);
  const stories = b.status === "complete" ? b.targetStories : Math.max(0.35, b.storiesBuilt);
  const h = Math.max(STORY, Math.round(stories * STORY));
  const base = mul(hex(pick(rand, ["#2f5f8a", "#3a7a96", "#3f6f9a", "#24506e", "#4a6478"])), ambient);
  const setback = stories >= 22;
  const h1 = setback ? Math.round(h * 0.78) : h;
  const u0 = b.x + 0.14;
  const v0 = b.y + 0.14;
  const u1 = b.x + 0.86;
  const v1 = b.y + 0.86;
  const crown = (k, top) => k > top - STORY * 2;
  pen.box(u0, v0, u1, v1, 0, h1, base);
  pen.windows(u0, v0, u1, v1, h1, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k < 1 || k >= h1 - 1) return null;
    if (k % STORY === 0) return mix(base, side === "L" ? 0.82 : 0.58);
    if (t % 3 === 0) return mix(base, 0.9);
    if (crown(k, h1)) return night ? LIT : hex("#fff1a8");
    if (lamp(t, k, b.variant, 0.18, night)) return LIT;
    return side === "L" ? GLASS : GLASS_R;
  });
  if (setback) {
    const h2 = h - h1;
    pen.box(b.x + 0.3, b.y + 0.3, b.x + 0.7, b.y + 0.7, h1, h2, mix(base, 1.06));
    pen.windows(b.x + 0.3, b.y + 0.3, b.x + 0.7, b.y + 0.7, h2, (side, t, n, k) => {
      if (t % 2 === 0 || k % STORY === 0) return null;
      if (crown(k, h2)) return night ? LIT : hex("#fff1a8");
      return side === "L" ? GLASS : GLASS_R;
    });
  }
  const [cx, cy] = project(b.x + 0.5, b.y + 0.5, h);
  for (let i = 0; i < 16; i += 1) pen.put(cx, cy - i, i % 3 === 0 ? hex("#f0f0f0") : hex("#b8b8b8"));
  pen.fillRect(cx - 1, cy - 18, 3, 3, hex("#ff3030"));
}

function drawState(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 19 || 1);
  const stories = b.status === "complete" ? b.targetStories : Math.max(0.35, b.storiesBuilt);
  const h = Math.max(STORY, Math.round(stories * STORY));
  const base = mul(hex(pick(rand, ["#d8d0bc", "#e4ddcc", "#cfc4a8"])), ambient);
  const u0 = b.x + 0.1;
  const v0 = b.y + 0.12;
  const u1 = b.x + 0.9;
  const v1 = b.y + 0.9;
  pen.box(u0, v0, u1, v1, 0, h, base);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 2) return null;
    // A light stripe every few columns reads as a column, not a window.
    if (t % 5 === 1) return mix(base, 1.18);
    if (k < STORY) return t % 2 === 0 ? mix(base, 1.05) : mix(base, 0.7);
    return punchedWindow(side, t, k, night, b.variant, hex("#3a4660"), hex("#2c384c"), mix(base, 0.75), 0.2);
  });
  pen.box(u0, v0, u1, v1, h, 3, mix(base, 0.8));
  const [cx, cy] = project(b.x + 0.62, b.y + 0.32, h + 3);
  for (let i = 0; i < 12; i += 1) pen.put(cx, cy - i, hex("#eceae4"));
  for (let i = 0; i < 7; i += 1) {
    pen.put(cx + 1 + i, cy - 12, hex("#c02020"));
    pen.put(cx + 1 + i, cy - 11, hex("#f4f4f4"));
    pen.put(cx + 1 + i, cy - 10, hex("#2040a0"));
  }
}

function drawMuseum(pen, b, ambient) {
  const rand = rng(b.variant || b.id * 23 || 1);
  const stories = b.status === "complete" ? b.targetStories : Math.max(0.35, b.storiesBuilt);
  const h = Math.max(STORY, Math.round(stories * STORY));
  const base = mul(hex(pick(rand, ["#c8a878", "#d8d2c6", "#b7c0c8"])), ambient);
  const h1 = Math.max(STORY * 2, Math.round(h * 0.55));
  pen.box(b.x + 0.12, b.y + 0.28, b.x + 0.7, b.y + 0.9, 0, h1, base);
  pen.windows(b.x + 0.12, b.y + 0.28, b.x + 0.7, b.y + 0.9, h1, (side, t, n, k) => {
    if (t <= 1 || t >= n - 1) return null;
    if (k > 4 && k < h1 - 3 && t % 4 !== 0) return side === "L" ? hex("#7ab0d0") : hex("#5a90b0");
    return null;
  });
  // One titanium shard. Two of these used to read as cathedral spires,
  // which is why the museum is a single spike on a low gallery.
  const shard = mul(hex("#e4ebf2"), ambient);
  const footL = project(b.x + 0.38, b.y + 0.62, h1);
  const footR = project(b.x + 0.86, b.y + 0.78, h1 - 2);
  const tip = project(b.x + 0.52, b.y + 0.28, h1 + 28);
  pen.fillPoly([footL, footR, tip], shard);
  pen.fillPoly([footR, project(b.x + 0.9, b.y + 0.4, h1), [tip[0] + 6, tip[1] + 8]], mix(shard, 0.72));
}

function drawCapitol(pen, b, ambient) {
  const x = b.x;
  const y = b.y;
  const stone = mul(hex("#ece6d8"), ambient);
  const u0 = x + 0.04;
  const v0 = y + 0.1;
  const u1 = x + 0.96;
  const v1 = y + 0.9;
  pen.box(u0, v0, u1, v1, 0, 22, stone);
  pen.windows(u0, v0, u1, v1, 22, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k < 2 || k > 19) return null;
    if (t % 4 === 1) return mix(stone, 1.16);
    if (k % 5 === 0) return mix(stone, 0.82);
    return side === "L" ? hex("#6e6a60") : hex("#524e46");
  });
  // Steps, so the door is not flush with the lawn.
  pen.box(x + 0.28, y + 0.78, x + 0.72, y + 0.98, 0, 4, mix(stone, 0.9));
  pen.box(x + 0.3, y + 0.28, x + 0.7, y + 0.72, 22, 16, mul(hex("#e6dfcf"), ambient));
  pen.windows(x + 0.3, y + 0.28, x + 0.7, y + 0.72, 16, (side, t, n, k) => {
    if (t % 3 !== 1 || k % 4 === 0) return null;
    return side === "L" ? hex("#6e6a60") : hex("#524e46");
  });
  const [cx, cy] = project(x + 0.5, y + 0.5, 38);
  pen.dome(cx, cy + 2, 16, hex("#e0b020"));
  pen.dome(cx, cy - 14, 4, hex("#f4d56a"));
  pen.fillRect(cx - 1, cy - 20, 3, 6, hex("#f8f4ea"));
  pen.put(cx, cy - 22, hex("#e0b020"));
}

function drawBuilding(pen, b, ambient, night) {
  if (b.type === "capitol") {
    drawCapitol(pen, b, ambient);
    return;
  }
  if (b.type === "rowhouse") {
    const victorian = (b.variant || 0) % 2 === 1;
    drawHouse(pen, b, ambient, night, victorian);
    return;
  }
  if (b.type === "mixeduse") {
    drawShop(pen, b, ambient, night);
    return;
  }
  if (b.type === "skyscraper") {
    drawTower(pen, b, ambient, night);
    return;
  }
  if (b.type === "museum") {
    drawMuseum(pen, b, ambient);
    return;
  }
  if (b.type === "state") {
    drawState(pen, b, ambient, night);
    return;
  }
  drawOffice(pen, b, ambient, night);
}

function drawUnionStation(pen, l, ambient) {
  const x = l.x;
  const y = l.y;
  const tan = mul(hex("#e2c49a"), ambient);
  const stone = mul(hex("#d8d0c4"), ambient);
  pen.box(x + 0.02, y + 0.18, x + 0.98, y + 0.84, 0, 18, tan);
  pen.windows(x + 0.02, y + 0.18, x + 0.98, y + 0.84, 18, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k > 14 || k < 2) return null;
    if (t % 4 === 0) return mix(tan, 0.7);
    if (k > 6 && k < 13 && t % 4 !== 1) return side === "L" ? hex("#243044") : hex("#1c2838");
    return null;
  });
  // The clock tower is the part you can pick out of the skyline.
  // The red roof runs the length of the shed under it.
  pen.box(x + 0.34, y + 0.28, x + 0.66, y + 0.7, 18, 16, stone);
  pen.windows(x + 0.34, y + 0.28, x + 0.66, y + 0.7, 16, (side, t, n, k) => {
    if (t % 3 === 1 && k > 2 && k < 12) return hex("#243044");
    return null;
  });
  const [cx, cy] = project(x + 0.5, y + 0.5, 34);
  pen.disc(cx, cy - 2, 5, hex("#f4e2a8"));
  pen.disc(cx, cy - 2, 4, hex("#fbf6e6"));
  pen.put(cx, cy - 2, hex("#2a241c"));
  pen.put(cx, cy - 3, hex("#2a241c"));
  pen.put(cx, cy - 4, hex("#2a241c"));
  pen.put(cx + 1, cy - 2, hex("#2a241c"));
  pen.put(cx + 2, cy - 2, hex("#2a241c"));
  // Red roof on the shed, not on the tower. The shed's roof is the
  // line at z = 18. The clock stays up on the tower.
  // A pitched red roof, tall enough that a phone still sees red on the
  // shed when the whole city is fit on screen. A one-pixel stripe vanished.
  const [rx, ry] = project(x + 0.5, y + 0.5, 20);
  for (let row = 0; row < 6; row += 1) {
    const inset = row;
    const color = row < 2 ? hex("#8e1c1c") : hex("#c42828");
    for (let i = -22 + inset; i <= 22 - inset; i += 1) pen.put(rx + i, ry - row, color);
  }
  pen.fillPoly(
    [
      [cx - 8, cy - 8],
      [cx + 8, cy - 8],
      [cx, cy - 18],
    ],
    hex("#7a3a2a"),
  );
}

function drawCourthouse(pen, l, ambient) {
  const x = l.x;
  const y = l.y;
  const stone = mul(hex("#d5cfc0"), ambient);
  pen.box(x + 0.16, y + 0.22, x + 0.84, y + 0.96, 0, 4, mix(stone, 0.86));
  pen.box(x + 0.12, y + 0.16, x + 0.88, y + 0.86, 4, 26, stone);
  pen.windows(x + 0.12, y + 0.16, x + 0.88, y + 0.86, 26, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1) return null;
    if (t % 4 === 1) return mix(stone, 1.16);
    if (k < 8) return null;
    if (k % 6 === 0) return mix(stone, 0.78);
    if ((t % 4 === 2 || t % 4 === 3) && k % 6 > 1 && k % 6 < 5) return hex("#3a4660");
    return null;
  });
  const L = project(x + 0.2, y + 0.8, 28);
  const R = project(x + 0.8, y + 0.8, 28);
  const tip = [(L[0] + R[0]) / 2, Math.min(L[1], R[1]) - 14];
  pen.fillPoly([L, R, tip], mix(stone, 1.12));
  const backL = project(x + 0.28, y + 0.28, 30);
  const backR = project(x + 0.72, y + 0.28, 30);
  pen.fillPoly([backL, backR, [tip[0], tip[1] + 4]], mix(stone, 0.9));
}

function drawArtMuseum(pen, l, ambient) {
  const x = l.x;
  const y = l.y;
  const stone = mul(hex("#8d877c"), ambient);
  pen.box(x + 0.08, y + 0.4, x + 0.5, y + 0.92, 0, 20, stone);
  pen.windows(x + 0.08, y + 0.4, x + 0.5, y + 0.92, 20, (side, t, n, k) => {
    if (t <= 1 || t >= n - 1 || k < 4 || k > 16) return null;
    if (t % 3 === 1) return hex("#d8d4cc");
    return null;
  });
  const shard = mul(hex("#d5dde4"), ambient);
  const a = project(x + 0.22, y + 0.7, 8);
  const b = project(x + 0.96, y + 0.82, 4);
  const tip = project(x + 0.4, y + 0.2, 58);
  pen.fillPoly([a, b, tip], shard);
  pen.fillPoly([b, project(x + 0.98, y + 0.22, 6), [tip[0] + 10, tip[1] + 10]], mix(shard, 0.7));
  // A bright edge on the lit side, so the spike still reads as metal
  // when the whole city is a couple of dozen pixels tall.
  pen.fillPoly([a, tip, [a[0] + 3, a[1] - 2]], mix(shard, 1.25));
}

function drawCathedral(pen, l, ambient) {
  const x = l.x;
  const y = l.y;
  const stone = mul(hex("#e7e2d6"), ambient);
  pen.box(x + 0.22, y + 0.2, x + 0.78, y + 0.86, 0, 28, stone);
  pen.windows(x + 0.22, y + 0.2, x + 0.78, y + 0.86, 28, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1) return null;
    if (side === "L" && k > 8 && k < 20 && Math.abs(t - n / 2) <= 2) return hex("#7a3058");
    if (k > 4 && k < 24 && t % 5 === 2) return hex("#6a3048");
    return null;
  });
  const [mx, my] = project(x + 0.5, y + 0.55, 16);
  pen.disc(mx, my, 5, hex("#6a3048"));
  pen.disc(mx, my, 3, hex("#3a6a9a"));
  pen.put(mx, my, hex("#f0d060"));
  const [ax, ay] = project(x + 0.32, y + 0.42, 28);
  const [bx, by] = project(x + 0.68, y + 0.58, 28);
  pen.fillPoly(
    [
      [ax - 4, ay + 2],
      [ax + 4, ay + 2],
      [ax, ay - 28],
    ],
    stone,
  );
  pen.fillPoly(
    [
      [bx - 4, by + 2],
      [bx + 4, by + 2],
      [bx, by - 28],
    ],
    mix(stone, 0.82),
  );
  pen.fillRect(ax - 1, ay - 30, 3, 4, hex("#f0d060"));
  pen.fillRect(bx - 1, by - 30, 3, 4, hex("#f0d060"));
}

function drawLandmark(pen, l, ambient) {
  if (l.key === "unionStation") drawUnionStation(pen, l, ambient);
  else if (l.key === "courthouse") drawCourthouse(pen, l, ambient);
  else if (l.key === "artMuseum") drawArtMuseum(pen, l, ambient);
  else if (l.key === "cathedral") drawCathedral(pen, l, ambient);
}

function drawPark(pen, p) {
  const x = p.x;
  const y = p.y;
  pen.diamond(x, y, hex("#3f8f3a"));
  pen.insetDiamond(x, y, 0.08, hex("#4ea044"));
  const [ax, ay] = project(x + 0.08, y + 0.48);
  const [bx, by] = project(x + 0.92, y + 0.56);
  const pathY = Math.round((ay + by) / 2);
  pen.hline(ax, bx, pathY, hex("#efe6c0"));
  pen.hline(ax, bx, pathY + 1, hex("#c8b888"));
  if (p.name === "Washington Park" || p.name === "City Park") {
    const [cx, cy] = project(x + 0.58, y + 0.6);
    pen.fillPoly(
      [
        [cx - 14, cy],
        [cx - 2, cy - 7],
        [cx + 14, cy - 1],
        [cx + 2, cy + 6],
      ],
      hex("#3a7ad0"),
    );
    pen.hline(cx - 8, cx + 6, cy - 3, hex("#8ec4ea"));
    if (p.name === "City Park") {
      pen.box(x + 0.18, y + 0.62, x + 0.4, y + 0.82, 0, 6, hex("#d8d0bc"));
      pen.gable(x + 0.18, y + 0.62, x + 0.4, y + 0.82, 6, 4, hex("#8a4030"));
    }
  }
  const spots = [
    [0.22, 0.22, false],
    [0.78, 0.2, false],
    [0.18, 0.78, true],
    [0.8, 0.8, false],
    [0.48, 0.16, p.name === "City Park"],
  ];
  for (const [u, v, big] of spots) {
    const [tx, ty] = project(x + u, y + v);
    pen.tree(tx, ty, big, hex("#2f7a32"));
  }
}

function lightTower(pen, x, y) {
  for (let i = 0; i < 18; i += 1) pen.put(x, y - i, hex("#d8dce2"));
  pen.fillRect(x - 3, y - 18, 7, 2, hex("#f6f3c8"));
  pen.put(x - 2, y - 16, hex("#ffe58a"));
  pen.put(x + 2, y - 16, hex("#ffe58a"));
}

function bowl(pen, cx, cy, rx, ry, rings, wall, lid) {
  for (let k = 0; k < rings; k += 1) {
    const inset = k * 1.2;
    pen.fillPoly(
      [
        [cx - rx + inset, cy - k],
        [cx, cy - ry - k],
        [cx + rx - inset, cy - k],
        [cx, cy + ry * 0.7 - k],
      ],
      k > rings - 4 ? lid : k % 5 === 0 ? mix(wall, 1.15) : wall,
    );
  }
}

function drawQuest(pen, q, ambient) {
  const x = q.x;
  const y = q.y;
  const name = q.name;
  if (name === "Coors Field") {
    const [cx, cy] = project(x + 1, y + 1);
    pen.fillPoly(
      [project(x, y), project(x + 2, y), project(x + 2, y + 2), project(x, y + 2)],
      mul(hex("#c4b8a4"), ambient),
    );
    bowl(pen, cx, cy, 36, 16, 16, hex("#8a3a2a"), hex("#3fa048"));
    pen.fillRect(cx - 2, cy + 2, 4, 3, hex("#c4a574"));
    lightTower(pen, cx - 30, cy - 8);
    lightTower(pen, cx + 30, cy - 6);
    return;
  }
  if (name === "Ball Arena") {
    const [cx, cy] = project(x + 1, y + 1);
    bowl(pen, cx, cy, 34, 16, 16, hex("#8aa0b8"), hex("#d5e2ee"));
    pen.disc(cx, cy - 14, 8, hex("#e8eef4"));
    pen.disc(cx, cy - 14, 5, hex("#9ec4e4"));
    for (let i = -28; i <= 28; i += 7) pen.put(cx + i, cy - 16, hex("#ffe58a"));
    return;
  }
  if (name === "Empower Field at Mile High") {
    const [cx, cy] = project(x + 1, y + 1);
    bowl(pen, cx, cy, 38, 15, 14, hex("#6a3040"), hex("#3fa048"));
    pen.fillRect(cx - 1, cy - 18, 2, 14, hex("#f0c020"));
    pen.fillRect(cx + 10, cy - 16, 2, 12, hex("#f0c020"));
    pen.hline(cx - 1, cx + 6, cy - 18, hex("#f0c020"));
    return;
  }
  if (name === "Red Rocks Amphitheatre") {
    const rock = hex("#a84830");
    pen.fillPoly(
      [project(x, y + 0.2, 0), project(x + 2, y, 18), project(x + 2, y + 2, 0), project(x, y + 1.7, 22)],
      rock,
    );
    pen.fillPoly(
      [project(x + 0.2, y + 0.45, 10), project(x + 1.7, y + 0.25, 14), project(x + 1.55, y + 1.45, 4)],
      hex("#c46a40"),
    );
    for (let i = 0; i < 6; i += 1) {
      const [sx, sy] = project(x + 0.45 + i * 0.18, y + 0.7 + i * 0.08, 8 + i);
      pen.hline(sx, sx + 14 - i, sy, i % 2 ? hex("#8a3028") : hex("#e8d2b0"));
    }
    return;
  }
  if (name === "Big Blue Bear") {
    pen.box(x + 0.35, y + 0.25, x + 1.7, y + 1.15, 0, 28, hex("#d7eef8"));
    pen.windows(x + 0.35, y + 0.25, x + 1.7, y + 1.15, 28, (side, t, n, k) => {
      if (t % 4 === 1 && k > 4 && k < 24) return side === "L" ? hex("#f4fbff") : hex("#7eb6e0");
      return null;
    });
    const [cx, cy] = project(x + 0.7, y + 1.15, 0);
    const blue = hex("#2f5fb8");
    pen.fillPoly(
      [
        [cx - 10, cy + 2],
        [cx + 8, cy + 2],
        [cx + 6, cy - 28],
        [cx - 8, cy - 28],
      ],
      blue,
    );
    pen.fillPoly(
      [
        [cx - 4, cy - 6],
        [cx + 4, cy - 8],
        [cx + 3, cy - 22],
        [cx - 3, cy - 20],
      ],
      mix(blue, 1.25),
    );
    pen.fillPoly(
      [
        [cx + 4, cy - 22],
        [cx + 16, cy - 34],
        [cx + 18, cy - 28],
        [cx + 6, cy - 16],
      ],
      blue,
    );
    pen.fillRect(cx - 8, cy - 32, 8, 8, mix(blue, 1.15));
    pen.put(cx - 3, cy - 28, hex("#f4fbff"));
    pen.fillRect(cx - 6, cy + 2, 4, 6, blue);
    pen.fillRect(cx + 2, cy + 2, 4, 6, blue);
    return;
  }
  if (name === "Confluence Park bridge") {
    pen.diamond(x, y, hex("#3a7ad0"));
    pen.diamond(x + 1, y, hex("#2f6fbe"));
    pen.box(x + 0.15, y + 0.35, x + 0.45, y + 0.7, 0, 8, hex("#d8d0bc"));
    pen.box(x + 1.55, y + 0.35, x + 1.85, y + 0.7, 0, 8, hex("#d8d0bc"));
    const [ax, ay] = project(x, y + 0.5, 6);
    const [bx] = project(x + 2, y + 0.5, 6);
    pen.hline(ax, bx, ay, hex("#8a8070"));
    pen.hline(ax, bx, ay - 1, hex("#f4f0e4"));
    pen.hline(ax, bx, ay - 2, hex("#f4f0e4"));
    pen.hline(ax, bx, ay - 3, hex("#c4b8a0"));
    for (let post = ax + 4; post < bx; post += 8) {
      pen.put(post, ay - 4, hex("#5a3a1a"));
      pen.put(post, ay - 5, hex("#5a3a1a"));
      pen.put(post, ay - 6, hex("#f0d060"));
    }
    return;
  }
  if (name === "16th Street Mall") {
    for (let i = 0; i < 2; i += 1) pen.diamond(x + i, y, hex("#b08968"));
    for (let i = 0; i < 2; i += 1) pen.diamond(x + i, y + 1, hex("#c4a574"));
    const awnings = ["#d03a3a", "#2f5fb0", "#e0a020"];
    for (let i = 0; i < 3; i += 1) {
      const wall = mul(hex(i % 2 ? "#d8d0bc" : "#c45c32"), ambient);
      pen.box(x + 0.15 + i * 0.6, y + 0.15, x + 0.65 + i * 0.6, y + 0.85, 0, 16 + (i % 2) * 6, wall);
      pen.box(x + 0.12 + i * 0.6, y + 0.12, x + 0.68 + i * 0.6, y + 0.95, 8, 3, hex(awnings[i]));
    }
    for (const u of [0.4, 1.1, 1.7]) {
      const [tx, ty] = project(x + u, y + 1.45);
      pen.tree(tx, ty, false, hex("#2f7a32"));
    }
    return;
  }
  if (name === "Cherry Creek Trail") {
    pen.diamond(x, y, hex("#3a7ad0"));
    pen.diamond(x + 1, y, hex("#2f6fbe"));
    pen.diamond(x, y + 1, hex("#c4a574"));
    pen.diamond(x + 1, y + 1, hex("#6aa84f"));
    const [ax, ay] = project(x + 0.05, y + 0.82, 6);
    const [bx] = project(x + 1.95, y + 0.82, 6);
    pen.hline(ax, bx, ay, hex("#5a3a1a"));
    pen.hline(ax, bx, ay - 1, hex("#f4f0e4"));
    pen.hline(ax, bx, ay - 2, hex("#e4d8c0"));
    pen.hline(ax, bx, ay - 3, hex("#8a8070"));
    for (let post = ax + 3; post < bx; post += 10) {
      pen.fillRect(post, ay - 8, 2, 5, hex("#5a3a1a"));
      pen.put(post, ay - 9, hex("#f0d060"));
    }
    const [tx, ty] = project(x + 1.55, y + 1.55);
    pen.tree(tx, ty, false, hex("#2f7a32"));
    const [tx2, ty2] = project(x + 0.4, y + 1.6);
    pen.tree(tx2, ty2, false, hex("#3f8f3a"));
    return;
  }
  if (name === "Denver Zoo") {
    pen.diamond(x, y, hex("#3f8f3a"));
    pen.diamond(x + 1, y, hex("#4ea044"));
    pen.diamond(x, y + 1, hex("#2f7a32"));
    pen.diamond(x + 1, y + 1, hex("#3f8f3a"));
    const [cx, cy] = project(x + 0.85, y + 0.9, 0);
    pen.fillPoly(
      [
        [cx - 16, cy + 2],
        [cx + 12, cy + 2],
        [cx + 10, cy - 14],
        [cx - 14, cy - 14],
      ],
      hex("#9aa0a6"),
    );
    pen.fillPoly(
      [
        [cx - 16, cy - 4],
        [cx - 26, cy - 2],
        [cx - 24, cy - 16],
        [cx - 12, cy - 14],
      ],
      hex("#7d848c"),
    );
    pen.fillPoly(
      [
        [cx + 6, cy - 14],
        [cx + 16, cy - 20],
        [cx + 15, cy - 6],
        [cx + 6, cy - 6],
      ],
      hex("#c5ccd1"),
    );
    pen.fillRect(cx + 12, cy - 16, 3, 3, hex("#263238"));
    for (let i = 0; i < 8; i += 1) pen.put(cx + 16, cy - 4 + i, hex("#8e959c"));
    pen.put(cx + 15, cy + 4, hex("#8e959c"));
    for (const u of [0.25, 0.7, 1.15, 1.6]) {
      const [px, py] = project(x + u, y + 1.72, 0);
      pen.fillRect(px, py - 8, 2, 8, hex("#8d6e4a"));
      pen.put(px, py - 9, hex("#f0d060"));
    }
    pen.box(x + 1.35, y + 0.25, x + 1.85, y + 0.7, 0, 10, hex("#d8d0bc"));
    pen.gable(x + 1.35, y + 0.25, x + 1.85, y + 0.7, 10, 5, hex("#8a4030"));
    return;
  }
  if (name === "Denver Botanic Gardens") {
    pen.diamond(x, y, hex("#3f8f3a"));
    pen.diamond(x + 1, y, hex("#4caf50"));
    pen.diamond(x, y + 1, hex("#2f7a32"));
    pen.diamond(x + 1, y + 1, hex("#3f8f3a"));
    pen.box(x + 0.3, y + 0.15, x + 1.7, y + 1.2, 0, 12, hex("#d7eefc"));
    for (let k = 0; k < 6; k += 1) {
      const inset = k * 0.08;
      const glass = k % 2 ? hex("#f4fbff") : hex("#7eb6e0");
      pen.fillPoly(
        [
          project(x + 0.45 + inset, y + 0.28, 14 + k * 4),
          project(x + 1.55 - inset, y + 0.28, 14 + k * 4),
          project(x + 1.55 - inset, y + 1.05, 14 + k * 4),
          project(x + 0.45 + inset, y + 1.05, 14 + k * 4),
        ],
        glass,
      );
    }
    const [dx, dy] = project(x + 1, y + 0.65, 38);
    pen.dome(dx, dy, 10, hex("#e8f6ff"));
    const beds = [
      [0.28, 1.5, "#d62828"],
      [0.7, 1.65, "#fdd835"],
      [1.15, 1.48, "#e040fb"],
      [1.55, 1.7, "#f57c00"],
    ];
    for (const [u, v, color] of beds) {
      const [fx, fy] = project(x + u, y + v, 2);
      const petal = hex(color);
      pen.fillRect(fx, fy - 2, 3, 3, petal);
      pen.put(fx + 1, fy - 1, hex("#f4f0c0"));
    }
    return;
  }
  if (name === "Denver Athletic Club") {
    const brick = mul(hex("#8a4030"), ambient);
    pen.box(x + 0.25, y + 0.25, x + 1.75, y + 1.7, 0, 18, brick);
    pen.windows(x + 0.25, y + 0.25, x + 1.75, y + 1.7, 18, (side, t, n, k) => {
      if (t <= 1 || t >= n - 1 || k < 2 || k > 15) return null;
      if (t % 5 === 2 && k % 6 > 1 && k % 6 < 5) return hex("#f4efe4");
      return null;
    });
    pen.box(x + 0.25, y + 0.25, x + 1.75, y + 1.7, 18, 3, mix(brick, 0.75));
    const [cx, cy] = project(x + 1, y + 1, 21);
    pen.fillRect(cx - 8, cy, 16, 4, hex("#f0d060"));
    return;
  }
  pen.box(x + 0.2, y + 0.2, x + 1.6, y + 1.6, 0, 16, mul(hex("#8a4030"), ambient));
}

export const denverTheme = {
  id: "Denver",
  ground: GROUND,
  mountains: MOUNTAINS,
  grass: ["#8fa452", "#7d9448", "#9aaa58"],
  road: { day: "#4a4e56", night: "#2c2e34" },
  sidewalk: { day: "#d9d1c2", night: "#6a655c" },
  curb: { day: "#6e665c", night: "#3a3834" },
  lane: { day: "#e6d36a", night: "#f0d060" },
  crosswalk: "#efe6c4",
  skirt: ["#7a5230", "#5e3e24"],
  drawBuilding,
  drawLandmark,
  drawPark,
  drawQuest,
};
