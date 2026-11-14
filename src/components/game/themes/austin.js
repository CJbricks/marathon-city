// Austin's colors and silhouettes.
//
// The mile rules are still the ones in rules.js. This file only changes
// what a slot looks like, and what we call it. A 100-mile landmark is
// still the unionStation slot. Here that slot is the Congress Avenue
// Bridge, not Union Station. The save stores the slot key. The labels
// map below is the Austin name for that key.
//
// The palette comes from the campus, not from a logo: burnt orange
// (#BF5700), cream limestone, terracotta tile, live-oak green, and a
// warm sky. Nothing in this file draws a seal, a wordmark, or a mascot.
//
// What should still be obvious when the whole city fits on a phone:
//   bungalows have a red hip roof and a porch, shops have an awning,
//   the capitol is a pink dome (not gold), the UT Tower is a thin
//   cream shaft with an orange top, the bridge sits on green water.

import { hex, mix, mul, pick, rng } from "../pixelPen";
import { STORY, project } from "../sceneLayout";

const WIN = hex("#3a342c");
const LIT = hex("#ffe0a0");
const GLASS = hex("#d5ebe4");
const GLASS_R = hex("#7eaaa0");
const CREAM = hex("#f4efe4");
const LIMESTONE = hex("#e7dcc8");
const TILE = hex("#b8452f");
const TILE_DARK = hex("#8c3424");
const ORANGE = hex("#bf5700");
const OAK = hex("#2f5a32");
const OAK_LIT = hex("#3f6b3a");
const WATER = hex("#2f8f86");
const WATER_DEEP = hex("#1f6f72");

const GROUND = {
  far: "#6e8a3c",
  mid: "#c4a84a",
  // The field under the city. Caliche gold with enough green that it
  // reads as Hill Country grass, not the lake and not Denver's sand.
  near: "#b7a23a",
  farUntil: 20,
  midUntil: 72,
};

const MOUNTAINS = {
  // Rolling hills, not a snow ridge. snowline is above every peak so the
  // ridge painter never caps them in white. The two greens are the lit
  // side and the shade side of the same grassy hill.
  rock: "#c6b15a",
  rockShade: "#7e9a40",
  snow: "#c6b15a",
  snowShade: "#a3a24a",
  foothill: "#5f8f3c",
  foothillShade: "#3f6b32",
  snowline: 400,
  main: { seed: 4, hmin: 16, hmax: 72 },
  foothills: { seed: 19, hmin: 8, hmax: 36 },
};

// Names a person would say, keyed by the slot the simulator already uses.
// Drawing code matches the slot. A caption, if one is added later, should
// read this map instead of the Denver string stored on the city.
export const AUSTIN_LABELS = {
  capitol: "Texas State Capitol",
  unionStation: "Congress Avenue Bridge",
  courthouse: "UT Tower",
  artMuseum: "Blanton Museum of Art",
  cathedral: "St. Mary Cathedral",
  "Cherry Creek Trail": "Barton Springs Pool",
  "Denver Zoo": "Mount Bonnell",
  "Denver Botanic Gardens": "Pennybacker Bridge",
  "Big Blue Bear": "Giga Texas",
  "Denver Athletic Club": "Frost Bank Tower",
  "Cheesman Park": "Zilker Park",
  "Washington Park": "Lady Bird Lake trail",
  "City Park": "Auditorium Shores",
  "Coors Field": "Q2 Stadium",
  "Ball Arena": "Moody Center",
  "Empower Field at Mile High": "DKR Texas Memorial Stadium",
  "Confluence Park bridge": "Sixth Street",
  "16th Street Mall": "South Congress",
  "Red Rocks Amphitheatre": "Circuit of the Americas",
};

function lamp(t, k, variant, chance, night) {
  if (!night || chance <= 0) return false;
  const n = Math.abs((t * 17 + k * 13 + (variant | 0) * 9) % 100);
  return n < chance * 100;
}

function punchedWindow(side, t, k, night, variant, glassL, glassR, trim, chance) {
  const row = k % STORY;
  const col = t % 4;
  if (row === 0 || col === 0 || col === 3) return null;
  if (row === 1 || row === STORY - 1 || col === 1) return trim;
  if (lamp(t, k, variant, chance, night)) return LIT;
  return side === "L" ? glassL : glassR;
}

function builtHeight(b, minStories) {
  const stories = b.status === "complete" ? b.targetStories : Math.max(0.35, b.storiesBuilt);
  return Math.max(STORY * minStories, Math.round(stories * STORY));
}

function oak(pen, x, y, big) {
  pen.tree(x, y, big, big ? OAK_LIT : OAK);
}

// A red hip roof. The pen's gable is one ridge. A second, lower cap down
// the middle reads as the other two slopes once the picture is small.
function hipRoof(pen, u0, v0, u1, v1, z, rh, tile) {
  pen.gable(u0, v0, u1, v1, z, rh, tile);
  const [cx, cy] = project((u0 + u1) / 2, (v0 + v1) / 2, z + rh);
  pen.fillRect(cx - 4, cy - 1, 9, 2, mix(tile, 0.82));
}

function drawBungalow(pen, b, ambient, night, deepPorch) {
  const rand = rng(b.variant || b.id * 97 || 1);
  const h = builtHeight(b, 1);
  const wall = mul(hex(pick(rand, deepPorch ? ["#e7d3b0", "#d9c4a4", "#cbb892"] : ["#f4efe4", "#efe6d4", "#e7dcc8", "#f7f1e4"])), ambient);
  const tile = mul(hex(pick(rand, ["#b8452f", "#a33b28", "#c45a3a"])), ambient);
  const u0 = b.x + 0.08;
  const v0 = b.y + 0.16;
  const u1 = b.x + 0.92;
  const v1 = b.y + 0.78;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 1) return null;
    if (k >= h - 2) return mix(wall, 1.08);
    return punchedWindow(side, t, k, night, b.variant, WIN, mix(WIN, 0.8), mix(wall, 1.2), 0.35);
  });
  hipRoof(pen, u0, v0, u1, v1, h, deepPorch ? 10 : 8, tile);
  // The porch is the bungalow's silhouette. It sticks out past the front
  // wall, the same way a shop awning does, so it survives phone scale.
  const porchH = deepPorch ? 5 : 4;
  pen.box(u0 + 0.06, v1 - 0.02, u1 - 0.06, v1 + 0.16, 0, porchH, mix(wall, 1.05));
  pen.box(u0 + 0.06, v1 - 0.02, u1 - 0.06, v1 + 0.16, porchH, 2, tile);
  const door = hex("#6a3a28");
  pen.box(b.x + 0.4, b.y + 0.72, b.x + 0.55, b.y + 0.9, 0, 8, door);
  if (rand() < 0.8) {
    const [tx, ty] = project(b.x + (deepPorch ? 0.12 : 0.9), b.y + 0.2);
    oak(pen, tx, ty, false);
  }
}

function drawShop(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 17 || 1);
  const h = builtHeight(b, 2);
  const wall = mul(hex(pick(rand, ["#f4efe4", "#efe2c9", "#e7dcc8", "#f7f1e4"])), ambient);
  const awn = hex(pick(rand, ["#bf5700", "#3f6b3a", "#1f4e79", "#c4503a"]));
  const u0 = b.x + 0.08;
  const v0 = b.y + 0.12;
  const u1 = b.x + 0.92;
  const v1 = b.y + 0.88;
  const shopTop = STORY + 2;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 1) return null;
    if (k >= h - 2) return mix(wall, 1.12);
    if (k <= shopTop) {
      if (k >= shopTop - 1) return awn;
      if (t % 5 === 0) return mix(GLASS, 0.7);
      return side === "L" ? GLASS : GLASS_R;
    }
    return punchedWindow(side, t, k, night, b.variant, WIN, mix(WIN, 0.82), mix(wall, 1.15), 0.4);
  });
  pen.box(u0 - 0.02, v0 + 0.02, u1 + 0.02, v1 + 0.12, shopTop - 1, 3, awn);
  hipRoof(pen, u0, v0, u1, v1, h, 7, TILE);
}

function drawOffice(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 13 || 1);
  const h = builtHeight(b, 1);
  const wall = mul(hex(pick(rand, ["#e7dcc8", "#efe6d4", "#ddd2bc", "#f4efe4"])), ambient);
  const u0 = b.x + 0.12;
  const v0 = b.y + 0.12;
  const u1 = b.x + 0.88;
  const v1 = b.y + 0.88;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 1 || k < 1) return null;
    if (k < STORY) {
      if (t % 3 === 0) return mix(wall, 0.75);
      return side === "L" ? GLASS : GLASS_R;
    }
    const row = k % STORY;
    if (row === 0) return mix(wall, side === "L" ? 0.9 : 0.7);
    if (t % 3 === 0) return null;
    if (lamp(t, k, b.variant, 0.2, night)) return LIT;
    return side === "L" ? WIN : mix(WIN, 0.8);
  });
  pen.box(u0, v0, u1, v1, h, 3, mix(wall, 0.82));
  hipRoof(pen, u0 + 0.04, v0 + 0.04, u1 - 0.04, v1 - 0.04, h + 3, 6, TILE_DARK);
}

// Three downtown silhouettes, picked from the building's variant so a
// block does not become three copies of one tower. None of them carries
// a wordmark. The shape is the name: stacked slabs, a sail, a bronze shaft.
function drawTower(pen, b, ambient, night) {
  const kind = Math.abs(b.variant | 0) % 3;
  if (kind === 0) drawJenga(pen, b, ambient, night);
  else if (kind === 1) drawSail(pen, b, ambient, night);
  else drawBronzeTower(pen, b, ambient, night);
}

function towerWindows(pen, u0, v0, u1, v1, h, base, night, variant) {
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k < 1 || k >= h - 1) return null;
    if (k % STORY === 0) return mix(base, side === "L" ? 0.86 : 0.62);
    if (t % 3 === 0) return mix(base, 0.9);
    if (lamp(t, k, variant, 0.2, night)) return LIT;
    return side === "L" ? GLASS : GLASS_R;
  });
}

function drawJenga(pen, b, ambient, night) {
  const h = builtHeight(b, 1);
  const slabs = [
    [0.16, 0.24, 0.78, 0.86],
    [0.28, 0.12, 0.9, 0.7],
    [0.1, 0.3, 0.7, 0.9],
    [0.22, 0.18, 0.8, 0.76],
  ];
  const slabH = Math.max(STORY * 2, Math.floor(h / slabs.length));
  const stone = mul(hex("#efe6d4"), ambient);
  let z = 0;
  for (let i = 0; i < slabs.length && z < h; i += 1) {
    const [u0, v0, u1, v1] = slabs[i];
    const hh = Math.min(slabH, h - z);
    pen.box(b.x + u0, b.y + v0, b.x + u1, b.y + v1, z, hh, i % 2 ? mix(stone, 1.04) : stone);
    towerWindows(pen, b.x + u0, b.y + v0, b.x + u1, b.y + v1, hh, stone, night, b.variant + i);
    z += hh;
  }
}

function drawSail(pen, b, ambient, night) {
  const h = builtHeight(b, 1);
  const glass = mul(hex("#e7eef0"), ambient);
  const u0 = b.x + 0.28;
  const v0 = b.y + 0.22;
  const u1 = b.x + 0.72;
  const v1 = b.y + 0.7;
  pen.box(u0, v0, u1, v1, 0, h, glass);
  towerWindows(pen, u0, v0, u1, v1, h, glass, night, b.variant);
  // The sail is a wedge that leans out over the shaft. A box would just
  // be another office. The wide top is what reads at phone size.
  const foot = project(b.x + 0.78, b.y + 0.82, h * 0.35);
  const topL = project(b.x + 0.12, b.y + 0.18, h + 8);
  const topR = project(b.x + 0.88, b.y + 0.42, h + 4);
  pen.fillPoly([foot, topL, topR], mix(glass, 1.08));
  pen.fillPoly([foot, topR, project(b.x + 0.7, b.y + 0.55, h * 0.4)], mix(glass, 0.78));
}

function drawBronzeTower(pen, b, ambient, night) {
  const h = builtHeight(b, 1);
  const bronze = mul(hex("#8a7358"), ambient);
  const u0 = b.x + 0.22;
  const v0 = b.y + 0.18;
  const u1 = b.x + 0.7;
  const v1 = b.y + 0.72;
  pen.box(u0, v0, u1, v1, 0, h, bronze);
  towerWindows(pen, u0, v0, u1, v1, h, bronze, night, b.variant);
  pen.box(b.x + 0.3, b.y + 0.26, b.x + 0.62, b.y + 0.6, h, 8, mix(bronze, 1.1));
  pen.box(b.x + 0.38, b.y + 0.34, b.x + 0.54, b.y + 0.5, h + 8, 6, mix(bronze, 0.8));
}

function drawState(pen, b, ambient, night) {
  const h = builtHeight(b, 1);
  const wall = mul(hex("#e7dcc8"), ambient);
  const u0 = b.x + 0.1;
  const v0 = b.y + 0.12;
  const u1 = b.x + 0.9;
  const v1 = b.y + 0.9;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 2) return null;
    if (t % 5 === 1) return mix(wall, 1.14);
    if (k < STORY) return t % 2 === 0 ? mix(wall, 1.04) : mix(wall, 0.72);
    return punchedWindow(side, t, k, night, b.variant, hex("#3a4660"), hex("#2c384c"), mix(wall, 0.78), 0.18);
  });
  pen.box(u0, v0, u1, v1, h, 3, mix(wall, 0.82));
  const [cx, cy] = project(b.x + 0.62, b.y + 0.3, h + 3);
  for (let i = 0; i < 12; i += 1) pen.put(cx, cy - i, CREAM);
  // A small Texas flag: blue vertical stripe, white over red. It is a
  // flag, not a seal. The stripe is wide enough to survive the phone fit.
  for (let i = 0; i < 8; i += 1) {
    pen.put(cx + 1 + i, cy - 12, hex("#bf0a30"));
    pen.put(cx + 1 + i, cy - 11, i < 3 ? hex("#002868") : hex("#ffffff"));
    pen.put(cx + 1 + i, cy - 10, i < 3 ? hex("#002868") : hex("#ffffff"));
  }
}

function drawMuseum(pen, b, ambient) {
  const h = builtHeight(b, 2);
  const wall = mul(hex("#e7dcc8"), ambient);
  const u0 = b.x + 0.1;
  const v0 = b.y + 0.16;
  const u1 = b.x + 0.9;
  const v1 = b.y + 0.88;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 1 || t >= n - 1) return null;
    if (k > 4 && k < h - 4 && t % 4 !== 0) return side === "L" ? hex("#c5ddd4") : hex("#8aab9e");
    return null;
  });
  hipRoof(pen, u0, v0, u1, v1, h, 8, TILE);
}

function drawCapitol(pen, b, ambient) {
  const x = b.x;
  const y = b.y;
  // Sunset-red granite. The dome is the same stone, not gold. A gold
  // dome is Denver's capitol, and the two have to be told apart at a glance.
  const stone = mul(hex("#c48478"), ambient);
  const stoneLit = mul(hex("#e0b0a4"), ambient);
  const u0 = x + 0.06;
  const v0 = y + 0.12;
  const u1 = x + 0.94;
  const v1 = y + 0.9;
  pen.box(u0, v0, u1, v1, 0, 22, stone);
  pen.windows(u0, v0, u1, v1, 22, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k < 2 || k > 19) return null;
    if (t % 4 === 1) return stoneLit;
    if (k % 5 === 0) return mix(stone, 0.78);
    return side === "L" ? hex("#6e4038") : hex("#5a342e");
  });
  pen.box(x + 0.28, y + 0.78, x + 0.72, y + 0.98, 0, 4, mix(stone, 0.9));
  pen.box(x + 0.28, y + 0.28, x + 0.72, y + 0.72, 22, 14, mul(hex("#d7a094"), ambient));
  pen.windows(x + 0.28, y + 0.28, x + 0.72, y + 0.72, 14, (side, t, n, k) => {
    if (t % 3 !== 1 || k % 4 === 0) return null;
    return side === "L" ? hex("#6e4038") : hex("#5a342e");
  });
  const [cx, cy] = project(x + 0.5, y + 0.5, 36);
  pen.dome(cx, cy + 2, 16, mul(hex("#d7a094"), ambient));
  pen.dome(cx, cy - 14, 5, mul(hex("#e8c4b8"), ambient));
  pen.fillRect(cx - 1, cy - 20, 3, 6, CREAM);
  pen.put(cx, cy - 22, hex("#c48478"));
}

function drawBuilding(pen, b, ambient, night) {
  if (b.type === "capitol") {
    drawCapitol(pen, b, ambient);
    return;
  }
  if (b.type === "rowhouse") {
    drawBungalow(pen, b, ambient, night, (b.variant || 0) % 2 === 1);
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

function drawBridge(pen, l) {
  const x = l.x;
  const y = l.y;
  // Water first, then the deck. The civic slot is one lot, the same size
  // Union Station used. The deck runs past the lot so the span still
  // reads as a bridge when you are zoomed out.
  pen.diamond(x, y, WATER_DEEP);
  pen.insetDiamond(x, y, 0.08, WATER);
  const [sx, sy] = project(x + 0.5, y + 0.55, 2);
  pen.hline(sx - 10, sx + 8, sy, hex("#8fd0c8"));
  pen.box(x - 0.08, y + 0.3, x + 1.08, y + 0.72, 8, 5, hex("#c8c0b0"));
  pen.box(x - 0.08, y + 0.3, x + 1.08, y + 0.72, 13, 2, hex("#f4efe4"));
  // Pilings and a dark arch under the deck, on the front face.
  for (const u of [0.15, 0.4, 0.65, 0.9]) {
    pen.box(x + u, y + 0.62, x + u + 0.08, y + 0.78, 0, 8, hex("#8a8070"));
  }
  const [ax, ay] = project(x + 0.15, y + 0.7, 8);
  const [bx, by] = project(x + 0.9, y + 0.7, 8);
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    const px = Math.round(ax + (bx - ax) * t);
    const py = Math.round(ay + (by - ay) * t + Math.sin(t * Math.PI) * 5);
    pen.fillRect(px, py, 3, 3, hex("#5a5048"));
  }
  for (let post = ax; post <= bx; post += 6) {
    pen.fillRect(post, ay - 8, 2, 6, hex("#4a4038"));
  }
}

function drawTowerLandmark(pen, l, ambient, night) {
  const x = l.x;
  const y = l.y;
  // The box shader paints the right face at 55% brightness. On a thin
  // shaft that face is most of the tower, and limestone came out brown.
  // These two creams are written back over the faces. The right edge is
  // only a step darker, so the corner still turns, and the shaft stays
  // white even when the clock ambient is dim. `ambient` is unused on
  // purpose for that reason.
  void ambient;
  const shaft = hex("#fff8ef");
  const shaftShade = hex("#f3e6d2");
  const u0 = x + 0.36;
  const v0 = y + 0.32;
  const u1 = x + 0.64;
  const v1 = y + 0.68;
  pen.box(x + 0.3, y + 0.46, x + 0.7, y + 0.92, 0, 5, shaftShade);
  pen.box(u0, v0, u1, v1, 5, 52, shaft);
  pen.windows(u0, v0, u1, v1, 52, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1) return side === "R" ? shaftShade : shaft;
    const win = k > 8 && k < 44 && k % 6 > 1 && k % 6 < 5 && t % 4 === 2;
    if (win) return side === "L" ? hex("#6a5c4c") : hex("#4e4338");
    if (side === "R" && t > n * 0.7) return shaftShade;
    return shaft;
  });
  const [cx, cy] = project(x + 0.5, y + 0.5, 40);
  pen.disc(cx, cy, 4, CREAM);
  pen.disc(cx, cy, 3, hex("#2a241c"));
  pen.put(cx, cy - 1, CREAM);
  pen.put(cx, cy, CREAM);
  pen.put(cx + 1, cy, CREAM);
  // The lit crown. At dusk and night it is brighter and taller. By day
  // it is still orange, or the tower would not read at noon.
  const glow = night ? hex("#ff7a18") : hex("#e07020");
  const band = night ? 12 : 7;
  pen.box(u0 - 0.02, v0 + 0.02, u1 + 0.02, v1 - 0.02, 48, band, glow);
  hipRoof(pen, u0 - 0.04, v0, u1 + 0.04, v1, 48 + band, 8, TILE);
  const [tx, ty] = project(x + 0.5, y + 0.5, 48 + band + 8);
  pen.fillRect(tx - 1, ty - 6, 2, 6, CREAM);
  pen.put(tx, ty - 7, ORANGE);
}

function drawBlanton(pen, l, ambient) {
  const x = l.x;
  const y = l.y;
  const stone = mul(LIMESTONE, ambient);
  pen.box(x + 0.1, y + 0.28, x + 0.9, y + 0.9, 0, 16, stone);
  pen.windows(x + 0.1, y + 0.28, x + 0.9, y + 0.9, 16, (side, t, n, k) => {
    if (t <= 1 || t >= n - 1 || k < 3 || k > 13) return null;
    if (t % 4 === 1) return hex("#c5ddd4");
    return null;
  });
  // The canopy is a row of colored petals, not a metal spike. A spike
  // is what the Denver museum uses, and it reads as a cathedral.
  const petals = ["#bf5700", "#f4e6c8", "#e7c9a0", "#c4503a", "#f0d090", "#3f6b3a"];
  for (let i = 0; i < petals.length; i += 1) {
    const [px, py] = project(x + 0.18 + i * 0.12, y + 0.42, 18);
    pen.disc(px, py - 6, 5, hex(petals[i]));
    pen.fillRect(px - 1, py - 2, 2, 6, hex("#8a8070"));
  }
}

function drawCathedral(pen, l, ambient) {
  const x = l.x;
  const y = l.y;
  const stone = mul(CREAM, ambient);
  // St. Mary Cathedral: one tall steeple and a rose window. Denver's
  // cathedral is two equal spires. One steeple is how these stay apart.
  pen.box(x + 0.22, y + 0.28, x + 0.78, y + 0.88, 0, 20, stone);
  pen.windows(x + 0.22, y + 0.28, x + 0.78, y + 0.88, 20, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1) return null;
    if (k > 4 && k < 16 && t % 5 === 2) return hex("#6a3048");
    return null;
  });
  hipRoof(pen, x + 0.22, y + 0.28, x + 0.78, y + 0.88, 20, 6, TILE);
  const [mx, my] = project(x + 0.5, y + 0.62, 12);
  pen.disc(mx, my, 5, hex("#6a3048"));
  pen.disc(mx, my, 3, hex("#3a6a9a"));
  pen.put(mx, my, hex("#f0d090"));
  const [ax, ay] = project(x + 0.32, y + 0.48, 20);
  const [bx, by] = project(x + 0.68, y + 0.55, 20);
  pen.fillPoly(
    [
      [ax - 3, ay + 2],
      [ax + 3, ay + 2],
      [ax, ay - 14],
    ],
    mix(stone, 0.9),
  );
  pen.fillPoly(
    [
      [bx - 3, by + 2],
      [bx + 3, by + 2],
      [bx, by - 14],
    ],
    mix(stone, 0.82),
  );
  const [sx, sy] = project(x + 0.5, y + 0.5, 26);
  pen.fillPoly(
    [
      [sx - 5, sy + 4],
      [sx + 5, sy + 4],
      [sx, sy - 32],
    ],
    stone,
  );
  pen.fillRect(sx - 1, sy - 36, 3, 6, hex("#f0d090"));
  pen.put(sx, sy - 38, hex("#6a3048"));
}

function drawLandmark(pen, l, ambient, night) {
  if (l.key === "unionStation") drawBridge(pen, l);
  else if (l.key === "courthouse") drawTowerLandmark(pen, l, ambient, night);
  else if (l.key === "artMuseum") drawBlanton(pen, l, ambient);
  else if (l.key === "cathedral") drawCathedral(pen, l, ambient);
}

function drawPark(pen, p) {
  const x = p.x;
  const y = p.y;
  const lawn = p.name === "Washington Park" ? hex("#3f6b3a") : hex("#4e8a40");
  pen.diamond(x, y, lawn);
  pen.insetDiamond(x, y, 0.08, hex("#67a354"));
  const [ax, ay] = project(x + 0.08, y + 0.55);
  const [bx, by] = project(x + 0.92, y + 0.62);
  const pathY = Math.round((ay + by) / 2);
  pen.hline(ax, bx, pathY, hex("#e7dcc8"));
  pen.hline(ax, bx, pathY + 1, hex("#c4b48a"));
  if (p.name === "Cheesman Park") {
    // Zilker. A small spring pool, not the full Barton Springs block.
    const [cx, cy] = project(x + 0.58, y + 0.48);
    pen.disc(cx, cy, 8, hex("#7fd3c4"));
    pen.disc(cx, cy - 2, 4, hex("#d8fff4"));
  } else if (p.name === "Washington Park") {
    // Lady Bird Lake trail: the water is the park, the path runs along it.
    const [cx, cy] = project(x + 0.55, y + 0.58);
    pen.fillPoly(
      [
        [cx - 16, cy],
        [cx - 2, cy - 8],
        [cx + 16, cy - 1],
        [cx + 2, cy + 7],
      ],
      WATER,
    );
    pen.hline(cx - 8, cx + 6, cy - 3, hex("#8fd0c8"));
  } else if (p.name === "City Park") {
    // Auditorium Shores: a lawn and a low shell facing the water.
    pen.box(x + 0.2, y + 0.58, x + 0.48, y + 0.82, 0, 6, LIMESTONE);
    pen.gable(x + 0.2, y + 0.58, x + 0.48, y + 0.82, 6, 5, hex("#d9d3c8"));
  }
  const spots = [
    [0.2, 0.22, true],
    [0.78, 0.18, false],
    [0.16, 0.8, false],
    [0.82, 0.78, true],
  ];
  for (const [u, v, big] of spots) {
    const [tx, ty] = project(x + u, y + v);
    oak(pen, tx, ty, big);
  }
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

function lightTower(pen, x, y, lampColor) {
  for (let i = 0; i < 16; i += 1) pen.put(x, y - i, hex("#d8dce2"));
  pen.fillRect(x - 3, y - 16, 7, 2, lampColor);
}

function drawQuest(pen, q, ambient) {
  const x = q.x;
  const y = q.y;
  const name = q.name;
  if (name === "Coors Field") {
    const [cx, cy] = project(x + 1, y + 1);
    pen.fillPoly([project(x, y), project(x + 2, y), project(x + 2, y + 2), project(x, y + 2)], hex("#1c1c1c"));
    bowl(pen, cx, cy, 36, 16, 16, hex("#16351f"), hex("#1f8a4c"));
    lightTower(pen, cx - 28, cy - 8, hex("#e8f6ee"));
    lightTower(pen, cx + 28, cy - 6, hex("#e8f6ee"));
    return;
  }
  if (name === "Ball Arena") {
    const [cx, cy] = project(x + 1, y + 1);
    bowl(pen, cx, cy, 34, 16, 16, hex("#2a241c"), hex("#4a4038"));
    for (let i = -26; i <= 26; i += 4) pen.put(cx + i, cy - 12, ORANGE);
    pen.disc(cx, cy - 16, 6, hex("#1a120c"));
    return;
  }
  if (name === "Empower Field at Mile High") {
    const [cx, cy] = project(x + 1, y + 1);
    // Burnt-orange bowl with a cream rim. The horseshoe is a gap in the
    // near rim so it is not a closed circle like the soccer stadium.
    bowl(pen, cx, cy, 40, 16, 16, ORANGE, hex("#f4efe4"));
    pen.fillRect(cx - 8, cy + 4, 16, 6, hex("#e7dcc8"));
    return;
  }
  if (name === "Red Rocks Amphitheatre") {
    // Circuit of the Americas: an oval and a tower, not a red-rock bowl.
    const [cx, cy] = project(x + 1, y + 1);
    pen.disc(cx, cy, 28, hex("#3a3a3a"));
    pen.disc(cx, cy, 18, hex("#2f7a32"));
    pen.disc(cx, cy - 2, 8, hex("#c8c0b0"));
    for (let i = 0; i < 20; i += 1) pen.put(cx + 22, cy - i, CREAM);
    pen.fillRect(cx + 18, cy - 22, 9, 4, ORANGE);
    return;
  }
  if (name === "Big Blue Bear") {
    // Giga Texas. The bear's block is already on the southeast edge, so
    // the factory sits on the east side of the map without moving a lot.
    // It is long and low on purpose. The next full-marathon slot is the tower.
    const metal = mul(hex("#e4e6ea"), ambient);
    pen.box(x + 0.05, y + 0.15, x + 1.95, y + 1.85, 0, 14, metal);
    pen.windows(x + 0.05, y + 0.15, x + 1.95, y + 1.85, 14, (side, t, n, k) => {
      if (k < 2 || k > 10 || t % 8 !== 3) return null;
      return hex("#2a241c");
    });
    for (let i = 0; i < 4; i += 1) {
      const u0 = x + 0.15 + i * 0.45;
      pen.gable(u0, y + 0.2, u0 + 0.4, y + 1.7, 14, 6, hex("#c5c8ce"));
    }
    pen.box(x + 0.05, y + 0.15, x + 1.95, y + 1.85, 12, 3, ORANGE);
    return;
  }
  if (name === "Confluence Park bridge") {
    // Sixth Street. Narrow fronts and a neon pixel, not a footbridge.
    const paints = ["#c4503a", "#1f4e79", "#bf5700", "#3f6b3a"];
    for (let i = 0; i < 4; i += 1) {
      const wall = hex(paints[i]);
      pen.box(x + 0.08 + i * 0.48, y + 0.2, x + 0.5 + i * 0.48, y + 0.85, 0, 18, wall);
      pen.box(x + 0.1 + i * 0.48, y + 0.25, x + 0.46 + i * 0.48, y + 0.95, 14, 3, hex(i % 2 ? "#39e0c0" : "#ff4fa3"));
    }
    return;
  }
  if (name === "16th Street Mall") {
    for (let i = 0; i < 3; i += 1) {
      const wall = mul(hex(i % 2 ? "#f4efe4" : "#e7dcc8"), ambient);
      pen.box(x + 0.12 + i * 0.62, y + 0.18, x + 0.68 + i * 0.62, y + 0.9, 0, 16, wall);
      hipRoof(pen, x + 0.12 + i * 0.62, y + 0.18, x + 0.68 + i * 0.62, y + 0.9, 16, 6, TILE);
      pen.box(x + 0.14 + i * 0.62, y + 0.2, x + 0.66 + i * 0.62, y + 1.0, 8, 3, hex(["#bf5700", "#3f6b3a", "#1f4e79"][i]));
    }
    const [px, py] = project(x + 1.55, y + 0.35, 0);
    for (let i = 0; i < 22; i += 1) pen.put(px, py - i, hex("#5a4030"));
    pen.fillRect(px - 6, py - 26, 14, 6, ORANGE);
    oak(pen, project(x + 0.4, y + 1.5)[0], project(x + 0.4, y + 1.5)[1], false);
    return;
  }
  if (name === "Cherry Creek Trail") {
    pen.diamond(x, y, hex("#d4c48a"));
    pen.diamond(x + 1, y, hex("#c4b48a"));
    pen.diamond(x, y + 1, hex("#4e8a40"));
    pen.diamond(x + 1, y + 1, hex("#3f6b3a"));
    const [cx, cy] = project(x + 1, y + 0.85, 0);
    pen.fillPoly(
      [
        [cx - 28, cy + 4],
        [cx - 8, cy - 14],
        [cx + 30, cy - 2],
        [cx + 8, cy + 12],
      ],
      hex("#7fd3c4"),
    );
    pen.fillPoly(
      [
        [cx - 10, cy - 4],
        [cx + 8, cy - 8],
        [cx + 6, cy + 2],
      ],
      hex("#e8fff8"),
    );
    oak(pen, project(x + 0.3, y + 1.55)[0], project(x + 0.3, y + 1.55)[1], true);
    oak(pen, project(x + 1.7, y + 1.6)[0], project(x + 1.7, y + 1.6)[1], false);
    return;
  }
  if (name === "Denver Zoo") {
    // Mount Bonnell: a hill, a stair, and a limestone rail at the top.
    pen.diamond(x, y, hex("#6a9a45"));
    pen.diamond(x + 1, y, hex("#7eaa52"));
    pen.diamond(x, y + 1, hex("#4e8a40"));
    pen.diamond(x + 1, y + 1, hex("#3f6b3a"));
    const foot = project(x + 0.2, y + 1.7, 0);
    const left = project(x + 0.15, y + 0.4, 10);
    const peak = project(x + 1.1, y + 0.7, 28);
    const right = project(x + 1.85, y + 1.5, 4);
    pen.fillPoly([foot, left, peak, right], hex("#8fba5c"));
    pen.fillPoly([left, peak, project(x + 0.7, y + 0.35, 16)], hex("#6a9a45"));
    for (let i = 0; i < 6; i += 1) {
      const [sx, sy] = project(x + 0.45 + i * 0.12, y + 1.35 - i * 0.12, 4 + i * 3);
      pen.hline(sx, sx + 8, sy, LIMESTONE);
    }
    pen.box(x + 0.85, y + 0.45, x + 1.35, y + 0.9, 26, 4, LIMESTONE);
    oak(pen, project(x + 0.35, y + 0.4)[0], project(x + 0.35, y + 0.4)[1], true);
    return;
  }
  if (name === "Denver Botanic Gardens") {
    // Pennybacker Bridge. The white arch is the silhouette.
    pen.diamond(x, y, WATER_DEEP);
    pen.diamond(x + 1, y, WATER);
    pen.diamond(x, y + 1, hex("#3f6b3a"));
    pen.diamond(x + 1, y + 1, hex("#4e8a40"));
    const [ax, ay] = project(x + 0.15, y + 0.7, 8);
    const [bx] = project(x + 1.85, y + 0.7, 8);
    const span = bx - ax;
    for (let i = 0; i <= span; i += 1) {
      const t = i / Math.max(1, span);
      const py = ay - Math.round(Math.sin(t * Math.PI) * 22);
      pen.fillRect(ax + i, py - 2, 1, 3, CREAM);
    }
    pen.hline(ax, bx, ay, hex("#f7f1e4"));
    pen.hline(ax, bx, ay + 1, hex("#c8c0b0"));
    for (let post = ax + 4; post < bx; post += 10) pen.fillRect(post, ay - 5, 2, 5, CREAM);
    oak(pen, project(x + 0.3, y + 1.55)[0], project(x + 0.3, y + 1.55)[1], false);
    return;
  }
  if (name === "Denver Athletic Club") {
    // Frost Bank Tower. A glass shaft and a crystalline crown. The crown
    // is three peaks, which is the outline, not a logo.
    const glass = mul(hex("#d5e4ea"), ambient);
    pen.box(x + 0.55, y + 0.45, x + 1.4, y + 1.35, 0, 40, glass);
    pen.windows(x + 0.55, y + 0.45, x + 1.4, y + 1.35, 40, (side, t, n, k) => {
      if (t % 3 === 0 || k % STORY === 0) return null;
      return side === "L" ? hex("#f4fbff") : hex("#7eb6d0");
    });
    const [cx, cy] = project(x + 1, y + 0.9, 40);
    pen.fillPoly(
      [
        [cx - 14, cy + 2],
        [cx - 4, cy - 16],
        [cx, cy + 2],
      ],
      hex("#f4fbff"),
    );
    pen.fillPoly(
      [
        [cx - 2, cy + 2],
        [cx + 2, cy - 22],
        [cx + 8, cy + 2],
      ],
      hex("#d5e4ea"),
    );
    pen.fillPoly(
      [
        [cx + 6, cy + 2],
        [cx + 14, cy - 12],
        [cx + 16, cy + 2],
      ],
      hex("#9ec4d4"),
    );
    return;
  }
  pen.box(x + 0.2, y + 0.2, x + 1.6, y + 1.6, 0, 14, mul(LIMESTONE, ambient));
  hipRoof(pen, x + 0.2, y + 0.2, x + 1.6, y + 1.6, 14, 6, TILE);
}

export const austinTheme = {
  id: "Austin",
  labels: AUSTIN_LABELS,
  ground: GROUND,
  mountains: MOUNTAINS,
  // Lady Bird Lake is a ribbon along the south edge of the diamond, two
  // lots wide (48 picture pixels). The civic block is inland, so the
  // Congress Avenue Bridge draws its own water on its lot instead of
  // sitting on this ribbon.
  lake: { color: "#2f8f86", shine: "#b7e4dc", band: 48 },
  // Three stops, not one tint. Top is a warm light blue, the middle is
  // peach, the horizon is gold. One peach mixed into every stop turned
  // the whole sky gray. Night stops stay dark so the stars still read.
  sky: {
    day: ["#8ec8ee", "#f3c49a", "#ffd59a"],
    night: ["#1a1634", "#3a2848", "#6a4030"],
    cloud: "#fff3dc",
  },
  grass: ["#5f8f45", "#4e7a38", "#7aa352"],
  road: { day: "#5a463c", night: "#2c221c" },
  sidewalk: { day: "#f0e6d4", night: "#6e6254" },
  curb: { day: "#8c4a32", night: "#4a2c22" },
  lane: { day: "#f3e6c8", night: "#e7c9a0" },
  crosswalk: "#f7f1e4",
  skirt: ["#cbb892", "#8c4a32"],
  drawBuilding,
  drawLandmark,
  drawPark,
  drawQuest,
};
