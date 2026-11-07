"use client";

// Shows the painted city. The sky, mountains, and prairie are one texture
// that stays put. The lots and buildings are a second texture, and only
// that one follows a drag or a pinch. Both start at the same size: the
// fit() math below is the mobile grid size and is not used to stretch the
// city when the screen is tall. The crane, the plane, the parade, and the
// transit lines are drawn on top of the grid. A moving bus never calls
// paintScene, so the skyline stays cached.

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { lightingAt, lightingAtMinutes } from "@/lib/lighting";
import rules from "@/lib/rules";
import { dustPuffs } from "./dust";
import { SCENE_H, SCENE_W, paintBackdrop, paintScene, project, sceneSignature } from "./pixelScene";

const DUST_LIGHT = 0xfff3c4;
const DUST_DARK = 0xc4a574;

function packRgb([r, g, b]) {
  return (r << 16) + (g << 8) + b;
}

// Flat color behind the detailed picture. It covers any gap the 640×500
// scene does not reach, with sky at the top and sandy ground at the bottom.
function drawFill(g, w, h, light) {
  g.clear();
  const horizon = Math.round(h * (168 / SCENE_H));
  g.rect(0, 0, w, h).fill({ color: packRgb(light.sky[0]) });
  if (horizon < h) g.rect(0, horizon, w, h - horizon).fill({ color: 0xc4b56a });
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
    let pinchDist = 0;
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
      world.addChild(citySprite, transit, crane, dust, parade);
      const screenFx = new Graphics();
      application.stage.addChild(fill, backdrop, world, screenFx);
      const bits = [];

      // Same placement the city has always used on a phone: scale until the
      // 640×500 picture covers the view, then center it. The backdrop gets
      // this placement once per resize and then stays. Only `world` is
      // dragged and pinched, so the mountains do not follow the finger.
      const place = (container) => {
        const s = Math.max(application.screen.width / SCENE_W, application.screen.height / SCENE_H);
        container.scale.set(s);
        container.position.set(
          (application.screen.width - SCENE_W * s) / 2,
          (application.screen.height - SCENE_H * s) / 2,
        );
      };
      const fit = () => {
        place(backdrop);
        place(world);
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

      let skyPhase = "";
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
        const key = `${light.phase}|${Math.round(application.screen.width)}|${Math.round(application.screen.height)}`;
        if (key !== fillKey) {
          fillKey = key;
          drawFill(fill, application.screen.width, application.screen.height, light);
        }
        if (light.phase !== skyPhase) {
          skyPhase = light.phase;
          adoptTexture(skySprite, paintBackdrop(light));
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
        drawTransit(transit, shown, performance.now());
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
      const down = (event) => {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      };
      const move = (event) => {
        const prev = pointers.get(event.pointerId);
        if (!prev) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const pts = [...pointers.values()];
        if (pts.length >= 2) {
          const now = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (pinchDist) world.scale.set(Math.max(0.3, Math.min(6, world.scale.x * (now / pinchDist))));
          pinchDist = now;
        } else {
          pinchDist = 0;
          world.x += event.clientX - prev.x;
          world.y += event.clientY - prev.y;
        }
      };
      const up = (event) => pointers.delete(event.pointerId);
      const wheel = (event) => {
        event.preventDefault();
        world.scale.set(Math.max(0.3, Math.min(6, world.scale.x * (event.deltaY > 0 ? 0.9 : 1.1))));
      };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
      canvas.addEventListener("wheel", wheel, { passive: false });
      host.cleanup = () => {
        observer.disconnect();
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", up);
        canvas.removeEventListener("wheel", wheel);
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
