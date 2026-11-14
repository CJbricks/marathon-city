"use client";

// Shows the painted city. The sky, mountains, and prairie are one texture
// that stays put. The lots and buildings are a second texture, and only
// that one follows a drag or a pinch. Both start at the size from
// gridFit.js: the whole 640×500 picture fits inside the view, so a tall
// phone does not zoom the diamond off the sides. Pinching in past 1× snaps
// to 1, 2, 3… so the pixels stay square. Each snap keeps the picture pixel
// between the fingers under the fingers, then clamps the pan so the diamond
// cannot leave the screen. Zooming back to the opening fit recenters it.
// The crane, the plane, the parade, the transit lines, the streak vehicles,
// and the walkers are drawn on top of the grid. None of those call
// paintScene, so the skyline stays cached.

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { lightingAt, lightingAtMinutes } from "@/lib/lighting";
import rules from "@/lib/rules";
import { dustPuffs } from "./dust";
import { clampCityPan, gridPlacement, placeZoom, stepZoom } from "./gridFit";
import { HORIZON_Y, SCENE_H, SCENE_W, paintExtendedBackdrop, paintScene, project, sceneSignature } from "./pixelScene";

const DUST_LIGHT = 0xfff3c4;
const DUST_DARK = 0xc4a574;

function packRgb([r, g, b]) {
  return (r << 16) + (g << 8) + b;
}

// Flat color behind the detailed picture. It covers any gap the 640×500
// scene does not reach, with sky at the top and sandy ground at the bottom.
// horizonY is where that picture's own ground starts, so the flat sand
// meets the painted prairie instead of cutting across the mountains.
function drawFill(g, w, h, light, horizonY) {
  g.clear();
  const horizon = Math.round(Math.max(0, Math.min(h, horizonY)));
  g.rect(0, 0, w, h).fill({ color: packRgb(light.sky[0]) });
  if (horizon < h) {
    // Same tan as the painted prairie, including the time-of-day tint,
    // so a gap does not show up as a lighter stripe.
    const tint = light.ambient || [1, 1, 1];
    const sand = [0xc4, 0xb5, 0x6a].map((v, i) => Math.round(v * (tint[i] ?? 1)));
    g.rect(0, horizon, w, h - horizon).fill({ color: packRgb(sand) });
  }
}

function adoptTexture(sprite, canvas) {
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  const previous = sprite.texture;
  sprite.texture = texture;
  if (previous && previous !== Texture.EMPTY) previous.destroy(true);
}

const CONFETTI = [0xfdd835, 0xd62828, 0xffffff, 0xf57c00, 0x43a047, 0x1e88e5];

// ?time=22:00 previews a clock hour without waiting for it. The live view
// still uses the device clock when the query is absent.
function viewClock() {
  const q = new URLSearchParams(window.location.search).get("time");
  if (q && /^\d{1,2}:\d{2}$/.test(q)) {
    const [h, m] = q.split(":").map(Number);
    return lightingAtMinutes(h * 60 + m);
  }
  return lightingAt(new Date());
}

function drawCrane(g, x, y, stories, bob) {
  g.clear();
  const base = project(x + 0.12, y + 0.12, 0);
  const top = project(x + 0.12, y + 0.12, stories * 3 + 18);
  const mastX = Math.round(base[0]);
  const topY = Math.round(top[1]);
  g.moveTo(mastX, base[1]).lineTo(mastX, topY).stroke({ width: 2, color: 0xf0c020, pixelLine: true });
  g.moveTo(mastX + 1, base[1]).lineTo(mastX + 1, topY).stroke({ width: 1, color: 0xc89a10, pixelLine: true });
  const jib = mastX + 28 + bob;
  g.moveTo(mastX - 10, topY).lineTo(jib, topY).stroke({ width: 2, color: 0xf0c020, pixelLine: true });
  g.moveTo(mastX, topY - 6).lineTo(jib, topY).stroke({ width: 1, color: 0xc89a10, pixelLine: true });
  g.moveTo(mastX, topY - 6).lineTo(mastX - 10, topY).stroke({ width: 1, color: 0xc89a10, pixelLine: true });
  g.rect(mastX - 12, topY + 1, 4, 3).fill({ color: 0x808080 });
  g.moveTo(jib - 6, topY).lineTo(jib - 6, topY + 12).stroke({ width: 1, color: 0x404040, pixelLine: true });
  g.rect(jib - 8, topY + 12, 4, 2).fill({ color: 0xf0c020 });
  g.rect(mastX, topY - 8, 2, 2).fill({ color: 0xff3030 });
}

function drawPlane(g, x, y) {
  g.clear();
  const s = 3;
  const px = (dx, dy, w, h, color) => g.rect(x + dx * s, y + dy * s, w * s, h * s).fill({ color });
  px(0, 0, 22, 4, 0xffffff);
  px(4, 3, 12, 2, 0xd62828);
  px(6, -3, 8, 3, 0xfdd835);
  px(18, 0, 4, 3, 0x0d2a6b);
  px(22, 1, 3, 2, 0xf0c020);
}

// Each unlocked ultra owns one existing road. The mode list in rules.js
// decides bike, bus, or light rail, and the index picks which road so a
// later ultra does not sit on the same stripe.
function transitRoad(piece, map) {
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

function pointOnRoad(span, t) {
  const along = span.start + (span.end - span.start) * t;
  const u = span.axis === "h" ? along : span.fixed;
  const v = span.axis === "h" ? span.fixed : along;
  return project(u, v, 2);
}

// Same road, shifted onto the sidewalk. A horizontal road moves in v, a
// vertical road moves in u, so the walker is beside the lane instead of
// under the cars.
function pointOnEdge(span, t, side) {
  const along = span.start + (span.end - span.start) * t;
  const offset = side ? 0.38 : -0.28;
  const u = span.axis === "h" ? along : span.fixed + offset;
  const v = span.axis === "h" ? span.fixed + offset : along;
  return project(u, v, 1);
}

const SHIRTS = [0xd62828, 0x1565c0, 0xfdd835, 0x2e7d32, 0xf57c00, 0x6a1b9a];
// One trip along a road, in milliseconds, at speedMultiplier 1.
// A larger lap is a slower vehicle. rules.vehicles.speedMultiplier scales
// all four (car, truck, streak bus, police). The ultra lines do not use it.
const VEHICLE_LAP = { car: 6500, truck: 11000, bus: 9000, police: 7500 };
// One sidewalk crossing, and one frame of the two-frame walk, at
// speedMultiplier 1. The pedestrian multiplier scales both, so the feet
// and the travel slow down together.
const WALKER_LAP_MS = 16000;
const WALKER_STEP_MS = 180;
// About 18% of finger spread is one click on the zoom ladder. A smaller
// wobble is ignored so a shaky pinch does not skip a step.
const PINCH_STEP_RATIO = 1.18;

// 1 is the pace the lap times were drawn for. Smaller is slower. A missing
// or nonsense value keeps the original pace instead of parking everyone at NaN.
function overlayPace(multiplier) {
  const value = Number(multiplier);
  return Number.isFinite(value) && value >= 0 ? value : 1;
}

// One number from the walk rows, mixed with the walker's index. The same
// activities always put the same person on the same sidewalk.
function walkerPhase(seed, index) {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

function drawVehicle(g, x, y, type, blink) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (type === "truck") {
    g.rect(px - 6, py - 3, 7, 3).fill({ color: 0xc4a574 });
    g.rect(px + 1, py - 5, 4, 5).fill({ color: 0x37474f });
    g.rect(px + 2, py - 4, 2, 2).fill({ color: 0x9ad0f5 });
  } else if (type === "bus") {
    // Navy city bus. The ultra-unlock bus is the yellow coach with stop
    // poles, drawn by drawTransit. This one has no poles and no yellow body.
    g.rect(px - 6, py - 4, 12, 4).fill({ color: 0x0d47a1 });
    g.rect(px - 4, py - 3, 2, 2).fill({ color: 0xfff3c4 });
    g.rect(px - 1, py - 3, 2, 2).fill({ color: 0xfff3c4 });
    g.rect(px + 2, py - 3, 2, 2).fill({ color: 0xfff3c4 });
  } else if (type === "police") {
    g.rect(px - 4, py - 3, 8, 3).fill({ color: 0xf5f5f5 });
    g.rect(px - 4, py - 3, 3, 3).fill({ color: 0x212121 });
    g.rect(px, py - 5, 2, 2).fill({ color: blink ? 0xd62828 : 0x1e88e5 });
  } else {
    g.rect(px - 4, py - 3, 8, 3).fill({ color: 0xc62828 });
    g.rect(px - 1, py - 5, 3, 2).fill({ color: 0x9ad0f5 });
  }
  g.rect(px - 3, py, 2, 1).fill({ color: 0x212121 });
  g.rect(px + 2, py, 2, 1).fill({ color: 0x212121 });
}

function drawWalker(g, x, y, frame, shirt) {
  const px = Math.round(x);
  const py = Math.round(y);
  g.rect(px, py - 7, 2, 2).fill({ color: 0xf1c27d });
  g.rect(px, py - 5, 2, 3).fill({ color: shirt });
  if (frame) {
    g.rect(px - 1, py - 2, 1, 2).fill({ color: 0x263238 });
    g.rect(px + 2, py - 2, 1, 2).fill({ color: 0x263238 });
  } else {
    g.rect(px, py - 2, 1, 2).fill({ color: 0x263238 });
    g.rect(px + 1, py - 2, 1, 2).fill({ color: 0x263238 });
  }
}

// One Graphics object is the pool. clear() each frame, then redraw at most
// maxAnimated of each. The city remembers the full counts. Drawing hundreds
// of sprites, or baking them into the texture, would repaint the skyline
// every time a foot moved.
function drawPopulation(g, city, now) {
  g.clear();
  if (!city?.map) return;
  const vehicles = city.vehicles || [];
  const vehicleCap = rules.vehicles?.maxAnimated ?? 16;
  // Streak traffic only. drawTransit keeps its own laps for the ultra bus
  // and the light rail, so this knob does not slow those.
  const vehiclePace = overlayPace(rules.vehicles?.speedMultiplier);
  const blink = Math.floor(now / 240) % 2;
  for (let i = 0; i < vehicles.length && i < vehicleCap; i++) {
    const vehicle = vehicles[i];
    const span = transitRoad(vehicle, city.map);
    const lap = VEHICLE_LAP[vehicle.type] || 8000;
    // The phase offset stays a fraction of the lap. Only the clock is
    // scaled, so editing speedMultiplier changes pace and not the spawn slot.
    const t = ((now * vehiclePace) / lap + (vehicle.index || i) * 0.17) % 1;
    const [x, y] = pointOnRoad(span, t);
    drawVehicle(g, x, y, vehicle.type, blink);
  }
  const people = city.pedestrians;
  const count = people?.count || 0;
  if (!count) return;
  const cap = Math.min(count, rules.pedestrians?.maxAnimated ?? 32);
  const seed = people.seed >>> 0;
  const walkPace = overlayPace(rules.pedestrians?.speedMultiplier);
  for (let i = 0; i < cap; i++) {
    const span = transitRoad({ index: i + 3 }, city.map);
    const phase = walkerPhase(seed, i);
    const raw = ((now * walkPace) / WALKER_LAP_MS + phase) % 1;
    const t = i % 3 === 0 ? 1 - raw : raw;
    const [x, y] = pointOnEdge(span, t, i % 2 === 0);
    const frame = Math.floor((now * walkPace) / WALKER_STEP_MS + i) % 2;
    drawWalker(g, x, y, frame, SHIRTS[i % SHIRTS.length]);
  }
}

function drawTransit(g, city, now) {
  g.clear();
  const pieces = city?.transit;
  if (!pieces?.length || !city.map) return;
  for (const piece of pieces) {
    const span = transitRoad(piece, city.map);
    if (piece.mode === "bike") {
      for (let i = 0; i < 16; i += 2) {
        const [x, y] = pointOnRoad(span, i / 16);
        g.rect(Math.round(x), Math.round(y), 4, 2).fill({ color: 0x2e7d32 });
        g.rect(Math.round(x) + 1, Math.round(y), 2, 1).fill({ color: 0xfdd835 });
      }
    } else if (piece.mode === "bus") {
      for (let i = 0; i <= 4; i++) {
        const [x, y] = pointOnRoad(span, i / 4);
        g.rect(Math.round(x) - 1, Math.round(y) - 4, 2, 4).fill({ color: 0xf57c00 });
        g.rect(Math.round(x) - 2, Math.round(y), 4, 2).fill({ color: 0xfdd835 });
      }
      // This lap is the yellow ultra coach. It is not rules.vehicles.speedMultiplier.
      const t = (now / 9000 + piece.index * 0.17) % 1;
      const [x, y] = pointOnRoad(span, t);
      g.rect(Math.round(x) - 4, Math.round(y) - 5, 8, 4).fill({ color: 0xfdd835 });
      g.rect(Math.round(x) - 2, Math.round(y) - 4, 2, 2).fill({ color: 0x1e88e5 });
    } else {
      for (let i = 0; i <= 20; i++) {
        const [x, y] = pointOnRoad(span, i / 20);
        g.rect(Math.round(x), Math.round(y), 2, 1).fill({ color: 0xd0d0d0 });
        g.rect(Math.round(x) + 3, Math.round(y) - 1, 2, 1).fill({ color: 0x9a9a9a });
      }
      // Light rail keeps its own lap too. The streak speed knob does not apply.
      const t = (now / 7000 + piece.index * 0.13) % 1;
      const [x, y] = pointOnRoad(span, t);
      g.rect(Math.round(x) - 5, Math.round(y) - 6, 12, 4).fill({ color: 0xd62828 });
      g.rect(Math.round(x) - 3, Math.round(y) - 5, 2, 2).fill({ color: 0xffffff });
      g.rect(Math.round(x) + 2, Math.round(y) - 5, 2, 2).fill({ color: 0xffffff });
    }
  }
}

function drawParade(g, city, now) {
  g.clear();
  if (!city?.map) return;
  const { tiles, period } = city.map;
  const v = period;
  const span = Math.max(1, tiles - 3);
  const lap = (now % rules.raceDay.paradeMs) / rules.raceDay.paradeMs;
  for (let i = 0; i < 6; i++) {
    const u = 1 + ((lap + i / 6) % 1) * span;
    const [x, y] = project(u, v, 3);
    const color = CONFETTI[i % CONFETTI.length];
    g.rect(Math.round(x), Math.round(y) - 7, 3, 4).fill({ color });
    g.rect(Math.round(x) + 1, Math.round(y) - 9, 2, 2).fill({ color: 0xfdd835 });
  }
}

export default function CityView({ city, fx, celebrate }) {
  const hostRef = useRef(null);
  const stateRef = useRef({ city, fx, celebrate });

  useEffect(() => {
    stateRef.current = { city, fx, celebrate };
  }, [city, fx, celebrate]);

  useEffect(() => {
    const host = hostRef.current;
    let dead = false;
    let application;
    const pointers = new Map();
    // The picture pixel between the fingers, remembered for the whole pinch.
    // Scale steps re-anchor that pixel. It is cleared when one finger lifts.
    let pinch = null;
    let painted = "";
    let texBytes = 0;
    let frames = 0;
    let fpsStamp = performance.now();

    const boot = async () => {
      application = new Application();
      await application.init({
        background: 0x5b8fd6,
        resizeTo: host,
        antialias: false,
        preference: "webgl",
        roundPixels: true,
        // CSS pixels, not device pixels. autoDensity writes the canvas
        // style so Safari cannot display the bitmap at three times the
        // width and letterbox it in the middle of the phone.
        resolution: 1,
        autoDensity: true,
      });
      if (dead) {
        try {
          application.destroy(true, { children: true });
        } catch {
          // Init finished after unmount. Nothing on screen to keep.
        }
        return;
      }
      // touch-action: none is also in globals.css. Both are set because
      // iOS Safari will scale the page on a pinch if the canvas itself
      // does not opt out. gesturestart / gesturechange below are the
      // other half of that: preventDefault stops the browser zoom that
      // touch-action does not catch on every iPhone OS.
      application.canvas.style.touchAction = "none";
      application.canvas.style.imageRendering = "pixelated";
      host.appendChild(application.canvas);

      const fill = new Graphics();
      const backdrop = new Container();
      const skySprite = new Sprite(Texture.EMPTY);
      backdrop.addChild(skySprite);
      const world = new Container();
      const citySprite = new Sprite(Texture.EMPTY);
      const crane = new Graphics();
      const dust = new Graphics();
      // Parade lives in scene space so it follows the street when you pan,
      // but it is not part of the cached city texture.
      const parade = new Graphics();
      const transit = new Graphics();
      // Vehicles and walkers share one graphics object. It is cleared every
      // frame. It is not a child of the cached city sprite.
      const population = new Graphics();
      world.addChild(citySprite, transit, population, crane, dust, parade);
      const screenFx = new Graphics();
      application.stage.addChild(fill, backdrop, world, screenFx);
      const bits = [];

      // Contain, not cover. Covering a tall phone scaled the diamond up
      // until both corners left the 390px width. gridPlacement fits the
      // picture inside the view instead. The backdrop is placed once per
      // resize and then stays. Only `world` is dragged and pinched.
      // `placed` stays the contain-fit. `zoom` is the grid scale, which
      // steps through whole numbers once the user goes past 1×. The pan
      // is not left behind when that scale jumps: placeZoom keeps the
      // focal pixel under the fingers, and clampCityPan runs after every
      // zoom and every drag.
      let placed = gridPlacement(application.screen.width, application.screen.height);
      let zoom = placed.scale;
      let panX = placed.x;
      let panY = placed.y;
      const applyPlace = (container) => {
        container.scale.set(placed.scale);
        container.position.set(placed.x, placed.y);
      };
      const placeWorld = () => {
        world.scale.set(zoom);
        // At 2× and up, a fractional camera makes nearest-neighbor pixels
        // shimmer. The pan itself keeps the fraction so a slow drag still
        // adds up, and so the next focal-point solve stays exact. Only
        // the position we hand to Pixi is rounded, by less than one pixel.
        if (Number.isInteger(zoom)) world.position.set(Math.round(panX), Math.round(panY));
        else world.position.set(panX, panY);
        // Same idea as dataset.fps below: a readout of the camera, so a
        // pinch test can see the scale without reaching into Pixi.
        host.dataset.gridScale = String(zoom);
        host.dataset.gridX = String(panX);
        host.dataset.gridY = String(panY);
      };
      const fit = () => {
        placed = gridPlacement(application.screen.width, application.screen.height);
        applyPlace(backdrop);
        zoom = placed.scale;
        panX = placed.x;
        panY = placed.y;
        placeWorld();
      };
      fit();
      application.renderer.on("resize", fit);
      const observer = new ResizeObserver(() => {
        const rect = host.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        if (w !== application.screen.width || h !== application.screen.height) {
          application.renderer.resize(w, h);
        }
      });
      observer.observe(host);

      let skyKey = "";
      let fillKey = "";
      const upload = (live, light) => {
        const sig = sceneSignature(live, light.phase);
        if (sig === painted) return;
        painted = sig;
        adoptTexture(citySprite, paintScene(live, light, { gridOnly: true }));
        texBytes = SCENE_W * SCENE_H * 4;
        host.dataset.texBytes = String(texBytes);
      };

      const paint = () => {
        const { city: live, fx: liveFx } = stateRef.current;
        const shown = liveFx?.city || live;
        if (!shown) return;
        const light = viewClock();
        const [r, g, b] = light.sky[0];
        application.renderer.background.color = (r << 16) + (g << 8) + b;
        const key = `${light.phase}|${Math.round(application.screen.width)}|${Math.round(application.screen.height)}|${Math.round(placed.y)}|${placed.scale.toFixed(4)}`;
        if (key !== fillKey) {
          fillKey = key;
          drawFill(
            fill,
            application.screen.width,
            application.screen.height,
            light,
            placed.y + HORIZON_Y * placed.scale,
          );
        }
        // Grow the pinned picture until it covers the screen, but keep the
        // original 640×500 block on the same spot as the grid. A drag moves
        // the grid only. The extra sky and ground stay here.
        const extraTop = Math.ceil(Math.max(0, placed.y) / placed.scale);
        const extraBottom = Math.ceil(
          Math.max(0, application.screen.height - (placed.y + SCENE_H * placed.scale)) / placed.scale,
        );
        const extraLeft = Math.ceil(Math.max(0, placed.x) / placed.scale);
        const extraRight = Math.ceil(
          Math.max(0, application.screen.width - (placed.x + SCENE_W * placed.scale)) / placed.scale,
        );
        const nextSky = `${light.phase}|${extraTop}|${extraBottom}|${extraLeft}|${extraRight}`;
        if (nextSky !== skyKey) {
          skyKey = nextSky;
          adoptTexture(skySprite, paintExtendedBackdrop(light, extraTop, extraBottom, extraLeft, extraRight));
          skySprite.position.set(-extraLeft, -extraTop);
        }
        upload(shown, light);
        const site = liveFx?.crane || shown.buildings.find((building) => building.status === "in_progress");
        if (site) {
          const bob = Math.round(Math.sin(performance.now() / 420) * 2);
          const stories = site.stories ?? site.targetStories ?? site.storiesBuilt ?? 2;
          drawCrane(crane, site.x, site.y, stories, bob);
          dust.clear();
          if (liveFx?.dust) {
            const puffs = dustPuffs(performance.now(), {
              west: project(site.x, site.y + 1, 0),
              east: project(site.x + 1, site.y, 0),
              south: project(site.x + 1, site.y + 1, 0),
            });
            for (const puff of puffs) {
              if (!puff.s) continue;
              dust.rect(puff.x, puff.y, puff.s, puff.s).fill({ color: puff.tone ? DUST_DARK : DUST_LIGHT });
              // A second pixel makes the speck read as a puff instead of a dot
              // on the pavement. Still a rectangle, still the same eight slots.
              if (!puff.tone) dust.rect(puff.x + 3, puff.y - 2, 2, 2).fill({ color: 0xfff6d0 });
            }
          }
        } else {
          crane.clear();
          dust.clear();
        }
        const celebrating = stateRef.current.celebrate;
        const frameNow = performance.now();
        drawTransit(transit, shown, frameNow);
        drawPopulation(population, shown, frameNow);
        parade.clear();
        if (celebrating) drawParade(parade, shown, performance.now());
        screenFx.clear();
        if (liveFx?.plane) {
          const w = application.screen.width;
          // Sit just to the right of the quote banner, which uses the same progress.
          const x = w * (0.06 + liveFx.plane.progress * 0.5) + 160;
          const y = application.screen.height * 0.12 + Math.round(Math.sin(liveFx.plane.progress * 10) * 4);
          drawPlane(screenFx, x, y);
        }
        if (celebrating) {
          const w = application.screen.width;
          const h = application.screen.height;
          const count = rules.raceDay.confetti;
          while (bits.length < count) {
            bits.push({
              x: Math.random() * w,
              y: Math.random() * h,
              vy: 0.8 + Math.random() * 1.4,
              c: CONFETTI[bits.length % CONFETTI.length],
            });
          }
          for (const bit of bits) {
            bit.y += bit.vy;
            bit.x += Math.sin(bit.y * 0.08) * 0.4;
            if (bit.y > h) {
              bit.y = -4;
              bit.x = Math.random() * w;
            }
            screenFx.rect(Math.round(bit.x), Math.round(bit.y), 3, 3).fill({ color: bit.c });
          }
        }
        frames += 1;
        const now = performance.now();
        if (now - fpsStamp > 1000) {
          host.dataset.fps = String(frames);
          frames = 0;
          fpsStamp = now;
        }
      };
      application.ticker.add(paint);

      const canvas = application.canvas;
      // Pointer events are in page coordinates. The grid's pan is in
      // canvas pixels, and the canvas is not always at the top of the page
      // (the bottom bar sits under it). Subtract the canvas origin so the
      // focal point is the pixel the fingers are actually on.
      const canvasPoint = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      };
      const viewSize = () => ({
        screenW: application.screen.width,
        screenH: application.screen.height,
      });
      // scene, when passed, is the picture pixel a pinch is holding. Omit
      // it and the pixel currently under the focal point is the one held
      // (a mouse-wheel notch). Landing on the opening fit recenters.
      const applyZoom = (nextZoom, focal, scene) => {
        const next = placeZoom({
          panX,
          panY,
          zoom,
          nextZoom,
          focalX: focal.x,
          focalY: focal.y,
          sceneX: scene?.x,
          sceneY: scene?.y,
          fitScale: placed.scale,
          fitX: placed.x,
          fitY: placed.y,
          ...viewSize(),
        });
        zoom = next.zoom;
        panX = next.panX;
        panY = next.panY;
        placeWorld();
      };
      const applyPan = () => {
        const next = clampCityPan({ panX, panY, zoom, ...viewSize() });
        panX = next.panX;
        panY = next.panY;
        placeWorld();
      };
      const down = (event) => {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      };
      const move = (event) => {
        const prev = pointers.get(event.pointerId);
        if (!prev) return;
        if (event.cancelable) event.preventDefault();
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const pts = [...pointers.values()];
        if (pts.length >= 2) {
          const a = canvasPoint(pts[0].x, pts[0].y);
          const b = canvasPoint(pts[1].x, pts[1].y);
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const focal = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (!pinch) {
            // First sample of this pinch. Remember the picture pixel
            // between the fingers. Later snaps put that pixel back here,
            // even when the scale jumps from the phone fit to 2×.
            pinch = {
              dist: Math.max(dist, 1),
              sceneX: (focal.x - panX) / zoom,
              sceneY: (focal.y - panY) / zoom,
            };
            return;
          }
          const ratio = dist / pinch.dist;
          let nextZoom = zoom;
          if (ratio >= PINCH_STEP_RATIO) {
            nextZoom = stepZoom(zoom, placed.scale, 1);
            pinch.dist = dist;
          } else if (ratio <= 1 / PINCH_STEP_RATIO) {
            nextZoom = stepZoom(zoom, placed.scale, -1);
            pinch.dist = dist;
          }
          const atFit = Math.abs(zoom - placed.scale) <= 1e-4;
          if (nextZoom !== zoom) {
            applyZoom(nextZoom, focal, { x: pinch.sceneX, y: pinch.sceneY });
          } else if (!atFit) {
            // Fingers slid without spreading enough to change scale.
            // Keep the same sidewalk under the midpoint. The fit scale
            // stays centered; a one-finger drag is what pans it.
            const aimedX = panX + pinch.sceneX * zoom;
            const aimedY = panY + pinch.sceneY * zoom;
            if (Math.hypot(focal.x - aimedX, focal.y - aimedY) > 0.5) {
              applyZoom(zoom, focal, { x: pinch.sceneX, y: pinch.sceneY });
            }
          }
        } else {
          pinch = null;
          panX += event.clientX - prev.x;
          panY += event.clientY - prev.y;
          applyPan();
        }
      };
      const up = (event) => {
        pointers.delete(event.pointerId);
        if (pointers.size < 2) pinch = null;
      };
      let wheelAt = 0;
      const wheel = (event) => {
        event.preventDefault();
        const now = performance.now();
        // A trackpad fires a burst of wheel events for one flick. Taking
        // every event would jump from the fit scale to the cap.
        if (now - wheelAt < 180) return;
        wheelAt = now;
        const nextZoom = stepZoom(zoom, placed.scale, event.deltaY > 0 ? -1 : 1);
        if (nextZoom === zoom) return;
        applyZoom(nextZoom, canvasPoint(event.clientX, event.clientY));
      };
      // iOS Safari fires these for a pinch and will zoom the page unless
      // preventDefault runs. They are not pointer events, so the listener
      // has to be its own. passive: false is what allows preventDefault.
      const stopBrowserPinch = (event) => {
        event.preventDefault();
      };
      const gestureTargets = [canvas, host, document];
      const gestureOpts = { passive: false, capture: true };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
      canvas.addEventListener("wheel", wheel, { passive: false });
      for (const target of gestureTargets) {
        target.addEventListener("gesturestart", stopBrowserPinch, gestureOpts);
        target.addEventListener("gesturechange", stopBrowserPinch, gestureOpts);
      }
      host.cleanup = () => {
        observer.disconnect();
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", up);
        canvas.removeEventListener("wheel", wheel);
        for (const target of gestureTargets) {
          target.removeEventListener("gesturestart", stopBrowserPinch, gestureOpts);
          target.removeEventListener("gesturechange", stopBrowserPinch, gestureOpts);
        }
      };
    };

    boot();
    return () => {
      dead = true;
      host.cleanup?.();
      // React strict mode runs this cleanup before init's await resolves.
      // Destroying a half-started app throws, and the next mount still works.
      try {
        if (application?.renderer) application.destroy(true, { children: true });
      } catch {
        // Already gone.
      }
    };
  }, []);

  return <div className="city-canvas" ref={hostRef} />;
}
