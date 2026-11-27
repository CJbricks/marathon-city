// Tokyo's distant skyline, painted into the backdrop.
//
// Fuji used to be one snow cone on this horizon. The cone is gone. What
// sits there now is a row of traditional buildings, far enough away that
// haze has washed the color out of them. They are scenery. They are not
// lots, and they are not landmarks you can tap.
//
// The painter uses picture pixels, not project() and not pen.box(). A
// lot moves when the view turns, and at 90° and 270° an ordinary
// building sprite is mirrored. This row must not do either. The backdrop
// is pinned: the same pixels stay behind the city at every quarter, and
// the pagoda cannot come out backwards. Landmarks in the city still go
// through rotation.js, which never mirrors them. This file is not on
// that path.
//
// The pigments are the theme's vermilion, gold, and navy, plus unpainted
// timber, stone, tile, and one concrete slab. Each one is mixed toward
// the sky before it is drawn. That mix is the haze. A wall in the city
// is the plain pigment. A wall here is mostly mist, so the row stays
// lighter than the buildings in front of it. Nothing here is a word, a
// team mark, or a ray around the red disc.

import { mix, mul } from "../pixelPen";

// Day mist is the theme's horizon cream. Night mist is its night horizon.
// The clock blends between them, the same way the sky itself does.
const MIST_DAY = [243, 236, 226];
const MIST_NIGHT = [42, 52, 68];

const RED = [0xd9, 0x3a, 0x33];
const GOLD = [0xc9, 0xb0, 0x62];
const NAVY = [0x1c, 0x24, 0x30];
const TILE = [90, 98, 112];
const TILE_DEEP = [58, 64, 74];
const RIDGE = [46, 52, 62];
const WOOD = [128, 90, 60];
const WOOD_DEEP = [78, 54, 38];
const TIMBER = [64, 46, 34];
const STONE = [176, 170, 156];
const STONE_DEEP = [138, 132, 118];
const CONCRETE = [178, 174, 166];
const GLASS = [198, 214, 224];
const STEEL = [108, 114, 122];
const PINK = [226, 136, 164];
const PINK_DEEP = [190, 92, 124];
const PINK_PALE = [242, 198, 212];
const TRUNK = [112, 84, 64];
const PAPER = [255, 244, 220];

const ROOF = {
  tile: TILE,
  tileDeep: TILE_DEEP,
  ridge: RIDGE,
  wood: WOOD,
  woodDeep: WOOD_DEEP,
};

// The row, left to right. Roof names are the four forms the silhouette
// has to include. The pagoda, the gate, and the temple are kinds of
// their own because a house function cannot stack five roofs or two
// pillars. `far` is a house pushed deeper into the mist.
export const SKYLINE_PLAN = [
  { id: "west-gable", kind: "house", x: 28, w: 64, h: 22, roof: "kirizuma", far: true },
  { id: "west-hip", kind: "house", x: 104, w: 74, h: 20, roof: "yosemune", far: true },
  { id: "west-shrine", kind: "house", x: 190, w: 40, h: 16, roof: "hogyo", far: true },
  { id: "old-house", kind: "house", x: 248, w: 58, h: 28, roof: "irimoya" },
  { id: "concrete", kind: "box", x: 314, w: 42, h: 46 },
  { id: "east-of-box", kind: "house", x: 364, w: 52, h: 18, roof: "yosemune" },
  { id: "gate", kind: "gate", x: 500 },
  { id: "mid-gable", kind: "house", x: 608, w: 62, h: 24, roof: "kirizuma" },
  { id: "temple", kind: "temple", x: 736, w: 188 },
  { id: "pagoda", kind: "pagoda", x: 1060 },
  { id: "east-hip", kind: "house", x: 1146, w: 58, h: 22, roof: "irimoya" },
];

// Blossoms sit on the ground line, in front of the walls. The gaps are
// uneven on purpose, so the row is not a fence.
const BLOSSOMS = [18, 86, 168, 236, 402, 492, 588, 700, 860, 978, 1036, 1124, 1210, 1264];

// amount is how much of the pixel is mist. 0 is the plain pigment, and
// that would compete with the city. Higher on the picture gets a little
// more, because that part of the row is farther away.
function haze(pigment, light, horizonY, y, amount) {
  const night = Math.min(1, Math.max(light.stars || 0, (light.windowLight || 0) * 0.4));
  const mist = MIST_DAY.map((v, i) => Math.round(v + (MIST_NIGHT[i] - v) * night));
  const up = Math.max(0, Math.min(1, (horizonY - y) / 170));
  const fog = Math.min(0.76, amount + up * 0.1);
  const faded = pigment.map((v, i) => Math.round(v + (mist[i] - v) * fog));
  // A light touch of the clock's mountain tint. Multiplying by the full
  // night value turned the old cone into a dark lump. This row should
  // stay pale enough to read as distance.
  const tint = (light.mountain || [1, 1, 1]).map((v) => 0.86 + 0.14 * v);
  return mul(faded, tint);
}

function block(pen, x, y, w, h, pigment, light, horizonY, amount) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const width = Math.round(w);
  const height = Math.round(h);
  for (let row = 0; row < height; row += 1) {
    const yy = y0 + row;
    pen.hline(x0, x0 + width - 1, yy, haze(pigment, light, horizonY, yy, amount));
  }
}

function shadeEdge(pen, x, y, h, pigment, light, horizonY, amount) {
  block(pen, x, y, 2, h, pigment, light, horizonY, amount);
}

// One roof, in picture pixels. The eave sags in the middle and turns up
// at the corners. That curve, plus the dark courses, is the kawara tile.
//
// kirizuma is a gable: timber fills the triangle, tile stays on the slopes.
// yosemune is a hip: a short ridge, tile on every face, no timber triangle.
// irimoya is a hip with a small gable cut into the upper slope.
// hogyo is a pyramid: the slopes meet at one point. Pagoda stories use it.
function paintRoof(pen, cx, eaveY, half, rise, kick, kind, light, horizonY, amount) {
  const peakY = Math.round(eaveY - rise);
  const ridgeHalf = kind === "yosemune" || kind === "irimoya" ? Math.max(4, Math.round(half * 0.34)) : 0;
  const flare = Math.max(3, Math.round(half * 0.1));
  for (let y = peakY; y <= eaveY - 2; y += 1) {
    const t = rise <= 1 ? 1 : (y - peakY) / rise;
    let span = Math.round(ridgeHalf + (half - ridgeHalf) * t);
    if (t > 0.7) span += Math.round(flare * ((t - 0.7) / 0.3));
    for (let dx = -span; dx <= span; dx += 1) {
      const course = Math.floor((eaveY - y) / 2) % 2 === 0 ? ROOF.tile : ROOF.tileDeep;
      const pigment = dx > span * 0.2 ? ROOF.tileDeep : course;
      pen.put(cx + dx, y, haze(pigment, light, horizonY, y, amount));
    }
    if (ridgeHalf > 0 && y < peakY + 2) {
      for (let dx = -ridgeHalf; dx <= ridgeHalf; dx += 1) {
        pen.put(cx + dx, y, haze(ROOF.ridge, light, horizonY, y, amount));
      }
    }
  }
  const lip = half + flare;
  for (let dx = -lip; dx <= lip; dx += 1) {
    const edge = lip - Math.abs(dx);
    const along = edge < kick + 2 ? (kick + 2 - edge) / (kick + 2) : 0;
    const lift = Math.round(kick * along * along);
    const yy = eaveY - lift;
    for (let k = 0; k < 3; k += 1) {
      const pigment = k === 2 ? ROOF.ridge : ROOF.tile;
      pen.put(cx + dx, yy - k, haze(pigment, light, horizonY, yy - k, amount));
    }
    if (((dx % 4) + 4) % 4 === 0) pen.put(cx + dx, yy, haze(ROOF.tileDeep, light, horizonY, yy, amount));
  }
  if (kind === "kirizuma") {
    // The timber triangle stays inside the tile. A gable that filled the
    // whole roof read as a wooden hat, and the kawara disappeared.
    const top = peakY + Math.max(3, Math.round(rise * 0.32));
    const bottom = eaveY - Math.max(5, Math.round(rise * 0.42));
    const maxSpan = Math.round(half * 0.5);
    if (bottom > top) {
      for (let y = top; y <= bottom; y += 1) {
        const t = (y - top) / Math.max(1, bottom - top);
        const span = Math.max(0, Math.round(maxSpan * t));
        for (let dx = -span; dx <= span; dx += 1) {
          const pigment = Math.abs(dx) >= span - 1 ? ROOF.woodDeep : ROOF.wood;
          pen.put(cx + dx, y, haze(pigment, light, horizonY, y, amount));
        }
      }
    }
  }
  if (kind === "irimoya") {
    const top = peakY + 3;
    const bottom = peakY + Math.round(rise * 0.58);
    const gableHalf = Math.round(half * 0.3);
    for (let y = top; y <= bottom; y += 1) {
      const t = (y - top) / Math.max(1, bottom - top);
      const span = Math.max(0, Math.round(gableHalf * t));
      for (let dx = -span; dx <= span; dx += 1) {
        const edge = Math.abs(dx) >= span - 1 || y >= bottom - 1;
        pen.put(cx + dx, y, haze(edge ? ROOF.woodDeep : ROOF.wood, light, horizonY, y, amount));
      }
    }
  }
}

function paintHouse(pen, piece, base, light, horizonY) {
  const amount = piece.far ? 0.6 : 0.48;
  const { x, w, h, roof } = piece;
  const stoneH = 4;
  const wallTop = base - stoneH - h;
  block(pen, x - 1, base - stoneH, w + 2, stoneH, STONE, light, horizonY, amount);
  block(pen, x, wallTop, w, h, WOOD, light, horizonY, amount);
  shadeEdge(pen, x + w - 2, wallTop, h, WOOD_DEEP, light, horizonY, amount);
  block(pen, x, wallTop, 2, h, WOOD_DEEP, light, horizonY, amount);
  // A distant shoji: one pale rectangle and a wood cross. The close
  // version, with a real lattice, is on the machiya in the city.
  const winW = Math.min(10, w - 10);
  const winH = Math.min(8, h - 6);
  if (winW >= 6 && winH >= 5) {
    const wx = x + Math.round((w - winW) / 2);
    const wy = wallTop + 3;
    block(pen, wx, wy, winW, winH, PAPER, light, horizonY, amount + 0.05);
    const midX = wx + Math.floor(winW / 2);
    const midY = wy + Math.floor(winH / 2);
    for (let i = 0; i < winH; i += 1) pen.put(midX, wy + i, haze(WOOD_DEEP, light, horizonY, wy + i, amount));
    pen.hline(wx, wx + winW - 1, midY, haze(WOOD_DEEP, light, horizonY, midY, amount));
  }
  const rise = roof === "hogyo" ? Math.round(w * 0.46) + 4 : Math.round(w * 0.26) + 8;
  const kick = roof === "hogyo" ? 3 : 4;
  paintRoof(pen, x + Math.round(w / 2), wallTop, Math.round(w / 2) + 5, rise, kick, roof, light, horizonY, amount);
}

// A flat slab. No eave and no curve, so it cannot be read as another
// wooden house. The glass bands are the only opening.
function paintBox(pen, piece, base, light, horizonY) {
  const amount = 0.46;
  const { x, w, h } = piece;
  block(pen, x, base - h, w, h, CONCRETE, light, horizonY, amount);
  shadeEdge(pen, x + w - 2, base - h, h, STEEL, light, horizonY, amount);
  pen.hline(x, x + w - 1, base - h, haze(STEEL, light, horizonY, base - h, amount));
  for (let band = 1; band <= 3; band += 1) {
    const gy = base - 8 - band * Math.round((h - 10) / 3);
    if (gy <= base - h + 3) continue;
    // Less mist on the glass than on the concrete, or the bands wash out
    // and the slab looks blank.
    block(pen, x + 3, gy, w - 6, 3, GLASS, light, horizonY, 0.22);
  }
}

function paintGate(pen, cx, base, light, horizonY) {
  const amount = 0.4;
  const pillarW = 12;
  const gap = 42;
  const pillarH = 66;
  const left = cx - Math.round(gap / 2) - pillarW;
  const right = cx + Math.round(gap / 2);
  block(pen, left - 2, base - 7, pillarW + 4, 7, STONE_DEEP, light, horizonY, amount);
  block(pen, right - 2, base - 7, pillarW + 4, 7, STONE_DEEP, light, horizonY, amount);
  block(pen, left, base - pillarH, pillarW, pillarH, RED, light, horizonY, amount);
  block(pen, right, base - pillarH, pillarW, pillarH, RED, light, horizonY, amount);
  shadeEdge(pen, left + pillarW - 2, base - pillarH, pillarH, mix(RED, 0.72), light, horizonY, amount);
  shadeEdge(pen, right + pillarW - 2, base - pillarH, pillarH, mix(RED, 0.72), light, horizonY, amount);
  // The beam under the great roof. It ties the pillars before the eaves start.
  block(pen, left - 2, base - pillarH - 6, right + pillarW - left + 4, 6, RED, light, horizonY, amount);
  // A lantern in the opening. Bands of gold, no mark. A character here
  // would be a logo, and it would not survive the haze anyway.
  const lanternTop = base - 48;
  block(pen, cx - 10, lanternTop - 3, 20, 3, RED, light, horizonY, amount);
  block(pen, cx - 8, lanternTop, 16, 22, RED, light, horizonY, amount);
  pen.hline(cx - 10, cx + 9, lanternTop - 3, haze(GOLD, light, horizonY, lanternTop - 3, amount));
  pen.hline(cx - 8, cx + 7, lanternTop, haze(GOLD, light, horizonY, lanternTop, amount));
  pen.hline(cx - 8, cx + 7, lanternTop + 21, haze(GOLD, light, horizonY, lanternTop + 21, amount));
  // Two roofs. The lower eave is the wide one. The upper roof starts
  // near the lower peak, and it is narrower, so both eaves stay visible.
  const eave = base - pillarH - 2;
  paintRoof(pen, cx, eave, 66, 16, 7, "kirizuma", light, horizonY, amount);
  paintRoof(pen, cx, eave - 14, 36, 12, 5, "kirizuma", light, horizonY, amount);
}

// A wide hall in dark timber on a stone step. Two roofs: the lower is
// irimoya, the hip-and-gable used on a temple hall, and the upper is a
// smaller hip. The brackets under the eave are the wooden blocks that
// hold a real roof off the wall.
function paintTemple(pen, x, w, base, light, horizonY) {
  const amount = 0.44;
  const cx = x + Math.round(w / 2);
  block(pen, x - 8, base - 6, w + 16, 6, STONE_DEEP, light, horizonY, amount);
  block(pen, x - 4, base - 11, w + 8, 5, STONE, light, horizonY, amount);
  const wallH = 30;
  const wallTop = base - 11 - wallH;
  block(pen, x, wallTop, w, wallH, TIMBER, light, horizonY, amount);
  shadeEdge(pen, x + w - 3, wallTop, wallH, WOOD_DEEP, light, horizonY, amount);
  for (let i = 0; i <= 5; i += 1) {
    const px = x + Math.round((i * (w - 3)) / 5);
    block(pen, px, wallTop, 3, wallH, WOOD_DEEP, light, horizonY, amount);
  }
  for (let i = 0; i < 8; i += 1) {
    const bx = x + 6 + i * Math.round((w - 16) / 7);
    block(pen, bx, wallTop - 4, 6, 4, WOOD, light, horizonY, amount);
  }
  const lowerEave = wallTop - 2;
  const lowerHalf = Math.round(w / 2) + 18;
  paintRoof(pen, cx, lowerEave, lowerHalf, 16, 6, "irimoya", light, horizonY, amount);
  // A short upper story, then the second roof. Sitting the second eave
  // on the first peak made one thick roof. The gap is what makes it two.
  const upperW = Math.round(w * 0.62);
  const upperLeft = cx - Math.round(upperW / 2);
  const upperTop = lowerEave - 14 - 8;
  block(pen, upperLeft, upperTop, upperW, 8, TIMBER, light, horizonY, amount);
  shadeEdge(pen, upperLeft + upperW - 2, upperTop, 8, WOOD_DEEP, light, horizonY, amount);
  paintRoof(pen, cx, upperTop, Math.round(upperW / 2) + 8, 12, 5, "yosemune", light, horizonY, amount);
}

// Five stories, each a vermilion body under a pyramidal tile roof, then
// a spire. This is the tallest thing on the horizon. The spire is a
// pole and five rings. It is not a ray.
function paintPagoda(pen, cx, base, light, horizonY) {
  const amount = 0.36;
  const tiers = [
    { body: 14, half: 52, rise: 15, kick: 5 },
    { body: 12, half: 42, rise: 13, kick: 5 },
    { body: 11, half: 33, rise: 12, kick: 4 },
    { body: 10, half: 25, rise: 11, kick: 4 },
    { body: 8, half: 17, rise: 10, kick: 3 },
  ];
  block(pen, cx - 20, base - 8, 40, 8, STONE, light, horizonY, amount);
  block(pen, cx - 16, base - 12, 32, 4, STONE_DEEP, light, horizonY, amount);
  let y = base - 12;
  for (const tier of tiers) {
    const bw = Math.max(8, Math.round(tier.half * 0.7));
    const top = y - tier.body;
    block(pen, cx - Math.round(bw / 2), top, bw, tier.body, RED, light, horizonY, amount);
    shadeEdge(pen, cx + Math.round(bw / 2) - 2, top, tier.body, mix(RED, 0.7), light, horizonY, amount);
    pen.hline(cx - Math.round(bw / 2), cx + Math.round(bw / 2), top, haze(GOLD, light, horizonY, top, amount));
    y = top;
    paintRoof(pen, cx, y + 1, tier.half, tier.rise, tier.kick, "hogyo", light, horizonY, amount);
    y -= tier.rise - 2;
  }
  const tip = y - 26;
  for (let yy = tip; yy <= y; yy += 1) {
    const c = haze(NAVY, light, horizonY, yy, amount);
    pen.put(cx, yy, c);
    pen.put(cx + 1, yy, c);
  }
  for (let i = 0; i < 5; i += 1) {
    const ry = y - 4 - i * 4;
    pen.hline(cx - 3, cx + 4, ry, haze(GOLD, light, horizonY, ry, amount));
  }
  pen.put(cx, tip - 1, haze(GOLD, light, horizonY, tip - 1, amount));
  pen.put(cx, tip - 2, haze(GOLD, light, horizonY, tip - 2, amount));
}

function paintBlossom(pen, x, base, light, horizonY) {
  const amount = 0.32;
  const trunkH = 10 + (x % 5);
  for (let i = 0; i < trunkH; i += 1) pen.put(x, base - i, haze(TRUNK, light, horizonY, base - i, amount));
  const cy = base - trunkH - 3;
  const r = 6 + (x % 3);
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy > r * r) continue;
      const petal = dx * dx + dy * dy > (r - 2) * (r - 2) ? PINK_DEEP : (dx + dy) % 5 === 0 ? PINK_PALE : PINK;
      pen.put(x + dx, cy + dy, haze(petal, light, horizonY, cy + dy, amount));
    }
  }
}

// The disc is a plain circle in the upper sky. It is skipped once the
// stars are up, because a red circle on a night sky reads as a second
// moon. There are no rays. A ray would make it a flag.
export function drawSkyline(pen, horizonY, light) {
  const base = horizonY - 1;
  for (const piece of SKYLINE_PLAN) {
    if (piece.kind === "house") paintHouse(pen, piece, base, light, horizonY);
    else if (piece.kind === "box") paintBox(pen, piece, base, light, horizonY);
    else if (piece.kind === "gate") paintGate(pen, piece.x, base, light, horizonY);
    else if (piece.kind === "temple") paintTemple(pen, piece.x, piece.w, base, light, horizonY);
    else if (piece.kind === "pagoda") paintPagoda(pen, piece.x, base, light, horizonY);
  }
  for (const x of BLOSSOMS) paintBlossom(pen, x, base, light, horizonY);
  if ((light.stars || 0) < 0.35) pen.disc(168, 78, 11, RED);
}
