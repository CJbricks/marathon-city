// Paints the city into one picture.
//
// The picture is 1280×1000, twice the old 640×500 canvas. Pixi shows it
// as a single texture with nearest-neighbor scaling, so the blocks stay
// crisp and the static city is not redrawn every frame. What gets drawn
// (Denver's buildings, or Austin's) comes from themes/. This file only
// owns the sky, the camera-sized backdrop, and the order the lots are
// painted in. A theme may warm the sky or add a lake. Denver does neither,
// and those branches are skipped, so its picture stays the same.
//
// paintBackdrop is the sky, the mountains, and the ground. paintScene
// with gridOnly is the lots, roads, and buildings, and every other pixel
// in that picture is clear. CityView keeps the backdrop still and moves
// only the grid.
//
// Cars, pedestrians, dust, and the crane are not in this picture. They
// move every frame, so CityView draws them on top and leaves them out
// of sceneSignature.

import { createPen, hex, mix, mul, rng } from "./pixelPen";
import { HORIZON_Y, SCENE_H, SCENE_W } from "./sceneLayout";
import { drawStreets } from "./streets";
import { themeFor } from "./themes";

export { HORIZON_Y, SCENE_H, SCENE_W, STORY, project } from "./sceneLayout";

// Phones allow at least a 4096×4096 texture. The city itself is 1280×1000
// (about 5 MB). The sky picture grows to cover a tall screen, and on a
// very wide monitor that growth used to pass 4096. Past that, WebGL
// refuses the upload and the mountains disappear. The flat color behind
// the sprite covers whatever we trim off.
export const MAX_TEXTURE = 4096;

function canvasFrom(data, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData(width, height);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// A theme can pull the clock sky toward one color. Denver has no sky
// field, and this returns the keyframe color unchanged, same array, so
// the Nuggets sky stays pixel-identical. Night uses a smaller mix so the
// stars do not turn peach.
export function tintSkyColor(color, light, theme) {
  const spec = theme?.sky;
  if (!spec || !color) return color;
  const amount = light.stars > 0.6 ? spec.night || 0 : spec.day || 0;
  if (!amount) return color;
  const toward = hex(spec.toward);
  return color.map((v, i) => Math.min(255, Math.max(0, Math.round(v + (toward[i] - v) * amount))));
}

function skyAndLand(pen, light, theme) {
  const { width, height } = pen;
  const top = tintSkyColor(light.sky[0], light, theme);
  const mid = tintSkyColor(light.sky[1], light, theme);
  const horizon = tintSkyColor(light.sky[2], light, theme);
  const horizonY = Math.min(HORIZON_Y, height - 1);
  for (let y = 0; y < height; y += 1) {
    const t = Math.min(1, y / Math.max(1, horizonY));
    const c =
      t < 0.5
        ? top.map((v, i) => Math.round(v + (mid[i] - v) * (t * 2)))
        : mid.map((v, i) => Math.round(v + (horizon[i] - v) * ((t - 0.5) * 2)));
    const dither = y % 4 === 3;
    for (let x = 0; x < width; x += 1) {
      pen.put(x, y, dither && (x + y) % 2 === 0 ? c.map((v) => Math.min(255, v + 8)) : c);
    }
    if (y > horizonY) break;
  }
  if (light.stars > 0.2) {
    const star = rng(42);
    // Same density as the old 80 stars on a 640-wide picture.
    const n = Math.floor((width / 8) * light.stars);
    for (let i = 0; i < n; i += 1) {
      const x = Math.floor(star() * width);
      const y = Math.floor(star() * star() * (horizonY - 16));
      pen.put(x, y, star() > 0.3 ? [255, 255, 240] : [170, 190, 255]);
    }
  }
  if (light.sun?.visible) {
    const cx = Math.round(light.sun.x * width);
    const cy = Math.round(horizonY - 36 - Math.max(0, light.sun.alt) * 140);
    const col = light.sun.color;
    const r = 10;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) if (dx * dx + dy * dy <= r * r) pen.put(cx + dx, cy + dy, col);
    }
  }
  if (light.moon?.visible && light.stars > 0.3) {
    const cx = Math.round(light.moon.x * width);
    const cy = Math.round(horizonY - 48 - Math.max(0, light.moon.alt) * 120);
    const r = 8;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (dx * dx + dy * dy <= r * r && (dx + 4) ** 2 + dy * dy > 20) pen.put(cx + dx, cy + dy, light.moon.color);
      }
    }
  }
  const cloud = tintSkyColor(light.cloud || [244, 248, 252], light, theme);
  const cr = rng(7);
  if (light.stars < 0.85) {
    for (let i = 0; i < 6; i += 1) {
      const cx = Math.floor(cr() * width);
      const cy = 24 + Math.floor(cr() * 96);
      for (let k = 0; k < 3; k += 1) {
        const ex = cx + Math.floor(cr() * 56) - 28;
        const ey = cy + Math.floor(cr() * 8) - 4;
        const rw = 12 + Math.floor(cr() * 16);
        pen.hline(ex - rw, ex + rw, ey, cloud);
        pen.hline(ex - rw + 6, ex + rw - 6, ey - 1, cloud);
        pen.hline(ex - rw + 10, ex + rw - 10, ey - 2, cloud);
      }
    }
  }

  const mountains = theme.mountains;
  const rock = mul(hex(mountains.rock), light.mountain);
  const rockS = mul(hex(mountains.rockShade), light.mountain);
  const snow = mul(hex(mountains.snow), light.snow);
  const snowS = mul(hex(mountains.snowShade), light.snow);
  const foot = mul(hex(mountains.foothill), light.mountain);
  const footS = mul(hex(mountains.foothillShade), light.mountain);
  ridge(pen, mountains.main, horizonY + 12, rock, rockS, snow, snowS, mountains.snowline);
  ridge(pen, mountains.foothills, horizonY + 32, foot, footS, snow, snowS, mountains.snowline);

  const ground = theme.ground;
  for (let y = horizonY; y < height; y += 1) {
    const t = y - horizonY;
    const raw = t < ground.farUntil ? hex(ground.far) : t < ground.midUntil ? hex(ground.mid) : hex(ground.near);
    const c = mul(raw, light.ambient);
    for (let x = 0; x < width; x += 1) {
      pen.put(x, y, (x * 3 + y * 5) % 17 === 0 ? mix(c, 0.86) : c);
    }
  }
  // Water sits on the prairie, outside the lots. The grid is a second
  // picture drawn on top, so a lake here shows beside the city and does
  // not cover a street. Denver has no lake, and this loop does not run.
  if (theme.lake) {
    const water = mul(hex(theme.lake.color), light.ambient);
    const shine = hex(theme.lake.shine);
    const y0 = Math.min(height - 1, 868);
    for (let y = y0; y < height; y += 1) {
      pen.span(0, width - 1, y, y % 5 === 0 ? shine : water);
    }
    for (let y = Math.min(y0, 520); y < y0; y += 1) {
      const x0 = Math.min(width - 1, 1100 + Math.floor((y - 520) * 0.15));
      pen.span(x0, width - 1, y, (x0 + y) % 7 === 0 ? shine : water);
    }
  }
}

function ridge(pen, spec, base, lit, shade, snowL, snowS, snowline) {
  const { width, height } = pen;
  const rand = rng(spec.seed);
  const peaks = [];
  for (let i = 0; i < 7; i += 1) {
    peaks.push({
      x: ((i + 0.3 + rand() * 0.4) * width) / 7,
      h: 0.45 + rand() * 0.55,
      w: 0.08 + rand() * 0.08,
    });
  }
  for (let x = 0; x < width; x += 1) {
    let env = 0;
    for (const pk of peaks) env = Math.max(env, pk.h - Math.abs(x - pk.x) / width / pk.w);
    const h = spec.hmin + (spec.hmax - spec.hmin) * Math.max(0, Math.min(1, env));
    const top = Math.round(base - h);
    const litSide = Math.sin(x * 0.05 + spec.seed) > 0;
    for (let y = Math.max(0, top); y < Math.min(height, base + 16); y += 1) {
      const alt = base - y;
      const snowy = alt > snowline && y - top < 8 + (alt - snowline) * 0.15;
      pen.put(x, y, snowy ? (litSide ? snowL : snowS) : litSide ? lit : shade);
    }
  }
}

function paintLots(pen, city, light, theme) {
  const ambient = light.ambient.map((v) => Math.max(0.25, Math.min(1.15, v)));
  const night = light.windowLight > 0.35;
  const streets = theme.drawStreets || drawStreets;
  streets(pen, city, theme, ambient, night);

  const items = [];
  for (const b of city.buildings) items.push({ k: b.x + b.y, draw: () => theme.drawBuilding(pen, b, ambient, night) });
  for (const p of city.parks) items.push({ k: p.x + p.y + 0.01, draw: () => theme.drawPark(pen, p) });
  for (const l of city.landmarks) {
    if (l.key === "capitol") continue;
    items.push({ k: l.x + l.y + 0.02, draw: () => theme.drawLandmark(pen, l, ambient, night) });
  }
  for (const q of city.sideQuests) items.push({ k: q.x + q.y + 0.5, draw: () => theme.drawQuest(pen, q, ambient) });
  items.sort((a, b) => a.k - b.k);
  for (const item of items) item.draw();
}

export function paintScenePixels(city, light, options = {}) {
  const theme = themeFor(options.theme || city.theme || "Denver");
  const data = new Uint8ClampedArray(SCENE_W * SCENE_H * 4);
  const pen = createPen(data, SCENE_W, SCENE_H);
  if (!options.gridOnly) skyAndLand(pen, light, theme);
  paintLots(pen, city, light, theme);
  return data;
}

// Streets, lawns, and the lip under the diamond. No buildings. This picture
// stays at the back. Buildings are separate sprites so a tower in front of
// a car can cover the car.
export function paintGroundPixels(city, light, options = {}) {
  const theme = themeFor(options.theme || city.theme || "Denver");
  const data = new Uint8ClampedArray(SCENE_W * SCENE_H * 4);
  const pen = createPen(data, SCENE_W, SCENE_H);
  const ambient = light.ambient.map((v) => Math.max(0.25, Math.min(1.15, v)));
  const night = light.windowLight > 0.35;
  const streets = theme.drawStreets || drawStreets;
  streets(pen, city, theme, ambient, night);
  return data;
}

// How far in front something is. Larger means closer to the camera, and
// it is drawn later so it covers what is behind it. u + v is the same sum
// the painter already sorts by. A building's depth is its front corner,
// the edge nearest the camera, not the back corner: a car on the street
// behind that edge has a smaller sum and ends up behind the walls.
export function moverDepth(u, v) {
  return u + v;
}

export function propDepth(x, y, span = 1) {
  return x + y + span * 2;
}

// One graphics object per whole number of depth. A car at 20.4 is drawn
// in bucket 20, whose zIndex sits after a building at 20 and before a
// building at 21. 64 covers the 22-tile map with room for a 2-lot quest.
export const DEPTH_BUCKETS = 64;

export function bucketIndex(depth) {
  if (!Number.isFinite(depth)) return 0;
  return Math.max(0, Math.min(DEPTH_BUCKETS - 1, Math.floor(depth)));
}

// The things that can stand in front of a car: buildings, landmarks,
// parks (the trees), and side quests. The capitol is a building, so it
// is not also in the landmark list.
export function listProps(city) {
  const props = [];
  for (const b of city.buildings || []) {
    props.push({
      id: `b:${b.id}`,
      depth: propDepth(b.x, b.y, 1),
      sig: `${b.type}:${b.status}:${b.storiesBuilt}:${b.variant ?? ""}`,
      draw(pen, theme, ambient, night) {
        theme.drawBuilding(pen, b, ambient, night);
      },
    });
  }
  for (const l of city.landmarks || []) {
    if (l.key === "capitol") continue;
    props.push({
      id: `l:${l.key}:${l.x}:${l.y}`,
      depth: propDepth(l.x, l.y, 1),
      sig: l.key,
      draw(pen, theme, ambient, night) {
        theme.drawLandmark(pen, l, ambient, night);
      },
    });
  }
  for (const p of city.parks || []) {
    props.push({
      id: `p:${p.x}:${p.y}:${p.name}`,
      depth: propDepth(p.x, p.y, 1),
      sig: p.name,
      draw(pen, theme) {
        theme.drawPark(pen, p);
      },
    });
  }
  for (const q of city.sideQuests || []) {
    props.push({
      id: `q:${q.name}`,
      depth: propDepth(q.x, q.y, 2),
      sig: q.name,
      draw(pen, theme, ambient) {
        theme.drawQuest(pen, q, ambient);
      },
    });
  }
  return props;
}

// One reused buffer for every prop. Cleared only where the last prop
// drew, so cutting 100 buildings out does not mean wiping a 1280×1000
// picture 100 times.
let scratchPen = null;
function propPen() {
  if (!scratchPen) {
    scratchPen = createPen(new Uint8ClampedArray(SCENE_W * SCENE_H * 4), SCENE_W, SCENE_H);
  }
  return scratchPen;
}

export function paintPropPixels(prop, light, themeName = "Denver") {
  const theme = themeFor(themeName);
  const pen = propPen();
  const ambient = light.ambient.map((v) => Math.max(0.25, Math.min(1.15, v)));
  const night = light.windowLight > 0.35;
  prop.draw(pen, theme, ambient, night);
  const rect = pen.dirtyRect();
  if (!rect) {
    pen.clearDirty();
    return null;
  }
  const copy = new Uint8ClampedArray(rect.w * rect.h * 4);
  const { data, width } = pen;
  for (let row = 0; row < rect.h; row += 1) {
    const src = ((rect.y + row) * width + rect.x) * 4;
    copy.set(data.subarray(src, src + rect.w * 4), row * rect.w * 4);
  }
  pen.clearDirty();
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h, data: copy };
}

export function paintBackdropPixels(light, themeName = "Denver") {
  const theme = themeFor(themeName);
  const data = new Uint8ClampedArray(SCENE_W * SCENE_H * 4);
  const pen = createPen(data, SCENE_W, SCENE_H);
  skyAndLand(pen, light, theme);
  return data;
}

export function fitBackdropExtras(extraTop, extraBottom, extraLeft, extraRight) {
  let top = Math.max(0, extraTop | 0);
  let bottom = Math.max(0, extraBottom | 0);
  let left = Math.max(0, extraLeft | 0);
  let right = Math.max(0, extraRight | 0);
  const trim = (a, b, limit) => {
    const over = a + b - limit;
    if (over <= 0) return [a, b];
    const cutA = Math.min(a, Math.ceil(over / 2));
    return [a - cutA, Math.max(0, b - (over - cutA))];
  };
  [left, right] = trim(left, right, MAX_TEXTURE - SCENE_W);
  [top, bottom] = trim(top, bottom, MAX_TEXTURE - SCENE_H);
  return { top, bottom, left, right };
}

// The same sky and prairie, with extra rows and columns so the texture
// reaches the edges of a tall or wide screen. The 1280×1000 picture stays
// in the middle and lines up with the grid.
export function paintExtendedBackdropPixels(light, extraTop, extraBottom, extraLeft, extraRight, themeName = "Denver") {
  const theme = themeFor(themeName);
  const { top, bottom, left, right } = fitBackdropExtras(extraTop, extraBottom, extraLeft, extraRight);
  const width = SCENE_W + left + right;
  const height = SCENE_H + top + bottom;
  const data = new Uint8ClampedArray(width * height * 4);
  const pen = createPen(data, width, height);
  const skyTop = tintSkyColor(light.sky[0], light, theme);
  for (let y = 0; y < top; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dither = y % 4 === 3 && (x + y) % 2 === 0;
      pen.put(x, y, dither ? skyTop.map((v) => Math.min(255, v + 8)) : skyTop);
    }
  }

  const ambient = light.ambient.map((v) => Math.max(0.25, Math.min(1.15, v)));
  const base = paintBackdropPixels(light, theme.id);
  for (let y = 0; y < SCENE_H; y += 1) {
    for (let x = 0; x < SCENE_W; x += 1) {
      const i = (y * SCENE_W + x) * 4;
      pen.put(x + left, y + top, [base[i], base[i + 1], base[i + 2]]);
    }
    if (y >= HORIZON_Y) {
      const t = y - HORIZON_Y;
      const ground = theme.ground;
      const raw = t < ground.farUntil ? hex(ground.far) : t < ground.midUntil ? hex(ground.mid) : hex(ground.near);
      const c = mul(raw, ambient);
      for (let x = 0; x < left; x += 1) pen.put(x, y + top, (x * 3 + y * 5) % 17 === 0 ? mix(c, 0.86) : c);
      for (let x = 0; x < right; x += 1) {
        const sx = left + SCENE_W + x;
        pen.put(sx, y + top, (sx * 3 + y * 5) % 17 === 0 ? mix(c, 0.86) : c);
      }
    } else {
      const leftEdge = [base[y * SCENE_W * 4], base[y * SCENE_W * 4 + 1], base[y * SCENE_W * 4 + 2]];
      const rightIndex = (y * SCENE_W + SCENE_W - 1) * 4;
      const rightEdge = [base[rightIndex], base[rightIndex + 1], base[rightIndex + 2]];
      for (let x = 0; x < left; x += 1) pen.put(x, y + top, leftEdge);
      for (let x = 0; x < right; x += 1) pen.put(left + SCENE_W + x, y + top, rightEdge);
    }
  }

  // Austin's lake already fills the bottom of the 1280×1000 picture. Keep
  // that water going so a tall phone does not put dry prairie under it.
  // Denver has no lake, so this stays the near prairie color.
  const ground = theme.lake ? mul(hex(theme.lake.color), ambient) : mul(hex(theme.ground.near), ambient);
  const shine = theme.lake ? hex(theme.lake.shine) : null;
  for (let y = 0; y < bottom; y += 1) {
    const sceneY = SCENE_H + y;
    const row = shine && sceneY % 5 === 0 ? shine : ground;
    for (let x = 0; x < width; x += 1) {
      pen.put(x, top + SCENE_H + y, shine ? row : (x * 3 + sceneY * 5) % 17 === 0 ? mix(ground, 0.86) : ground);
    }
  }
  return { data, width, height, top, bottom, left, right };
}

export function paintBackdrop(light, themeName) {
  return canvasFrom(paintBackdropPixels(light, themeName), SCENE_W, SCENE_H);
}

export function paintExtendedBackdrop(light, extraTop, extraBottom, extraLeft, extraRight, themeName) {
  const picture = paintExtendedBackdropPixels(light, extraTop, extraBottom, extraLeft, extraRight, themeName);
  return canvasFrom(picture.data, picture.width, picture.height);
}

export function paintScene(city, light, options = {}) {
  return canvasFrom(paintScenePixels(city, light, options), SCENE_W, SCENE_H);
}

export function sceneSignature(city, phase, themeName = "Denver") {
  if (!city) return "";
  const buildings = city.buildings.map((b) => `${b.id}:${b.status}:${b.storiesBuilt}`).join(";");
  const marks = city.landmarks.map((l) => l.key).join(",");
  const quests = city.sideQuests.map((q) => q.name).join(",");
  // Transit, streak vehicles, and pedestrians are left out on purpose.
  // CityView redraws them every frame on the overlay. A moving car or a
  // walker must not throw away the cached city texture. The theme is
  // included so swapping Denver for Austin repaints without a story change.
  return `${themeName}|${phase}|${buildings}|${marks}|${city.parks.length}|${quests}`;
}
