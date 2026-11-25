// Tokyo's colors and silhouettes.
//
// The mile rules are still the ones in rules.js. This file only changes
// what a slot looks like, and what we call it. A 100-mile landmark is
// still the unionStation slot. Here that slot is Tokyo Station's
// Marunouchi Building, not Union Station. The save stores the slot key.
// The labels map below is the Tokyo name for that key, so a later
// caption or tap popup can read the real name without a second table.
//
// The palette is a baseball uniform seen from across the field: deep
// navy, white pinstripes, one plain red sun, and gold trim. Nothing in
// this file draws a team mark, a "J", or a rising-sun ray flag. The red
// disc in the sky is a circle with no rays. The state-building banner
// is a navy cloth with one gold bar, not a disc on a white field.
//
// What should still be obvious when the whole city fits on a phone:
//   machiya have a dark tile roof and a wooden frame, shotengai shops
//   have a noren band under apartments, the palace is a stone bridge
//   and a gate (not a gold dome), Tokyo Tower is a red-and-white lattice,
//   the Skytree is a silver needle with a pod, the Kaminarimon is a
//   lantern under a heavy roof, and one snow cone (Fuji) sits on the
//   horizon. There is no water under the city.

import { labelsFor } from "../../../lib/landmarkNames.js";
import { hex, mix, mul, pick, rng } from "../pixelPen";
import { STORY, project } from "../sceneLayout";

const WIN = hex("#2a3444");
const LIT = hex("#ffe0a0");
const GLASS = hex("#d5e6f2");
const GLASS_R = hex("#7ea0b8");
const PLASTER = hex("#f3efe6");
const WOOD = hex("#6b3a2a");
const WOOD_DARK = hex("#4a2a1e");
const TILE = hex("#3e4650");
const TILE_DARK = hex("#2a3138");
const RED = hex("#d93a33");
const GOLD = hex("#c9b062");
const NAVY = hex("#1c2430");
const CONCRETE = hex("#c8c4b8");
const PINE = hex("#2f5a3a");
const PINE_LIT = hex("#3e7a4a");
const LAWN = hex("#4e8a48");
const LAWN_LIT = hex("#67a35a");

const GROUND = {
  far: "#6d7a62",
  mid: "#8a8474",
  // Stone dust under the lots. It is warm gray on purpose. A blue near
  // color reads as a bay, and a bay under this city tore the same way
  // Austin's lake ribbon did: the ground zooms and the pinned backdrop
  // does not.
  near: "#b7b1a4",
  farUntil: 20,
  midUntil: 72,
};

const MOUNTAINS = {
  // Unused by the cone painter. Kept so a caller that only reads colors
  // still finds a mountain object. drawHorizon paints Fuji instead of
  // the seven-peak ridge these numbers would have made.
  rock: "#8ea0b8",
  rockShade: "#6d7e96",
  snow: "#ffffff",
  snowShade: "#d5dce6",
  foothill: "#6d7a62",
  foothillShade: "#4e5a48",
  snowline: 400,
  main: { seed: 3, hmin: 8, hmax: 24 },
  foothills: { seed: 9, hmin: 4, hmax: 12 },
};

// Names a person would say, keyed by the slot the simulator already uses.
// Drawing code matches the slot (or the Denver quest name). The landmark
// names come from landmarkNames.js, which is also what the tap card
// reads, so the two cannot drift. Parks and side quests do not open a
// card. They stay in this map only.
export const TOKYO_LABELS = {
  ...labelsFor("Tokyo"),
  "Cherry Creek Trail": "Shibuya Crossing",
  "Denver Zoo": "Rainbow Bridge",
  "Denver Botanic Gardens": "Komazawa Olympic Park",
  "Big Blue Bear": "Tokyo Metropolitan Government Building",
  "Denver Athletic Club": "Mori Tower",
  "Cheesman Park": "Ueno Park",
  "Washington Park": "Yoyogi Park",
  "City Park": "Shinjuku Gyoen",
  "Coors Field": "Tokyo Dome",
  "Ball Arena": "Jingu Stadium",
  "Empower Field at Mile High": "Japan National Stadium",
  "Confluence Park bridge": "Takeshita Street",
  "16th Street Mall": "Ginza",
  "Red Rocks Amphitheatre": "Ameyoko",
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

function pine(pen, x, y, big) {
  pen.tree(x, y, big, big ? PINE_LIT : PINE);
}

// A dark tile roof. The second, lower cap is the other slope, the same
// trick the Austin hip uses, in charcoal instead of terracotta.
function tileRoof(pen, u0, v0, u1, v1, z, rh) {
  pen.gable(u0, v0, u1, v1, z, rh, TILE);
  const [cx, cy] = project((u0 + u1) / 2, (v0 + v1) / 2, z + rh);
  pen.fillRect(cx - 4, cy - 1, 9, 2, TILE_DARK);
}

// One snow cone, right of center. The shared ridge painter draws seven
// peaks, which is Denver's range and, with the snow turned off, Austin's
// hills. Fuji is one mountain. The disc is a plain circle: no rays, so
// it is not a rising-sun flag. It is skipped once the stars are up,
// because a red disc on a night sky reads as a second moon.
export function drawFuji(pen, horizonY, light) {
  const { width } = pen;
  const apexX = Math.round(width * 0.72);
  const apexY = horizonY - 108;
  const halfBase = 92;
  const snow = mul(hex("#ffffff"), light.snow || [1, 1, 1]);
  const slope = mul(hex("#8ea0b8"), light.mountain || [1, 1, 1]);
  const shade = mul(hex("#6d7e96"), light.mountain || [1, 1, 1]);
  const base = horizonY + 8;
  const snowBand = 30;
  for (let y = apexY; y <= base; y += 1) {
    const t = (y - apexY) / Math.max(1, base - apexY);
    const half = Math.max(1, Math.round(halfBase * t));
    for (let x = apexX - half; x <= apexX + half; x += 1) {
      const cap = y < apexY + snowBand && Math.abs(x - apexX) < half * 0.72;
      const onLeft = x < apexX;
      pen.put(x, y, cap ? snow : onLeft ? slope : shade);
    }
  }
  if ((light.stars || 0) < 0.35) {
    pen.disc(168, 78, 11, RED);
  }
}

function drawMachiya(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 97 || 1);
  const h = builtHeight(b, 1);
  const plaster = mul(hex(pick(rand, ["#f3efe6", "#e7e0d2", "#f7f1e4"])), ambient);
  const wood = mul(hex(pick(rand, ["#6b3a2a", "#5c3224", "#7a4632"])), ambient);
  const u0 = b.x + 0.12;
  const v0 = b.y + 0.16;
  const u1 = b.x + 0.88;
  const v1 = b.y + 0.8;
  pen.box(u0, v0, u1, v1, 0, h, plaster);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (k >= h - 1) return null;
    // Posts every few columns. The plaster shows between them. That
    // frame is the machiya, the way a porch is the bungalow.
    if (t % 6 === 0 || t === n - 1) return side === "R" ? mix(wood, 0.8) : wood;
    if (t <= 0 || k >= h - 2) return mix(plaster, 1.05);
    if (k < 8 && t > n * 0.38 && t < n * 0.62) return WOOD_DARK;
    return punchedWindow(side, t, k, night, b.variant, WIN, mix(WIN, 0.8), mix(plaster, 1.15), 0.3);
  });
  tileRoof(pen, u0 - 0.04, v0 - 0.02, u1 + 0.04, v1 + 0.02, h, 8);
  // A noren is two color panels, not a word. It hangs in front of the
  // door so it still reads after the picture is shrunk onto a phone.
  const cloth = hex(pick(rand, ["#1c2430", "#d93a33", "#2f5a3a"]));
  pen.box(b.x + 0.36, b.y + 0.7, b.x + 0.64, b.y + 0.92, 6, 5, cloth);
  if (rand() < 0.7) {
    const [tx, ty] = project(b.x + 0.14, b.y + 0.22);
    pine(pen, tx, ty, false);
  }
}

function drawShotengai(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 17 || 1);
  const h = builtHeight(b, 2);
  const wall = mul(hex(pick(rand, ["#d9d3c4", "#c8c4b8", "#e4ddd0"])), ambient);
  const noren = hex(pick(rand, ["#d93a33", "#1c2430", "#c9b062", "#2f5a3a"]));
  const u0 = b.x + 0.08;
  const v0 = b.y + 0.12;
  const u1 = b.x + 0.92;
  const v1 = b.y + 0.88;
  const shopTop = STORY + 4;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 1) return null;
    if (k <= shopTop) {
      if (k >= shopTop - 2) return noren;
      if (t % 5 === 0) return mix(GLASS, 0.7);
      return side === "L" ? GLASS : GLASS_R;
    }
    // A balcony slab between the shop and the apartments. The line is
    // what separates a shotengai from a plain office.
    if (k % (STORY * 2) === 0) return mix(CONCRETE, side === "L" ? 0.85 : 0.65);
    return punchedWindow(side, t, k, night, b.variant, WIN, mix(WIN, 0.82), mix(wall, 1.12), 0.35);
  });
  pen.box(u0 - 0.02, v0 + 0.02, u1 + 0.02, v1 + 0.14, shopTop - 2, 3, noren);
  tileRoof(pen, u0, v0, u1, v1, h, 6);
}

function drawOffice(pen, b, ambient, night) {
  const rand = rng(b.variant || b.id * 13 || 1);
  const h = builtHeight(b, 1);
  const wall = mul(hex(pick(rand, ["#c8c4b8", "#d4cfc2", "#b7b3a8"])), ambient);
  const u0 = b.x + 0.12;
  const v0 = b.y + 0.12;
  const u1 = b.x + 0.88;
  const v1 = b.y + 0.88;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 1 || k < 1) return null;
    if (k % (STORY * 2) === 0) return mix(wall, side === "L" ? 0.78 : 0.58);
    const row = k % STORY;
    if (row === 0) return mix(wall, side === "L" ? 0.9 : 0.7);
    if (t % 3 === 0) return null;
    if (lamp(t, k, b.variant, 0.22, night)) return LIT;
    return side === "L" ? WIN : mix(WIN, 0.8);
  });
  pen.box(u0, v0, u1, v1, h, 3, mix(wall, 0.8));
}

function towerWindows(pen, u0, v0, u1, v1, h, base, night, variant) {
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k < 1 || k >= h - 1) return null;
    if (k % STORY === 0) return mix(base, side === "L" ? 0.86 : 0.62);
    if (t % 3 === 0) return mix(base, 0.9);
    if (lamp(t, k, variant, 0.22, night)) return LIT;
    return side === "L" ? GLASS : GLASS_R;
  });
}

// Three downtown silhouettes, picked from the building's variant so a
// block is not three copies of one tower. None of them carries a word.
function drawTower(pen, b, ambient, night) {
  const kind = Math.abs(b.variant | 0) % 3;
  if (kind === 0) drawGlassCrown(pen, b, ambient, night);
  else if (kind === 1) drawSetbacks(pen, b, ambient, night);
  else drawSpire(pen, b, ambient, night);
}

function drawGlassCrown(pen, b, ambient, night) {
  const h = builtHeight(b, 1);
  const glass = mul(hex("#d5e6f2"), ambient);
  const u0 = b.x + 0.22;
  const v0 = b.y + 0.18;
  const u1 = b.x + 0.78;
  const v1 = b.y + 0.78;
  pen.box(u0, v0, u1, v1, 0, h, glass);
  towerWindows(pen, u0, v0, u1, v1, h, glass, night, b.variant);
  // A red band at the crown. It is a stripe of color, not a mark.
  pen.box(u0 - 0.02, v0 + 0.02, u1 + 0.02, v1 - 0.02, h - 8, 5, RED);
  pen.box(b.x + 0.36, b.y + 0.32, b.x + 0.64, b.y + 0.62, h, 8, mix(glass, 1.05));
}

function drawSetbacks(pen, b, ambient, night) {
  const h = builtHeight(b, 1);
  const stone = mul(hex("#d9d4c8"), ambient);
  const steps = [
    [0.1, 0.12, 0.9, 0.9],
    [0.18, 0.2, 0.82, 0.8],
    [0.28, 0.28, 0.72, 0.7],
  ];
  const stepH = Math.max(STORY * 3, Math.floor(h / steps.length));
  let z = 0;
  for (let i = 0; i < steps.length && z < h; i += 1) {
    const [du, dv, eu, ev] = steps[i];
    const hh = Math.min(stepH, h - z);
    pen.box(b.x + du, b.y + dv, b.x + eu, b.y + ev, z, hh, i % 2 ? mix(stone, 1.04) : stone);
    towerWindows(pen, b.x + du, b.y + dv, b.x + eu, b.y + ev, hh, stone, night, b.variant + i);
    z += hh;
  }
}

function drawSpire(pen, b, ambient, night) {
  const h = builtHeight(b, 1);
  const shaft = mul(hex("#c5d0da"), ambient);
  const u0 = b.x + 0.32;
  const v0 = b.y + 0.28;
  const u1 = b.x + 0.68;
  const v1 = b.y + 0.68;
  pen.box(u0, v0, u1, v1, 0, h, shaft);
  towerWindows(pen, u0, v0, u1, v1, h, shaft, night, b.variant);
  pen.box(b.x + 0.4, b.y + 0.36, b.x + 0.6, b.y + 0.58, h, 10, mix(shaft, 1.08));
  const [tx, ty] = project(b.x + 0.5, b.y + 0.48, h + 10);
  pen.fillRect(tx - 1, ty - 14, 2, 14, hex("#e8eef2"));
  pen.put(tx, ty - 16, RED);
}

function drawState(pen, b, ambient, night) {
  const h = builtHeight(b, 1);
  const wall = mul(CONCRETE, ambient);
  const u0 = b.x + 0.1;
  const v0 = b.y + 0.12;
  const u1 = b.x + 0.9;
  const v1 = b.y + 0.9;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n - 1 || k >= h - 2) return null;
    if (t % 5 === 1) return mix(wall, 1.1);
    return punchedWindow(side, t, k, night, b.variant, WIN, mix(WIN, 0.85), mix(wall, 0.8), 0.16);
  });
  pen.box(u0, v0, u1, v1, h, 3, mix(wall, 0.82));
  const [cx, cy] = project(b.x + 0.62, b.y + 0.3, h + 3);
  for (let i = 0; i < 12; i += 1) pen.put(cx, cy - i, hex("#e8e4d8"));
  // Navy cloth, one gold bar. A red disc on white would be a flag this
  // theme is not allowed to draw, and rays would be the other flag.
  for (let i = 0; i < 8; i += 1) {
    pen.put(cx + 1 + i, cy - 12, NAVY);
    pen.put(cx + 1 + i, cy - 11, i > 1 && i < 6 ? GOLD : NAVY);
    pen.put(cx + 1 + i, cy - 10, NAVY);
  }
}

function drawMuseum(pen, b, ambient) {
  const h = builtHeight(b, 2);
  const wall = mul(CONCRETE, ambient);
  const u0 = b.x + 0.1;
  const v0 = b.y + 0.16;
  const u1 = b.x + 0.9;
  const v1 = b.y + 0.88;
  pen.box(u0, v0, u1, v1, 0, h, wall);
  pen.windows(u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 1 || t >= n - 1) return null;
    if (k > 4 && k < h - 4 && t % 4 !== 0) return side === "L" ? GLASS : GLASS_R;
    return null;
  });
  tileRoof(pen, u0, v0, u1, v1, h, 7);
}

// The capitol slot. It is a building, so a quarter turn mirrors it with
// the houses. The bridge and the gate are symmetric, so the flip still
// reads as Nijubashi. It is not a dome, and it is not gold.
function drawNijubashi(pen, b, ambient) {
  const x = b.x;
  const y = b.y;
  const stone = mul(hex("#d9d4c8"), ambient);
  const wall = mul(hex("#f3efe6"), ambient);
  pen.box(x + 0.08, y + 0.18, x + 0.92, y + 0.62, 0, 16, wall);
  pen.windows(x + 0.08, y + 0.18, x + 0.92, y + 0.62, 16, (side, t, n, k) => {
    if (t % 7 === 3 && k > 4 && k < 12) return side === "L" ? WIN : mix(WIN, 0.8);
    return null;
  });
  tileRoof(pen, x + 0.06, y + 0.16, x + 0.94, y + 0.64, 16, 8);
  // Two stone decks. The lower one is longer. The arch is a gap of lawn
  // color left unpainted in the middle of each deck's front, drawn as a
  // dark notch so the bridge is not a solid slab.
  pen.box(x + 0.12, y + 0.58, x + 0.88, y + 0.95, 0, 5, stone);
  pen.box(x + 0.22, y + 0.5, x + 0.78, y + 0.86, 6, 4, mix(stone, 1.08));
  const [ax, ay] = project(x + 0.5, y + 0.78, 2);
  pen.fillRect(ax - 6, ay, 12, 4, hex("#5c5348"));
  const [bx, by] = project(x + 0.5, y + 0.68, 8);
  pen.fillRect(bx - 4, by, 8, 3, hex("#5c5348"));
  // The gatehouse sits behind the bridge: two posts and a dark roof.
  // The box shader knocks red down to brown on the side faces, so the
  // posts are painted back in the plain red. That is what you can still
  // see once the city is fit onto a phone.
  pen.box(x + 0.3, y + 0.28, x + 0.7, y + 0.55, 10, 14, wall);
  pen.box(x + 0.32, y + 0.3, x + 0.48, y + 0.5, 12, 16, RED);
  pen.box(x + 0.52, y + 0.3, x + 0.68, y + 0.5, 12, 16, RED);
  pen.windows(x + 0.32, y + 0.3, x + 0.48, y + 0.5, 16, () => RED);
  pen.windows(x + 0.52, y + 0.3, x + 0.68, y + 0.5, 16, () => RED);
  tileRoof(pen, x + 0.26, y + 0.24, x + 0.74, y + 0.58, 28, 7);
}

function drawBuilding(pen, b, ambient, night) {
  if (b.type === "capitol") {
    drawNijubashi(pen, b, ambient);
    return;
  }
  if (b.type === "rowhouse") {
    drawMachiya(pen, b, ambient, night);
    return;
  }
  if (b.type === "mixeduse") {
    drawShotengai(pen, b, ambient, night);
    return;
  }
  if (b.type === "office") {
    drawOffice(pen, b, ambient, night);
    return;
  }
  if (b.type === "skyscraper") {
    drawTower(pen, b, ambient, night);
    return;
  }
  if (b.type === "state") {
    drawState(pen, b, ambient, night);
    return;
  }
  if (b.type === "museum") {
    drawMuseum(pen, b, ambient);
    return;
  }
  drawOffice(pen, b, ambient, night);
}

function drawStation(pen, l, ambient) {
  const x = l.x;
  const y = l.y;
  const brick = mul(hex("#c4503c"), ambient);
  const brickLit = mul(hex("#d86a52"), ambient);
  const u0 = x + 0.06;
  const v0 = y + 0.22;
  const u1 = x + 0.94;
  const v1 = y + 0.86;
  pen.box(u0, v0, u1, v1, 0, 18, brick);
  pen.windows(u0, v0, u1, v1, 18, (side, t, n, k) => {
    if (t <= 1 || t >= n - 1 || k < 2 || k > 15) return null;
    if (t % 4 === 0) return mix(brick, 0.75);
    if (k % 5 === 0) return mix(brickLit, 0.9);
    return side === "L" ? hex("#f3efe6") : hex("#d9cfc0");
  });
  // The round hall. Brick, not a gold capitol dome. The clock is a
  // light disc with two ticks. Landmarks are not mirrored, so the
  // ticks stay on the face they were drawn on.
  const [cx, cy] = project(x + 0.5, y + 0.5, 18);
  pen.dome(cx, cy + 2, 12, brickLit);
  pen.dome(cx, cy - 8, 4, TILE);
  pen.disc(cx, cy + 4, 4, PLASTER);
  pen.put(cx, cy + 2, NAVY);
  pen.put(cx + 2, cy + 4, NAVY);
  pen.box(x + 0.38, y + 0.7, x + 0.62, y + 0.9, 0, 8, mix(brick, 0.7));
}

function drawTokyoTower(pen, l, night) {
  const x = l.x;
  const y = l.y;
  // A tapering lattice. Red and white bands are the silhouette. The
  // right face of a thin box would paint the whole shaft brown, so the
  // bands are drawn back over the faces, the same way the UT Tower
  // paints its cream back on.
  const u0 = x + 0.28;
  const v0 = y + 0.3;
  const u1 = x + 0.72;
  const v1 = y + 0.78;
  pen.box(x + 0.18, y + 0.22, x + 0.82, y + 0.9, 0, 8, hex("#f4f1ea"));
  pen.box(u0, v0, u1, v1, 8, 56, RED);
  pen.windows(u0, v0, u1, v1, 56, (side, t, n, k) => {
    const band = Math.floor(k / 8) % 2 === 0 ? RED : hex("#f7f4ee");
    if (t <= 1 || t >= n - 2) return band;
    if (t % 4 === 2 && k % 4 !== 0) return side === "L" ? mix(band, 0.75) : mix(band, 0.55);
    return band;
  });
  const [tx, ty] = project(x + 0.5, y + 0.52, 64);
  pen.fillRect(tx - 1, ty - 16, 2, 16, night ? hex("#ffe0a0") : hex("#f7f4ee"));
  pen.put(tx, ty - 18, RED);
}

function drawTorii(pen, l) {
  const x = l.x;
  const y = l.y;
  // Two posts and a double crossbar. The black cap is the kasagi. A
  // metal shard here would be the Denver museum.
  const [lx, ly] = project(x + 0.28, y + 0.62, 0);
  const [rx, ry] = project(x + 0.72, y + 0.7, 0);
  for (let i = 0; i < 28; i += 1) {
    pen.fillRect(lx - 2, ly - i, 5, 1, RED);
    pen.fillRect(rx - 2, ry - i, 5, 1, RED);
  }
  const top = Math.min(ly, ry) - 28;
  pen.fillRect(Math.min(lx, rx) - 8, top, Math.abs(rx - lx) + 16, 4, RED);
  pen.fillRect(Math.min(lx, rx) - 10, top - 3, Math.abs(rx - lx) + 20, 3, hex("#1c2430"));
  pen.fillRect(Math.min(lx, rx) - 4, top + 7, Math.abs(rx - lx) + 8, 3, RED);
  pen.box(x + 0.2, y + 0.4, x + 0.8, y + 0.85, 0, 3, hex("#c8c0b0"));
}

function drawKaminarimon(pen, l, ambient) {
  const x = l.x;
  const y = l.y;
  // The posts take the clock tint. The lantern stays the plain red so it
  // is still the gate after the picture is fit onto a phone.
  const post = mul(RED, ambient);
  pen.box(x + 0.12, y + 0.28, x + 0.88, y + 0.84, 0, 8, post);
  pen.windows(x + 0.12, y + 0.28, x + 0.88, y + 0.84, 8, (side, t, n, k) => {
    if (t < 3 || t > n - 4) return post;
    return null;
  });
  tileRoof(pen, x + 0.04, y + 0.16, x + 0.96, y + 0.88, 8, 10);
  // The lantern is the silhouette: a red disc with gold caps. No
  // characters. A second gate uses this same drawing, the way every
  // cathedral uses the one steeple.
  const [cx, cy] = project(x + 0.5, y + 0.58, 6);
  pen.disc(cx, cy, 8, RED);
  pen.fillRect(cx - 6, cy - 9, 12, 2, GOLD);
  pen.fillRect(cx - 6, cy + 8, 12, 2, GOLD);
  pen.fillRect(cx - 1, cy - 4, 2, 8, hex("#f7f4ee"));
}

// A silver needle with a pod. It is not the red lattice. The pod is
// wider than the shaft so the two towers stay apart at phone size.
function drawSkytree(pen, l) {
  const x = l.x;
  const y = l.y;
  const silver = hex("#e8eef2");
  const shade = hex("#b7c4d0");
  const u0 = x + 0.4;
  const v0 = y + 0.4;
  const u1 = x + 0.6;
  const v1 = y + 0.64;
  pen.box(x + 0.22, y + 0.28, x + 0.48, y + 0.7, 0, 10, shade);
  pen.box(x + 0.52, y + 0.32, x + 0.78, y + 0.74, 0, 10, silver);
  pen.box(u0, v0, u1, v1, 8, 62, silver);
  pen.windows(u0, v0, u1, v1, 62, (side, t, n, k) => {
    if (k > 34 && k < 48) return side === "L" ? hex("#d5e6f2") : GLASS_R;
    if (t % 3 === 1 && k % 8 > 2) return side === "R" ? shade : silver;
    return side === "R" ? shade : silver;
  });
  pen.box(x + 0.3, y + 0.32, x + 0.7, y + 0.7, 40, 8, hex("#f7f4ee"));
  const [tx, ty] = project(x + 0.5, y + 0.52, 70);
  pen.fillRect(tx - 1, ty - 22, 2, 22, silver);
  pen.put(tx, ty - 24, RED);
}

function drawLandmark(pen, l, ambient, night) {
  if (l.key === "unionStation") drawStation(pen, l, ambient);
  else if (l.key === "courthouse") drawTokyoTower(pen, l, night);
  else if (l.key === "artMuseum") drawTorii(pen, l);
  else if (l.key === "tokyoSkytree") drawSkytree(pen, l);
  else if (l.key === "cathedral") drawKaminarimon(pen, l, ambient);
}

function drawPark(pen, p) {
  const x = p.x;
  const y = p.y;
  // Yoyogi is the darker lawn so the three parks are not one green.
  // None of them gets a pond. A pond is the water this city does not have.
  const lawn = p.name === "Washington Park" ? hex("#2f6b3c") : LAWN;
  pen.diamond(x, y, lawn);
  pen.insetDiamond(x, y, 0.08, p.name === "Washington Park" ? hex("#3e7a4a") : LAWN_LIT);
  const [ax, ay] = project(x + 0.08, y + 0.55);
  const [bx, by] = project(x + 0.92, y + 0.62);
  const pathY = Math.round((ay + by) / 2);
  pen.hline(ax, bx, pathY, hex("#e7e0d2"));
  pen.hline(ax, bx, pathY + 1, hex("#b7b1a4"));
  if (p.name === "Cheesman Park") {
    // Ueno: a lawn and a small museum roof, not a lake.
    pen.box(x + 0.55, y + 0.22, x + 0.82, y + 0.48, 0, 8, PLASTER);
    tileRoof(pen, x + 0.52, y + 0.18, x + 0.86, y + 0.52, 8, 5);
  }
  if (p.name === "City Park") {
    // Shinjuku Gyoen: a glass house on the grass. The glass stays green-gray.
    // A blue pane matches the old lake test (blue ahead of red) and reads
    // as water, which this city does not have.
    pen.box(x + 0.22, y + 0.55, x + 0.55, y + 0.82, 0, 8, hex("#e7f2ea"));
    pen.gable(x + 0.22, y + 0.55, x + 0.55, y + 0.82, 8, 5, hex("#d5e6d8"));
  }
  const spots = [
    [0.18, 0.22, true],
    [0.8, 0.18, false],
    [0.16, 0.78, false],
    [0.82, 0.8, true],
  ];
  for (const [u, v, big] of spots) {
    const [tx, ty] = project(x + u, y + v);
    pine(pen, tx, ty, big);
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

function drawQuest(pen, q, ambient) {
  const x = q.x;
  const y = q.y;
  const name = q.name;
  if (name === "Coors Field") {
    // Tokyo Dome: a white dome on a low dark drum.
    const [cx, cy] = project(x + 1, y + 1);
    pen.fillPoly([project(x, y), project(x + 2, y), project(x + 2, y + 2), project(x, y + 2)], hex("#3a4048"));
    bowl(pen, cx, cy, 34, 14, 10, hex("#2a3138"), hex("#3a4048"));
    pen.dome(cx, cy - 6, 22, hex("#f7f4ee"));
    pen.dome(cx, cy - 10, 14, hex("#e8eef2"));
    return;
  }
  if (name === "Ball Arena") {
    // Jingu: an ivy wall and a dirt infield. The diamond is brown, not a mark.
    const [cx, cy] = project(x + 1, y + 1);
    bowl(pen, cx, cy, 36, 16, 14, hex("#2f5a3a"), hex("#3e7a4a"));
    pen.fillRect(cx - 10, cy - 2, 20, 8, hex("#c4a574"));
    pen.box(x + 0.35, y + 0.35, x + 1.3, y + 0.7, 8, 6, hex("#f3efe6"));
    tileRoof(pen, x + 0.3, y + 0.3, x + 1.35, y + 0.75, 14, 5);
    return;
  }
  if (name === "Empower Field at Mile High") {
    // Japan National Stadium: a wood-louver ring. The stripes are the
    // eaves, not a wordmark.
    const [cx, cy] = project(x + 1, y + 1);
    bowl(pen, cx, cy, 40, 16, 16, hex("#8a6244"), hex("#f3efe6"));
    for (let i = -18; i <= 18; i += 4) pen.hline(cx - 28, cx + 28, cy - 8 + (i % 5), hex("#6b3a2a"));
    return;
  }
  if (name === "Red Rocks Amphitheatre") {
    // Ameyoko: a row of market awnings. No amphitheatre, no water.
    const paints = ["#d93a33", "#1c2430", "#c9b062", "#2f5a3a", "#8e3a3a"];
    for (let i = 0; i < 5; i += 1) {
      pen.box(x + 0.08 + i * 0.38, y + 0.35, x + 0.4 + i * 0.38, y + 0.85, 0, 10, PLASTER);
      pen.box(x + 0.08 + i * 0.38, y + 0.3, x + 0.42 + i * 0.38, y + 0.9, 8, 3, hex(paints[i]));
    }
    return;
  }
  if (name === "Big Blue Bear") {
    // The Tocho: two slabs and a bar across the top. The bear's block
    // is already on the southeast edge, so the pair sits there without
    // moving a lot.
    const glass = mul(hex("#d5e6f2"), ambient);
    pen.box(x + 0.15, y + 0.25, x + 0.7, y + 0.85, 0, 48, glass);
    pen.box(x + 1.15, y + 0.35, x + 1.7, y + 0.95, 0, 48, mix(glass, 0.92));
    towerWindows(pen, x + 0.15, y + 0.25, x + 0.7, y + 0.85, 48, glass, false, 1);
    towerWindows(pen, x + 1.15, y + 0.35, x + 1.7, y + 0.95, 48, glass, false, 2);
    pen.box(x + 0.2, y + 0.4, x + 1.65, y + 0.7, 40, 6, NAVY);
    pen.box(x + 0.35, y + 0.45, x + 0.55, y + 0.65, 46, 10, mix(glass, 1.05));
    return;
  }
  if (name === "Confluence Park bridge") {
    // Takeshita Street: narrow fronts and bright bands, not a footbridge.
    const paints = ["#d93a33", "#c9b062", "#1c2430", "#2f5a3a"];
    for (let i = 0; i < 4; i += 1) {
      const wall = hex(paints[i]);
      pen.box(x + 0.08 + i * 0.48, y + 0.2, x + 0.5 + i * 0.48, y + 0.85, 0, 16, wall);
      pen.box(x + 0.1 + i * 0.48, y + 0.25, x + 0.46 + i * 0.48, y + 0.95, 12, 3, hex(i % 2 ? "#f7f4ee" : "#e23b32"));
    }
    return;
  }
  if (name === "16th Street Mall") {
    // Ginza: pale stone blocks and a wide walk. No mall canopy letters.
    for (let i = 0; i < 3; i += 1) {
      const wall = mul(hex(i % 2 ? "#f3efe6" : "#d9d4c8"), ambient);
      pen.box(x + 0.1 + i * 0.62, y + 0.16, x + 0.66 + i * 0.62, y + 0.9, 0, 22, wall);
      pen.windows(x + 0.1 + i * 0.62, y + 0.16, x + 0.66 + i * 0.62, y + 0.9, 22, (side, t, n, k) => {
        if (t % 3 !== 1 || k % STORY === 0) return null;
        return side === "L" ? GLASS : GLASS_R;
      });
    }
    const [px, py] = project(x + 0.2, y + 1.4, 0);
    pen.hline(px, px + 70, py, hex("#e7e0d2"));
    return;
  }
  if (name === "Cherry Creek Trail") {
    // Shibuya Crossing: the scramble is the white bars. The four lots
    // are pavement and shop color, not a creek.
    const lots = [
      [0, 0, "#3a4048"],
      [1, 0, "#2a3138"],
      [0, 1, "#3a4048"],
      [1, 1, "#2a3138"],
    ];
    for (const [du, dv, color] of lots) pen.diamond(x + du, y + dv, hex(color));
    const [ax, ay] = project(x + 0.15, y + 1.7);
    const [bx, by] = project(x + 1.85, y + 0.3);
    for (let i = 0; i < 6; i += 1) {
      pen.hline(ax, bx, ay - 8 + i * 3, i % 2 ? hex("#f7f4ee") : hex("#3a4048"));
    }
    pen.box(x + 0.15, y + 0.15, x + 0.55, y + 0.45, 0, 14, RED);
    pen.box(x + 1.4, y + 1.4, x + 1.85, y + 1.85, 0, 12, NAVY);
    return;
  }
  if (name === "Denver Zoo") {
    // Rainbow Bridge, on grass. The cables and the two white towers are
    // the silhouette. The water that would sit under a real bridge is
    // not drawn. A teal fill here is the lake coming back.
    pen.diamond(x, y, hex("#6d7a62"));
    pen.diamond(x + 1, y, hex("#8a8474"));
    pen.diamond(x, y + 1, hex("#4e8a48"));
    pen.diamond(x + 1, y + 1, hex("#3e7a4a"));
    const [ax, ay] = project(x + 0.25, y + 0.85, 4);
    const [bx, by] = project(x + 1.75, y + 0.85, 4);
    for (let i = 0; i < 22; i += 1) {
      pen.put(ax, ay - i, hex("#f7f4ee"));
      pen.put(bx, by - i, hex("#f7f4ee"));
    }
    pen.hline(ax, bx, ay, hex("#d9d4c8"));
    pen.hline(ax, bx, ay + 1, hex("#b7b1a4"));
    const span = Math.max(1, bx - ax);
    for (let i = 0; i <= span; i += 6) {
      const t = i / span;
      const py = ay - Math.round(Math.sin(t * Math.PI) * 16);
      pen.put(ax + i, py, hex("#f7f4ee"));
      pen.put(ax + i, py + 1, hex("#c8c4b8"));
    }
    return;
  }
  if (name === "Denver Botanic Gardens") {
    // Komazawa Olympic Park: a track and a lawn, plus the control tower.
    pen.diamond(x, y, hex("#4e8a48"));
    pen.diamond(x + 1, y, hex("#67a35a"));
    pen.diamond(x, y + 1, hex("#3e7a4a"));
    pen.diamond(x + 1, y + 1, hex("#2f6b3c"));
    const [cx, cy] = project(x + 1, y + 1);
    pen.disc(cx, cy, 26, hex("#c45a3a"));
    pen.disc(cx, cy, 16, hex("#4e8a48"));
    for (let i = 0; i < 18; i += 1) pen.put(cx + 20, cy - i, hex("#f3efe6"));
    pen.fillRect(cx + 16, cy - 20, 9, 3, RED);
    return;
  }
  if (name === "Denver Athletic Club") {
    // Mori Tower: a glass shaft that steps in, then a mast. The crown is
    // a setback, not the three crystal peaks Frost Bank uses.
    const glass = mul(hex("#d5e6f2"), ambient);
    pen.box(x + 0.35, y + 0.3, x + 1.55, y + 1.45, 0, 22, glass);
    pen.box(x + 0.55, y + 0.45, x + 1.35, y + 1.25, 22, 24, mix(glass, 1.04));
    towerWindows(pen, x + 0.55, y + 0.45, x + 1.35, y + 1.25, 24, glass, false, 4);
    pen.box(x + 0.75, y + 0.6, x + 1.15, y + 1.05, 46, 8, hex("#f7f4ee"));
    const [tx, ty] = project(x + 0.95, y + 0.82, 54);
    pen.fillRect(tx - 1, ty - 12, 2, 12, hex("#e8eef2"));
    pen.put(tx, ty - 14, RED);
    return;
  }
  pen.box(x + 0.2, y + 0.2, x + 1.6, y + 1.6, 0, 14, mul(CONCRETE, ambient));
  tileRoof(pen, x + 0.2, y + 0.2, x + 1.6, y + 1.6, 14, 6);
}

export const tokyoTheme = {
  id: "Tokyo",
  labels: TOKYO_LABELS,
  ground: GROUND,
  mountains: MOUNTAINS,
  // No lake field. The lip under the diamond is stone, not a bay.
  // drawHorizon replaces the ridge so the horizon is Fuji alone.
  sky: {
    day: ["#7eb0dc", "#c5d7ea", "#f3ece2"],
    night: ["#0e1520", "#1c2430", "#2a3444"],
    cloud: "#d5e0ea",
  },
  grass: ["#4e8a48", "#3e7a4a", "#67a35a"],
  road: { day: "#3a4048", night: "#1c2228" },
  sidewalk: { day: "#d9d3c6", night: "#6a655c" },
  curb: { day: "#8a8478", night: "#3a3834" },
  lane: { day: "#f4f1ea", night: "#c9b062" },
  crosswalk: "#f7f4ee",
  skirt: ["#c8c2b4", "#6e675c"],
  drawHorizon: drawFuji,
  drawBuilding,
  drawLandmark,
  drawPark,
  drawQuest,
};
