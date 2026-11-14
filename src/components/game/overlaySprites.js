// Sprites that move, drawn in the same picture pixels as the 1280×1000 scene.
//
// They are not one layer on top of every building. CityView keeps a
// graphics object per depth bucket, and layerFor(depth) is the bucket for
// that u + v. A building whose front corner is closer to the camera has
// a higher depth and is a sprite drawn after that bucket, so it covers
// the car. Pixi redraws only the buckets that have something in them.
// None of this is part of the cached ground texture.
//
// How fast they move is rules.vehicles.speedMultiplier (0.75) and
// rules.pedestrians.speedMultiplier (0.5). Those numbers are not in
// this file. The lap times below are the pace at multiplier 1. The
// yellow ultra bus and the light rail ignore the vehicle multiplier
// and keep their own lap times.
//
// The airplane is the exception. It flies in screen pixels, next to the
// quote banner, so it is not doubled with the city.

import rules from "@/lib/rules";
import { moverHidden } from "./moverOcclusion";
import { project, STORY } from "./sceneLayout";

const SHIRTS = [0xd62828, 0x1565c0, 0xfdd835, 0x2e7d32, 0xf57c00, 0x6a1b9a];
const CONFETTI = [0xfdd835, 0xd62828, 0xffffff, 0xf57c00, 0x43a047, 0x1e88e5];

const VEHICLE_LAP = { car: 6500, truck: 11000, bus: 9000, police: 7500 };
const WALKER_LAP_MS = 16000;
const WALKER_STEP_MS = 180;

function overlayPace(multiplier) {
  const value = Number(multiplier);
  return Number.isFinite(value) && value >= 0 ? value : 1;
}

function walkerPhase(seed, index) {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

export function transitRoad(piece, map) {
  const { tiles, period } = map;
  const lanes = [];
  for (let v = period; v < tiles; v += period) lanes.push({ axis: "h", fixed: v });
  for (let u = period; u < tiles; u += period) lanes.push({ axis: "v", fixed: u });
  const lane = lanes[piece.index % lanes.length];
  const lap = Math.floor(piece.index / lanes.length);
  return {
    ...lane,
    start: 1 + (lap % 3),
    end: Math.max(3, tiles - 2 - (lap % 2)),
  };
}

function pointOnRoad(span, t, z = 4) {
  const along = span.start + (span.end - span.start) * t;
  const u = span.axis === "h" ? along : span.fixed;
  const v = span.axis === "h" ? span.fixed : along;
  // Lifted a few picture pixels so the sprite sits just above the asphalt.
  const [x, y] = project(u, v, z);
  return { x, y, depth: u + v };
}

function pointOnEdge(span, t, side) {
  const along = span.start + (span.end - span.start) * t;
  const offset = side ? 0.38 : -0.28;
  const u = span.axis === "h" ? along : span.fixed + offset;
  const v = span.axis === "h" ? span.fixed + offset : along;
  const [x, y] = project(u, v, 2);
  return { x, y, depth: u + v };
}

function wheels(g, px, py, back, front) {
  g.rect(px + back, py, 4, 3).fill({ color: 0x212121 });
  g.rect(px + front, py, 4, 3).fill({ color: 0x212121 });
  g.rect(px + back + 1, py + 1, 2, 1).fill({ color: 0x9aa0a6 });
  g.rect(px + front + 1, py + 1, 2, 1).fill({ color: 0x9aa0a6 });
}

export function drawVehicle(g, x, y, type, blink) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (type === "truck") {
    g.rect(px - 14, py - 7, 14, 7).fill({ color: 0xc4a574 });
    g.rect(px - 14, py - 9, 14, 2).fill({ color: 0x8d6e4a });
    g.rect(px, py - 12, 8, 12).fill({ color: 0x37474f });
    g.rect(px + 2, py - 10, 4, 4).fill({ color: 0x9ad0f5 });
    wheels(g, px, py, -12, 2);
  } else if (type === "bus") {
    g.rect(px - 14, py - 8, 28, 8).fill({ color: 0x0d47a1 });
    g.rect(px - 14, py - 8, 28, 2).fill({ color: 0x1565c0 });
    g.rect(px - 10, py - 6, 4, 4).fill({ color: 0xfff3c4 });
    g.rect(px - 3, py - 6, 4, 4).fill({ color: 0xfff3c4 });
    g.rect(px + 4, py - 6, 4, 4).fill({ color: 0xfff3c4 });
    wheels(g, px, py, -10, 6);
  } else if (type === "police") {
    g.rect(px - 9, py - 6, 18, 6).fill({ color: 0xf5f5f5 });
    g.rect(px - 9, py - 6, 6, 6).fill({ color: 0x212121 });
    g.rect(px - 1, py - 5, 5, 3).fill({ color: 0x9ad0f5 });
    g.rect(px - 2, py - 9, 8, 3).fill({ color: blink ? 0xd62828 : 0x1e88e5 });
    g.rect(px + 2, py - 9, 4, 3).fill({ color: blink ? 0x1e88e5 : 0xd62828 });
    wheels(g, px, py, -7, 4);
  } else {
    g.rect(px - 9, py - 6, 18, 6).fill({ color: 0xc62828 });
    g.rect(px - 2, py - 10, 8, 4).fill({ color: 0x9ad0f5 });
    g.rect(px + 7, py - 5, 2, 2).fill({ color: 0xfff3c4 });
    wheels(g, px, py, -7, 4);
  }
}

export function drawWalker(g, x, y, frame, shirt) {
  const px = Math.round(x);
  const py = Math.round(y);
  g.rect(px, py - 14, 4, 4).fill({ color: 0xf1c27d });
  g.rect(px + 1, py - 12, 1, 1).fill({ color: 0x263238 });
  g.rect(px, py - 10, 4, 6).fill({ color: shirt });
  g.rect(px - 2, py - 9, 2, 4).fill({ color: shirt });
  if (frame) {
    g.rect(px - 1, py - 4, 2, 4).fill({ color: 0x263238 });
    g.rect(px + 3, py - 4, 2, 4).fill({ color: 0x263238 });
  } else {
    g.rect(px, py - 4, 2, 4).fill({ color: 0x263238 });
    g.rect(px + 2, py - 4, 2, 4).fill({ color: 0x263238 });
  }
}

export function drawPopulation(layerFor, city, now, occluders) {
  if (!city?.map) return;
  const vehicles = city.vehicles || [];
  const vehicleCap = rules.vehicles?.maxAnimated ?? 16;
  const vehiclePace = overlayPace(rules.vehicles?.speedMultiplier);
  const blink = Math.floor(now / 240) % 2;
  for (let i = 0; i < vehicles.length && i < vehicleCap; i += 1) {
    const vehicle = vehicles[i];
    const span = transitRoad(vehicle, city.map);
    const lap = VEHICLE_LAP[vehicle.type] || 8000;
    const t = ((now * vehiclePace) / lap + (vehicle.index || i) * 0.17) % 1;
    const at = pointOnRoad(span, t);
    if (moverHidden(occluders, at.x, at.y, at.depth, 16, 14)) continue;
    drawVehicle(layerFor(at.depth), at.x, at.y, vehicle.type, blink);
  }
  const people = city.pedestrians;
  const count = people?.count || 0;
  if (!count) return;
  const cap = Math.min(count, rules.pedestrians?.maxAnimated ?? 32);
  const seed = people.seed >>> 0;
  const walkPace = overlayPace(rules.pedestrians?.speedMultiplier);
  for (let i = 0; i < cap; i += 1) {
    const span = transitRoad({ index: i + 3 }, city.map);
    const phase = walkerPhase(seed, i);
    const raw = ((now * walkPace) / WALKER_LAP_MS + phase) % 1;
    const t = i % 3 === 0 ? 1 - raw : raw;
    const at = pointOnEdge(span, t, i % 2 === 0);
    if (moverHidden(occluders, at.x, at.y, at.depth)) continue;
    const frame = Math.floor((now * walkPace) / WALKER_STEP_MS + i) % 2;
    drawWalker(layerFor(at.depth), at.x, at.y, frame, SHIRTS[i % SHIRTS.length]);
  }
}

// Painted stripes and stop poles. They do not move, so CityView draws
// them once into a layer that sits under every building. The coach and
// the train are separate: those move, and they take a depth bucket.
export function drawTransitMarks(g, city) {
  g.clear();
  const pieces = city?.transit;
  if (!pieces?.length || !city.map) return;
  for (const piece of pieces) {
    const span = transitRoad(piece, city.map);
    if (piece.mode === "bike") {
      for (let i = 0; i < 16; i += 2) {
        const at = pointOnRoad(span, i / 16, 2);
        const x = Math.round(at.x);
        const y = Math.round(at.y);
        g.rect(x, y, 8, 3).fill({ color: 0x2e7d32 });
        g.rect(x + 2, y, 4, 2).fill({ color: 0xfdd835 });
      }
    } else if (piece.mode === "bus") {
      for (let i = 0; i <= 4; i += 1) {
        const at = pointOnRoad(span, i / 4, 2);
        const px = Math.round(at.x);
        const py = Math.round(at.y);
        g.rect(px - 1, py - 8, 3, 8).fill({ color: 0xf57c00 });
        g.rect(px - 4, py, 8, 3).fill({ color: 0xfdd835 });
      }
    } else {
      for (let i = 0; i <= 20; i += 1) {
        const at = pointOnRoad(span, i / 20, 2);
        g.rect(Math.round(at.x), Math.round(at.y), 4, 2).fill({ color: 0xd0d0d0 });
        g.rect(Math.round(at.x) + 6, Math.round(at.y) - 2, 3, 2).fill({ color: 0x9a9a9a });
      }
    }
  }
}

export function drawTransitMovers(layerFor, city, now, occluders) {
  const pieces = city?.transit;
  if (!pieces?.length || !city.map) return;
  for (const piece of pieces) {
    if (piece.mode === "bike") continue;
    const span = transitRoad(piece, city.map);
    if (piece.mode === "bus") {
      const t = (now / 9000 + piece.index * 0.17) % 1;
      const at = pointOnRoad(span, t);
      if (moverHidden(occluders, at.x, at.y, at.depth, 16, 14)) continue;
      const g = layerFor(at.depth);
      const px = Math.round(at.x);
      const py = Math.round(at.y);
      g.rect(px - 12, py - 10, 24, 8).fill({ color: 0xfdd835 });
      g.rect(px - 12, py - 10, 24, 2).fill({ color: 0xf9a825 });
      g.rect(px - 6, py - 8, 4, 4).fill({ color: 0x1e88e5 });
      g.rect(px + 2, py - 8, 4, 4).fill({ color: 0x1e88e5 });
      wheels(g, px, py - 2, -8, 4);
    } else {
      const t = (now / 7000 + piece.index * 0.13) % 1;
      const at = pointOnRoad(span, t);
      if (moverHidden(occluders, at.x, at.y, at.depth, 16, 14)) continue;
      const g = layerFor(at.depth);
      const px = Math.round(at.x);
      const py = Math.round(at.y);
      g.rect(px - 12, py - 10, 26, 8).fill({ color: 0xd62828 });
      g.rect(px - 6, py - 8, 4, 4).fill({ color: 0xffffff });
      g.rect(px + 4, py - 8, 4, 4).fill({ color: 0xffffff });
      wheels(g, px, py - 2, -8, 8);
    }
  }
}

export function drawCrane(g, x, y, stories, bob) {
  g.clear();
  const base = project(x + 0.12, y + 0.12, 0);
  const top = project(x + 0.12, y + 0.12, stories * STORY + 36);
  const mastX = Math.round(base[0]);
  const topY = Math.round(top[1]);
  g.rect(mastX - 2, topY, 6, base[1] - topY).fill({ color: 0xf0c020 });
  g.rect(mastX + 2, topY, 2, base[1] - topY).fill({ color: 0xc89a10 });
  g.rect(mastX - 4, base[1] - 8, 12, 8).fill({ color: 0xf0c020 });
  const jib = mastX + 56 + bob;
  g.rect(mastX - 20, topY, jib - (mastX - 20), 4).fill({ color: 0xf0c020 });
  g.rect(mastX - 20, topY + 2, jib - (mastX - 20), 2).fill({ color: 0xc89a10 });
  g.moveTo(mastX, topY - 10).lineTo(jib, topY).stroke({ width: 2, color: 0xc89a10, pixelLine: true });
  g.moveTo(mastX, topY - 10).lineTo(mastX - 20, topY).stroke({ width: 2, color: 0xc89a10, pixelLine: true });
  g.rect(mastX - 26, topY + 2, 8, 6).fill({ color: 0x808080 });
  g.moveTo(jib - 10, topY + 4).lineTo(jib - 10, topY + 24).stroke({ width: 2, color: 0x404040, pixelLine: true });
  g.rect(jib - 16, topY + 24, 12, 4).fill({ color: 0xf0c020 });
  g.rect(mastX - 2, topY - 14, 4, 4).fill({ color: 0xff3030 });
}

export function drawParade(layerFor, city, now, occluders) {
  if (!city?.map) return;
  const { tiles, period } = city.map;
  const v = period;
  const span = Math.max(1, tiles - 3);
  const lap = (now % rules.raceDay.paradeMs) / rules.raceDay.paradeMs;
  for (let i = 0; i < 6; i += 1) {
    const u = 1 + ((lap + i / 6) % 1) * span;
    const [x, y] = project(u, v, 6);
    if (moverHidden(occluders, x, y, u + v)) continue;
    const g = layerFor(u + v);
    const color = CONFETTI[i % CONFETTI.length];
    const px = Math.round(x);
    const py = Math.round(y);
    g.rect(px, py - 14, 6, 8).fill({ color });
    g.rect(px + 1, py - 18, 4, 4).fill({ color: 0xfdd835 });
  }
}

// Screen pixels, not city pixels. The banner it flies beside is also
// laid out in the page, so doubling this with the scene would make the
// plane the width of the phone.
export function drawPlane(g, x, y) {
  g.clear();
  const s = 3;
  const px = (dx, dy, w, h, color) => g.rect(x + dx * s, y + dy * s, w * s, h * s).fill({ color });
  px(0, 0, 22, 4, 0xffffff);
  px(4, 3, 12, 2, 0xd62828);
  px(6, -3, 8, 3, 0xfdd835);
  px(18, 0, 4, 3, 0x0d2a6b);
  px(22, 1, 3, 2, 0xf0c020);
}

export { CONFETTI };
