// Pixel city painter. This is the in-app stand-in for prototype/render.py.
// It draws into one small canvas (SCENE_W by SCENE_H). Pixi shows that
// canvas as a single texture with nearest-neighbor scaling, so the blocks
// stay crisp and the static city is not redrawn every frame.
//
// The sky, mountains, and prairie are painted by paintBackdrop. The lots,
// roads, and buildings are painted by paintScene with gridOnly. CityView
// keeps the backdrop still and moves only the grid.
//
// Isometric math, same as the prototype: a lot at (u, v) lands at
//   x = OX + (u - v) * 12
//   y = OY + (u + v) * 6
// and each story lifts the roof by 3 pixels. Painter's algorithm sorts by
// u + v, so a lot closer to the camera (larger u + v) is drawn later and
// covers what is behind it. Left faces are the dark side, right faces the
// mid side, tops the light side. That shading is what makes a box read as
// a building instead of a flat diamond.

export const SCENE_W = 640;
export const SCENE_H = 500;
const OX = 320;
const OY = 176;
const HW = 12;
const HH = 6;
const STORY = 3;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
const mul = (c, m) => c.map((v, i) => Math.max(0, Math.min(255, Math.round(v * (m[i] ?? 1)))));
const add = (a, b) => a.map((v, i) => v + b[i]);

export function project(u, v, z = 0) {
  return [OX + (u - v) * HW, OY + (u + v) * HH - z];
}

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t ^ (t >>> 7)) >>> 0;
    t = Math.imul(t, 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function put(data, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= SCENE_W || y >= SCENE_H) return;
  const i = (y * SCENE_W + x) * 4;
  data[i] = c[0];
  data[i + 1] = c[1];
  data[i + 2] = c[2];
  data[i + 3] = 255;
}

function fillPoly(data, pts, c) {
  let y0 = SCENE_H;
  let y1 = 0;
  for (const p of pts) {
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  y0 = Math.max(0, Math.floor(y0));
  y1 = Math.min(SCENE_H - 1, Math.ceil(y1));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i]));
      const x1 = Math.min(SCENE_W - 1, Math.floor(xs[i + 1]));
      for (let x = x0; x <= x1; x++) put(data, x, y, c);
    }
  }
}

function hline(data, x0, x1, y, c) {
  if (x1 < x0) [x0, x1] = [x1, x0];
  for (let x = Math.round(x0); x <= Math.round(x1); x++) put(data, x, y, c);
}

function diamond(data, u, v, c) {
  fillPoly(data, [project(u, v), project(u + 1, v), project(u + 1, v + 1), project(u, v + 1)], c);
}

// A box standing on lot corners (u0,v0)-(u1,v1). z0 is the floor, h the
// wall height in pixels. Three faces, always the same light direction:
// left dark, right mid, top light.
function box(data, u0, v0, u1, v1, z0, h, base) {
  const p = (u, v, z) => project(u, v, z);
  const L = p(u0, v1, z0);
  const F = p(u1, v1, z0);
  const R = p(u1, v0, z0);
  const B = p(u0, v0, z0);
  const up = (pt) => [pt[0], pt[1] - h];
  fillPoly(data, [L, F, up(F), up(L)], mix(base, 0.72));
  fillPoly(data, [F, R, up(R), up(F)], mix(base, 0.55));
  fillPoly(data, [up(B), up(R), up(F), up(L)], mix(base, 1.18));
  return { L, F, R };
}

function faceColumns(u0, v0, u1, v1, side) {
  const cols = [];
  if (side === "L") {
    const a = project(u0, v1);
    const b = project(u1, v1);
    const n = Math.max(1, b[0] - a[0]);
    for (let x = a[0]; x <= b[0]; x++) cols.push({ t: x - a[0], n, x, yb: a[1] + Math.floor((x - a[0]) / 2) });
  } else {
    const a = project(u1, v1);
    const b = project(u1, v0);
    const n = Math.max(1, b[0] - a[0]);
    for (let x = a[0]; x <= b[0]; x++) cols.push({ t: x - a[0], n, x, yb: a[1] - Math.floor((x - a[0] + 1) / 2) });
  }
  return cols;
}

function windows(data, u0, v0, u1, v1, h, fn) {
  for (const side of ["L", "R"]) {
    for (const col of faceColumns(u0, v0, u1, v1, side)) {
      for (let k = 0; k < h; k++) {
        const c = fn(side, col.t, col.n, k);
        if (c) put(data, col.x, col.yb - k, c);
      }
    }
  }
}

function gable(data, u0, v0, u1, v1, z, rh, c) {
  const vm = (v0 + v1) / 2;
  fillPoly(data, [project(u0, v0, z), project(u1, v0, z), project(u1, vm, z + rh), project(u0, vm, z + rh)], mix(c, 0.8));
  fillPoly(data, [project(u0, v1, z), project(u1, v1, z), project(u1, vm, z + rh), project(u0, vm, z + rh)], c);
}

function dome(data, cx, baseY, r, c) {
  for (let dy = 0; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    for (let dx = -w; dx <= w; dx++) {
      let col = c;
      if (dx < -w * 0.35) col = mix(c, 1.3);
      else if (dx > w * 0.45) col = mix(c, 0.72);
      put(data, cx + dx, baseY - dy, col);
    }
  }
}

function tree(data, x, y, big, c) {
  const trunk = hex("#5a3a1a");
  put(data, x, y, trunk);
  put(data, x, y - 1, trunk);
  const r = big ? 3 : 2;
  for (let dy = 0; dy <= r; dy++) {
    const w = r - Math.floor(dy / 2);
    for (let dx = -w; dx <= w; dx++) put(data, x + dx, y - 2 - dy, dx < 0 ? mix(c, 1.25) : c);
  }
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

const WIN = hex("#2b3a55");
const LIT = hex("#ffe58a");
const GLASS = hex("#9cc8ea");
const GLASS_R = hex("#5f86aa");

function drawBuilding(data, b, ambient, night) {
  const rand = rng(b.variant || b.id * 97 || 1);
  const stories = b.status === "complete" ? b.targetStories : Math.max(0.35, b.storiesBuilt);
  const h = Math.max(STORY, Math.round(stories * STORY));
  const x = b.x;
  const y = b.y;
  const lit = (chance) => (night && rand() < chance ? LIT : null);

  if (b.type === "capitol") {
    const stone = mul(hex("#ece6d8"), ambient);
    box(data, x + 0.02, y + 0.12, x + 0.98, y + 0.88, 0, 12, stone);
    windows(data, x + 0.02, y + 0.12, x + 0.98, y + 0.88, 12, (side, t, n, k) => {
      if (t <= 0 || t >= n || k >= 11 || k < 2) return null;
      if (t % 3 === 0) return mix(stone, 1.15);
      return side === "L" ? hex("#8a8478") : hex("#6a645a");
    });
    box(data, x + 1 / 3, y + 1 / 3, x + 2 / 3, y + 2 / 3, 12, 12, mul(hex("#e6dfcf"), ambient));
    const [cx, cy] = project(x + 0.5, y + 0.5, 24);
    dome(data, cx, cy + 2, 7, hex("#e0b020"));
    return;
  }

  if (b.type === "rowhouse") {
    const base = mul(hex(pick(rand, ["#d98c8c", "#8cb4d9", "#d9cf8c", "#9cc79c", "#c9a0d9", "#e8b07a", "#7ac0b8"])), ambient);
    const roof = mul(hex(pick(rand, ["#5a4a5a", "#6b3a2a", "#3d4a5a", "#4a4040"])), ambient);
    const u0 = x + 1 / 6;
    const v0 = y + 1 / 6;
    const u1 = x + 5 / 6;
    const v1 = y + 5 / 6;
    box(data, u0, v0, u1, v1, 0, h, base);
    windows(data, u0, v0, u1, v1, h, (side, t, n, k) => {
      if (t <= 0 || t >= n || k >= h - 1) return null;
      if (side === "L" && k <= 2 && t === Math.floor(n / 2)) return hex("#4a2a1a");
      if (k % STORY === 0) return null;
      if (t % 4 === 2) return night ? LIT : hex("#f8f4e8");
      return null;
    });
    gable(data, u0, v0, u1, v1, h, 4, roof);
    if (rand() < 0.5) {
      const [tx, ty] = project(x + 0.88, y + 0.15);
      tree(data, tx, ty, false, hex("#2f7a32"));
    }
    return;
  }

  if (b.type === "mixeduse") {
    const base = mul(hex(pick(rand, ["#c45c32", "#b5653a", "#8c3b2e", "#c08850", "#a86848"])), ambient);
    const awn = hex(pick(rand, ["#d03a3a", "#2f8a4a", "#2f5fb0", "#e0a020"]));
    const u0 = x + 0.08;
    const v0 = y + 0.12;
    const u1 = x + 0.92;
    const v1 = y + 0.92;
    box(data, u0, v0, u1, v1, 0, h, base);
    windows(data, u0, v0, u1, v1, h, (side, t, n, k) => {
      if (t <= 0 || t >= n || k >= h - 1) return null;
      if (k <= 2) return t % 4 === 0 ? mix(base, 0.6) : hex("#7fb0d0");
      if (k === 3 || k === 4) return (Math.floor(t / 2) % 2 === 0 ? awn : hex("#f0f0e8"));
      if ((k - 5) % STORY === 2) return null;
      if (t % 3 !== 1) return null;
      return lit(0.35) || (side === "L" ? hex("#304060") : hex("#263248"));
    });
    return;
  }

  if (b.type === "skyscraper") {
    const base = mul(hex(pick(rand, ["#3f6f9a", "#3f8f92", "#2f5f8a", "#4a78a8", "#5a6472"])), ambient);
    const setback = stories >= 22;
    const h1 = setback ? Math.round(h * 0.78) : h;
    const u0 = x + 1 / 6;
    const v0 = y + 1 / 6;
    const u1 = x + 5 / 6;
    const v1 = y + 5 / 6;
    box(data, u0, v0, u1, v1, 0, h1, base);
    windows(data, u0, v0, u1, v1, h1, (side, t, n, k) => {
      if (t <= 0 || t >= n || k < 1 || k >= h1 - 1) return null;
      if (k % STORY === 0) return mix(base, side === "L" ? 0.85 : 0.6);
      if (t % 2 === 0) return null;
      if (k > h1 - STORY * 2) return night ? LIT : hex("#fff3a0");
      return lit(0.2) || (side === "L" ? GLASS : GLASS_R);
    });
    if (setback) {
      const h2 = h - h1;
      box(data, x + 0.3, y + 0.3, x + 0.7, y + 0.7, h1, h2, mix(base, 1.05));
      windows(data, x + 0.3, y + 0.3, x + 0.7, y + 0.7, h2, (side, t, n, k) => {
        if (t % 2 === 0 || k % STORY === 0) return null;
        return side === "L" ? GLASS : GLASS_R;
      });
    }
    const [cx, cy] = project(x + 0.5, y + 0.5, h);
    for (let i = 0; i < 8; i++) put(data, cx, cy - i, hex("#d0d0d0"));
    put(data, cx, cy - 8, hex("#ff3030"));
    return;
  }

  if (b.type === "museum") {
    // One gallery block and a single titanium shard. This used to call
    // mix(color, ambient). mix() multiplies by one brightness number.
    // ambient is an [r, g, b] array, so every channel became NaN and the
    // canvas stored 0. The two shard faces were solid black and read as
    // twin cathedral spires. The demo map has five museums, which is why
    // four or five black spires showed up. mul() tints each channel.
    const base = mul(hex(pick(rand, ["#c8a878", "#b8c0c8", "#e4e0d6"])), ambient);
    const h1 = Math.max(STORY, Math.round(h * 0.6));
    box(data, x + 0.12, y + 0.18, x + 0.88, y + 0.88, 0, h1, base);
    windows(data, x + 0.12, y + 0.18, x + 0.88, y + 0.88, h1, (side, t, n, k) => {
      if (t <= 1 || t >= n - 1) return null;
      if (side === "L" && k > 2 && k < 8 && t % 3 === 1) return hex("#7ab0d0");
      return null;
    });
    const shard = mul(hex("#dfe6ee"), ambient);
    const footL = project(x + 0.35, y + 0.55, h1);
    const footR = project(x + 0.72, y + 0.62, h1);
    const tip = project(x + 0.5, y + 0.42, h1 + 14);
    fillPoly(data, [footL, footR, tip], shard);
    return;
  }

  const base = mul(
    hex(b.type === "state" ? pick(rand, ["#d8d0bc", "#e0dccc", "#cfc4a8"]) : pick(rand, ["#b9b2a3", "#c9b48f", "#8f9aa6", "#c2a58a"])),
    ambient,
  );
  const u0 = x + 1 / 6;
  const v0 = y + 1 / 6;
  const u1 = x + 5 / 6;
  const v1 = y + 5 / 6;
  box(data, u0, v0, u1, v1, 0, h, base);
  windows(data, u0, v0, u1, v1, h, (side, t, n, k) => {
    if (t <= 0 || t >= n || k >= h - 1 || k < 1) return null;
    if (k % STORY === 0) return null;
    if (t % 3 === 0) return null;
    if (b.type === "state" && k < 6) return t % 3 === 0 ? mix(base, 1.15) : mix(base, 0.55);
    return lit(0.25) || (side === "L" ? WIN : mix(WIN, 0.8));
  });
  if (b.type === "state") {
    const [cx, cy] = project(x + 0.5, y + 0.5, h);
    for (let i = 0; i < 7; i++) put(data, cx, cy - i, hex("#e8e8e8"));
    for (let i = 0; i < 4; i++) {
      put(data, cx + 1 + i, cy - 7, hex("#c02020"));
      put(data, cx + 1 + i, cy - 6, hex("#2040a0"));
    }
  } else {
    box(data, x + 0.4, y + 0.35, x + 0.6, y + 0.55, h, 3, hex("#8a8a8a"));
  }
}

function drawLandmark(data, l, ambient) {
  const x = l.x;
  const y = l.y;
  if (l.key === "unionStation") {
    const tan = mul(hex("#d6b88a"), ambient);
    box(data, x, y + 0.2, x + 1, y + 0.8, 0, 10, tan);
    windows(data, x, y + 0.2, x + 1, y + 0.8, 10, (side, t, n, k) => {
      if (t <= 0 || t >= n || k > 7) return null;
      if (t % 3 === 1 && k > 1 && k < 7) return hex("#3a4a6a");
      return null;
    });
    box(data, x + 0.3, y + 0.25, x + 0.7, y + 0.75, 10, 6, mix(tan, 1.05));
    const [cx, cy] = project(x + 0.5, y + 0.5, 16);
    for (let i = -6; i <= 6; i++) put(data, cx + i, cy, hex("#d02828"));
    fillPoly(data, [[cx - 6, cy + 2], [cx + 6, cy + 2], [cx, cy - 4]], hex("#7a4a3a"));
  } else if (l.key === "courthouse") {
    const st = mul(hex("#cfc8b8"), ambient);
    box(data, x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0, 16, st);
    windows(data, x + 0.12, y + 0.12, x + 0.88, y + 0.88, 16, (side, t, n, k) => {
      if (t <= 0 || t >= n) return null;
      if (k < 9) return t % 2 === 0 ? mix(st, 1.2) : mix(st, 0.5);
      return t % 3 === 1 ? hex("#3a4660") : null;
    });
    const L = project(x + 0.2, y + 0.85, 14);
    const F = project(x + 0.8, y + 0.85, 14);
    const tip = [(L[0] + F[0]) / 2, (L[1] + F[1]) / 2 - 8];
    fillPoly(data, [L, F, tip], mix(st, 1.12));
  } else if (l.key === "artMuseum") {
    const shard = mul(hex("#d5dde4"), ambient);
    box(data, x + 0.1, y + 0.35, x + 0.55, y + 0.9, 0, 12, mul(hex("#8a8478"), ambient));
    const a = project(x + 0.25, y + 0.7, 4);
    const b = project(x + 0.95, y + 0.8, 2);
    const tip = project(x + 0.45, y + 0.25, 28);
    fillPoly(data, [a, b, tip], shard);
    fillPoly(data, [b, project(x + 0.95, y + 0.2, 2), [tip[0] + 8, tip[1] + 6]], mix(shard, 0.72));
  } else if (l.key === "cathedral") {
    const st = mul(hex("#e4e0d4"), ambient);
    box(data, x + 0.25, y + 0.2, x + 0.75, y + 0.85, 0, 16, st);
    windows(data, x + 0.25, y + 0.2, x + 0.75, y + 0.85, 16, (side, t, n, k) => {
      if (side !== "L" || t % 4 !== 2 || k < 3 || k > 12) return null;
      return hex("#6a3048");
    });
    const [ax, ay] = project(x + 0.35, y + 0.45, 16);
    const [bx, by] = project(x + 0.65, y + 0.55, 16);
    fillPoly(data, [[ax - 2, ay], [ax + 2, ay], [ax, ay - 14]], st);
    fillPoly(data, [[bx - 2, by], [bx + 2, by], [bx, by - 14]], mix(st, 0.85));
    put(data, ax, ay - 15, hex("#f0d060"));
    put(data, bx, by - 15, hex("#f0d060"));
  }
}

function drawPark(data, p) {
  const x = p.x;
  const y = p.y;
  diamond(data, x, y, hex("#3f8f3a"));
  const [ax, ay] = project(x + 0.1, y + 0.5);
  const [bx, by] = project(x + 0.9, y + 0.5);
  hline(data, ax, bx, (ay + by) / 2, hex("#d8cc98"));
  if (p.name === "Washington Park" || p.name === "City Park") {
    const [cx, cy] = project(x + 0.55, y + 0.58);
    fillPoly(
      data,
      [
        [cx - 7, cy],
        [cx, cy - 3],
        [cx + 7, cy],
        [cx, cy + 3],
      ],
      hex("#3a7ad0"),
    );
  }
  const spots = [
    [0.25, 0.25],
    [0.75, 0.22],
    [0.22, 0.75],
    [0.8, 0.78],
    [0.5, 0.18],
  ];
  for (const [u, v] of spots) {
    const [tx, ty] = project(x + u, y + v);
    tree(data, tx, ty, p.name === "City Park", hex("#2f7a32"));
  }
}

function drawQuest(data, q, ambient) {
  const x = q.x;
  const y = q.y;
  const name = q.name;
  if (name === "Coors Field") {
    const [cx, cy] = project(x + 1, y + 1);
    fillPoly(data, [project(x, y), project(x + 2, y), project(x + 2, y + 2), project(x, y + 2)], mul(hex("#b4ada0"), ambient));
    for (let k = 0; k < 8; k++) {
      fillPoly(
        data,
        [
          [cx - 18, cy - k],
          [cx, cy - 8 - k],
          [cx + 18, cy - k],
          [cx, cy + 6 - k],
        ],
        k === 7 ? hex("#3fa048") : hex("#8a3a2a"),
      );
    }
  } else if (name === "Ball Arena" || name === "Empower Field at Mile High") {
    const [cx, cy] = project(x + 1, y + 1);
    const wall = name.startsWith("Ball") ? hex("#8aa0b4") : hex("#6a3040");
    for (let k = 0; k < 8; k++) {
      fillPoly(
        data,
        [
          [cx - 16, cy - k],
          [cx, cy - 7 - k],
          [cx + 16, cy - k],
          [cx, cy + 6 - k],
        ],
        k > 5 ? mix(wall, 1.3) : wall,
      );
    }
  } else if (name === "Red Rocks Amphitheatre") {
    const rock = hex("#a84830");
    fillPoly(data, [project(x, y + 0.2, 0), project(x + 2, y, 8), project(x + 2, y + 2, 0), project(x, y + 1.6, 10)], rock);
    fillPoly(data, [project(x + 0.3, y + 0.6, 4), project(x + 1.6, y + 0.4, 4), project(x + 1.5, y + 1.4, 2)], hex("#c46a40"));
  } else if (name === "Big Blue Bear") {
    const [cx, cy] = project(x + 1, y + 1, 0);
    const blue = hex("#2f5fb8");
    fillPoly(data, [[cx - 6, cy], [cx + 4, cy], [cx + 2, cy - 16], [cx - 4, cy - 16]], blue);
    fillPoly(data, [[cx - 2, cy - 16], [cx + 3, cy - 16], [cx + 1, cy - 22], [cx - 1, cy - 22]], mix(blue, 1.2));
  } else if (name === "Confluence Park bridge") {
    diamond(data, x, y, hex("#3a7ad0"));
    diamond(data, x + 1, y, hex("#3a7ad0"));
    const [a1, a2] = project(x, y + 0.5, 2);
    const [b1, b2] = project(x + 2, y + 0.5, 2);
    hline(data, a1, b1, a2, hex("#d8d0bc"));
    hline(data, a1, b1, a2 - 1, hex("#f0ece0"));
    hline(data, a1, b1, b2, hex("#d8d0bc"));
  } else if (name === "16th Street Mall") {
    for (let i = 0; i < 3; i++) {
      box(data, x + i * 0.55, y + 0.3, x + i * 0.55 + 0.5, y + 1.4, 0, 8 + (i % 2) * 4, mul(hex(i % 2 ? "#c45c32" : "#d8d0bc"), ambient));
    }
  } else {
    box(data, x + 0.2, y + 0.2, x + 1.6, y + 1.6, 0, 10, mul(hex("#8a4030"), ambient));
  }
}

function skyAndLand(data, light) {
  const top = light.sky[0];
  const mid = light.sky[1];
  const horizon = light.sky[2];
  const bands = 8;
  const horizonY = OY - 8;
  for (let y = 0; y < SCENE_H; y++) {
    const t = Math.min(1, y / horizonY);
    const c = t < 0.5 ? top.map((v, i) => Math.round(v + (mid[i] - v) * (t * 2))) : mid.map((v, i) => Math.round(v + (horizon[i] - v) * ((t - 0.5) * 2)));
    const band = Math.floor((y * bands) / Math.max(1, horizonY));
    for (let x = 0; x < SCENE_W; x++) {
      const dither = y % 4 === 3 && (x + y) % 2 === 0;
      put(data, x, y, dither ? c.map((v) => Math.min(255, v + 8)) : c);
    }
    if (y > horizonY) break;
  }
  if (light.stars > 0.2) {
    const star = rng(42);
    const n = Math.floor(80 * light.stars);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(star() * SCENE_W);
      const y = Math.floor(star() * star() * (horizonY - 8));
      put(data, x, y, star() > 0.3 ? [255, 255, 240] : [170, 190, 255]);
    }
  }
  if (light.sun?.visible) {
    const cx = Math.round(light.sun.x * SCENE_W);
    const cy = Math.round(horizonY - 18 - Math.max(0, light.sun.alt) * 70);
    const col = light.sun.color;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (dx * dx + dy * dy <= 25) put(data, cx + dx, cy + dy, col);
  }
  if (light.moon?.visible && light.stars > 0.3) {
    const cx = Math.round(light.moon.x * SCENE_W);
    const cy = Math.round(horizonY - 24 - Math.max(0, light.moon.alt) * 60);
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy <= 16 && (dx + 2) ** 2 + dy * dy > 9) put(data, cx + dx, cy + dy, light.moon.color);
      }
    }
  }
  const cloud = light.cloud || [244, 248, 252];
  const cr = rng(7);
  if (light.stars < 0.85) {
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(cr() * SCENE_W);
      const cy = 12 + Math.floor(cr() * 48);
      for (let k = 0; k < 3; k++) {
        const ex = cx + Math.floor(cr() * 28) - 14;
        const ey = cy + Math.floor(cr() * 5) - 2;
        const rw = 6 + Math.floor(cr() * 8);
        for (let dx = -rw; dx <= rw; dx++) put(data, ex + dx, ey, cloud);
        for (let dx = -rw + 3; dx <= rw - 3; dx++) put(data, ex + dx, ey - 1, cloud);
      }
    }
  }

  const rock = mul(hex("#8a90b0"), light.mountain);
  const rockS = mul(hex("#6a7094"), light.mountain);
  const snow = mul(hex("#ffffff"), light.snow);
  const snowS = mul(hex("#d5dced"), light.snow);
  const foot = mul(hex("#6f8a6a"), light.mountain);
  const footS = mul(hex("#566e58"), light.mountain);
  ridge(data, 11, horizonY + 6, 28, 100, rock, rockS, snow, snowS, 62);
  ridge(data, 23, horizonY + 16, 12, 48, foot, footS, snow, snowS, 40);

  for (let y = horizonY; y < SCENE_H; y++) {
    const t = y - horizonY;
    let c = t < 10 ? hex("#7a7a44") : t < 36 ? hex("#a09654") : hex("#c4b56a");
    c = mul(c, light.ambient);
    for (let x = 0; x < SCENE_W; x++) {
      const speckle = (x * 3 + y * 5) % 17 === 0 ? mix(c, 0.86) : c;
      put(data, x, y, speckle);
    }
  }
}

function ridge(data, seed, base, hmin, hmax, lit, shade, snowL, snowS, snowline) {
  const rand = rng(seed);
  const peaks = [];
  for (let i = 0; i < 7; i++) peaks.push({ x: ((i + 0.3 + rand() * 0.4) * SCENE_W) / 7, h: 0.45 + rand() * 0.55, w: 0.08 + rand() * 0.08 });
  for (let x = 0; x < SCENE_W; x++) {
    let env = 0;
    for (const pk of peaks) env = Math.max(env, pk.h - Math.abs(x - pk.x) / SCENE_W / pk.w);
    const h = hmin + (hmax - hmin) * Math.max(0, Math.min(1, env));
    const top = Math.round(base - h);
    const litSide = Math.sin(x * 0.05 + seed) > 0;
    for (let y = Math.max(0, top); y < Math.min(SCENE_H, base + 8); y++) {
      const alt = base - y;
      const snowy = alt > snowline && y - top < 4 + (alt - snowline) * 0.15;
      put(data, x, y, snowy ? (litSide ? snowL : snowS) : litSide ? lit : shade);
    }
  }
}

function sceneCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = SCENE_W;
  canvas.height = SCENE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.createImageData(SCENE_W, SCENE_H);
  return { canvas, ctx, image };
}

// Sky, mountains, and the sandy ground. No buildings. CityView pins this
// picture to the screen so a drag does not slide the mountains away.
export function paintBackdrop(light) {
  const { canvas, ctx, image } = sceneCanvas();
  skyAndLand(image.data, light);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function paintScene(city, light, options = {}) {
  const { canvas, ctx, image } = sceneCanvas();
  const data = image.data;
  const ambient = light.ambient.map((v) => Math.max(0.25, Math.min(1.15, v)));
  const night = light.windowLight > 0.35;
  // The grid picture starts clear. The backdrop shows through every pixel
  // that is not a lot, a road, or a building.
  if (!options.gridOnly) skyAndLand(data, light);

  const tiles = city.map.tiles;
  const period = city.map.period;
  const grass = [hex("#8fa452"), hex("#7d9448"), hex("#9aaa58")].map((c) => mul(c, ambient));
  const road = mul(night ? hex("#3a3a32") : hex("#5a5a60"), ambient);
  const dash = night ? hex("#f0d060") : hex("#d8c860");

  fillPoly(data, [project(0, tiles, 0), project(tiles, tiles, 0), project(tiles, tiles, -10), project(0, tiles, -10)], mul(hex("#7a5230"), ambient));
  fillPoly(data, [project(tiles, tiles, 0), project(tiles, 0, 0), project(tiles, 0, -10), project(tiles, tiles, -10)], mul(hex("#5e3e24"), ambient));

  for (let v = 0; v < tiles; v++) {
    for (let u = 0; u < tiles; u++) {
      const isRoad = u % period === 0 || v % period === 0;
      diamond(data, u, v, isRoad ? road : grass[(u * 3 + v) % 3]);
      if (isRoad && u % period !== 0 && v % period === 0) {
        const a = project(u + 0.35, v + 0.5);
        const b = project(u + 0.65, v + 0.5);
        hline(data, a[0], b[0], a[1], dash);
      }
    }
  }

  const items = [];
  for (const b of city.buildings) items.push({ k: b.x + b.y, draw: () => drawBuilding(data, b, ambient, night) });
  for (const p of city.parks) items.push({ k: p.x + p.y + 0.01, draw: () => drawPark(data, p) });
  for (const l of city.landmarks) {
    if (l.key === "capitol") continue;
    items.push({ k: l.x + l.y + 0.02, draw: () => drawLandmark(data, l, ambient) });
  }
  for (const q of city.sideQuests) items.push({ k: q.x + q.y + 0.5, draw: () => drawQuest(data, q, ambient) });
  items.sort((a, b) => a.k - b.k);
  for (const item of items) item.draw();

  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function sceneSignature(city, phase) {
  if (!city) return "";
  const buildings = city.buildings.map((b) => `${b.id}:${b.status}:${b.storiesBuilt}`).join(";");
  const marks = city.landmarks.map((l) => l.key).join(",");
  const quests = city.sideQuests.map((q) => q.name).join(",");
  // Transit is left out. CityView redraws those stripes every frame, and a
  // moving bus must not throw away the cached city texture.
  return `${phase}|${buildings}|${marks}|${city.parks.length}|${quests}`;
}
