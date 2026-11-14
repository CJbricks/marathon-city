// The shared pixel pen. Every theme draws with this, into one picture
// buffer. The city is not a 3D model redrawn every frame. It is this
// buffer, uploaded once to Pixi and scaled with nearest-neighbor.
//
// A pen does not know which city it is drawing. Denver and a future
// Austin both call box(), windows(), and dome(). The colors and the
// silhouettes live in the theme.

import { project } from "./sceneLayout";

export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const mix = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));

// Tint each channel. ambient from the clock is an [r, g, b] multiplier.
// mix() is the wrong tool for that: it would multiply by the array and
// store NaN, which the canvas turns into black.
export const mul = (c, m) => c.map((v, i) => Math.max(0, Math.min(255, Math.round(v * (m[i] ?? 1)))));

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t ^ (t >>> 7)) >>> 0;
    t = Math.imul(t, 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

export function createPen(data, width, height) {
  function put(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height || !c) return;
    const i = (y * width + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  }

  // Fill a horizontal run in one loop. Calling put() per pixel was the
  // slow part of the old painter, and this picture has four times as
  // many pixels as the 640×500 one.
  function span(x0, x1, y, c) {
    y = Math.round(y);
    if (y < 0 || y >= height || !c) return;
    if (x1 < x0) [x0, x1] = [x1, x0];
    x0 = Math.max(0, Math.ceil(x0));
    x1 = Math.min(width - 1, Math.floor(x1));
    let i = (y * width + x0) * 4;
    for (let x = x0; x <= x1; x += 1) {
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
      i += 4;
    }
  }

  function fillPoly(pts, c) {
    let y0 = height;
    let y1 = 0;
    for (const p of pts) {
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    y0 = Math.max(0, Math.floor(y0));
    y1 = Math.min(height - 1, Math.ceil(y1));
    for (let y = y0; y <= y1; y += 1) {
      const xs = [];
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          const t = (y - a[1]) / (b[1] - a[1]);
          xs.push(a[0] + t * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) span(xs[i], xs[i + 1], y, c);
    }
  }

  function hline(x0, x1, y, c) {
    span(x0, x1, y, c);
  }

  function fillRect(x, y, w, h, c) {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let row = 0; row < h; row += 1) span(x0, x0 + w - 1, y0 + row, c);
  }

  function diamond(u, v, c) {
    fillPoly([project(u, v), project(u + 1, v), project(u + 1, v + 1), project(u, v + 1)], c);
  }

  // Shrink a lot's diamond toward its center. m = 0 is the full lot,
  // m = 0.3 leaves a rim. Streets use this for the curb and the asphalt.
  function insetDiamond(u, v, m, c) {
    const shrink = (pu, pv) => [u + 0.5 + (pu - 0.5) * (1 - m), v + 0.5 + (pv - 0.5) * (1 - m)];
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([pu, pv]) => shrink(pu, pv));
    fillPoly(
      corners.map(([uu, vv]) => project(uu, vv)),
      c,
    );
  }

  // A box standing on lot corners (u0,v0)-(u1,v1). z0 is the floor, h the
  // wall height in pixels. Three faces, always the same light direction:
  // left dark, right mid, top light. That is the whole shading model.
  function box(u0, v0, u1, v1, z0, h, base) {
    const p = (u, v, z) => project(u, v, z);
    const L = p(u0, v1, z0);
    const F = p(u1, v1, z0);
    const R = p(u1, v0, z0);
    const B = p(u0, v0, z0);
    const up = (pt) => [pt[0], pt[1] - h];
    fillPoly([L, F, up(F), up(L)], mix(base, 0.72));
    fillPoly([F, R, up(R), up(F)], mix(base, 0.55));
    fillPoly([up(B), up(R), up(F), up(L)], mix(base, 1.18));
    return { L, F, R };
  }

  // One column of pixels down a wall. The slope is HW:HH = 2:1, which is
  // why the y step is half the x step. k = 0 is the ground.
  function faceColumns(u0, v0, u1, v1, side) {
    const cols = [];
    if (side === "L") {
      const a = project(u0, v1);
      const b = project(u1, v1);
      const n = Math.max(1, b[0] - a[0]);
      for (let x = a[0]; x <= b[0]; x += 1) cols.push({ t: x - a[0], n, x, yb: a[1] + Math.floor((x - a[0]) / 2) });
    } else {
      const a = project(u1, v1);
      const b = project(u1, v0);
      const n = Math.max(1, b[0] - a[0]);
      for (let x = a[0]; x <= b[0]; x += 1) cols.push({ t: x - a[0], n, x, yb: a[1] - Math.floor((x - a[0] + 1) / 2) });
    }
    return cols;
  }

  // fn(side, t, n, k) returns a color or null. t is the column, k is the
  // row up from the sidewalk. This is how facades get windows without a
  // second geometry pass.
  function windows(u0, v0, u1, v1, h, fn) {
    for (const side of ["L", "R"]) {
      for (const col of faceColumns(u0, v0, u1, v1, side)) {
        for (let k = 0; k < h; k += 1) {
          const c = fn(side, col.t, col.n, k);
          if (c) put(col.x, col.yb - k, c);
        }
      }
    }
  }

  function gable(u0, v0, u1, v1, z, rh, c) {
    const vm = (v0 + v1) / 2;
    fillPoly(
      [project(u0, v0, z), project(u1, v0, z), project(u1, vm, z + rh), project(u0, vm, z + rh)],
      mix(c, 0.8),
    );
    fillPoly(
      [project(u0, v1, z), project(u1, v1, z), project(u1, vm, z + rh), project(u0, vm, z + rh)],
      c,
    );
  }

  // Top half of a circle. The capitol dome and the garden glasshouse use it.
  // Left side is lighter so it reads as a round volume, not a flat disc.
  function dome(cx, baseY, r, c) {
    for (let dy = 0; dy <= r; dy += 1) {
      const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      for (let dx = -w; dx <= w; dx += 1) {
        let col = c;
        if (dx < -w * 0.35) col = mix(c, 1.28);
        else if (dx > w * 0.45) col = mix(c, 0.7);
        put(cx + dx, baseY - dy, col);
      }
    }
  }

  function disc(cx, cy, r, c) {
    for (let dy = -r; dy <= r; dy += 1) {
      const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      span(cx - w, cx + w, cy + dy, c);
    }
  }

  function tree(x, y, big, c) {
    const trunk = hex("#5a3a1a");
    const trunkH = big ? 6 : 4;
    for (let i = 0; i < trunkH; i += 1) {
      put(x, y - i, trunk);
      if (big && i < 3) put(x + 1, y - i, mix(trunk, 0.75));
    }
    const r = big ? 7 : 5;
    for (let dy = 0; dy <= r; dy += 1) {
      const w = r - Math.floor(dy / 2);
      for (let dx = -w; dx <= w; dx += 1) {
        put(x + dx, y - trunkH - dy, dx < -1 ? mix(c, 1.3) : dx > w * 0.4 ? mix(c, 0.75) : c);
      }
    }
  }

  return {
    data,
    width,
    height,
    put,
    span,
    fillPoly,
    hline,
    fillRect,
    diamond,
    insetDiamond,
    box,
    windows,
    gable,
    dome,
    disc,
    tree,
  };
}
