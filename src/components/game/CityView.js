"use client";

// The playable city. PixiJS draws it straight to a canvas: @pixi/react is
// not used, because that package is built for an older React reconciler
// than the one Next ships (see the README). This file is a Client Component
// because it owns a WebGL canvas, pointer events, and a render loop.
//
// The map is isometric, the same projection as prototype/render.py
// (tile 16×8, 3px per story). One sprite style per building type, recolored
// from the Nuggets palette. Landmarks get an extra shape on top. An idle
// crane sits on whatever lot is still under construction.

import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { lightingAt } from "@/lib/lighting";

const TW = 16;
const TH = 8;
const STORY = 3;

const COLORS = {
  rowhouse: { top: 0xc45a3a, left: 0x8a3018, right: 0xe07a55 },
  mixeduse: { top: 0xf57c00, left: 0xb85a00, right: 0xffb74d },
  office: { top: 0x5aa2ea, left: 0x0d47a1, right: 0x90caf9 },
  skyscraper: { top: 0xfdd835, left: 0x0d2a6b, right: 0x1e88e5 },
  state: { top: 0xeceff1, left: 0x607d8b, right: 0xcfd8dc },
  museum: { top: 0xe8501e, left: 0x6a1b1b, right: 0xff8a65 },
  capitol: { top: 0xfdd835, left: 0xb88a00, right: 0xfff59d },
};

function project(x, y, z = 0) {
  return [(x - y) * (TW / 2), (x + y) * (TH / 2) - z];
}

function polyAt(g, points, color) {
  g.poly(points.flat(), true).fill({ color });
}

function drawBox(g, x, y, stories, colors) {
  const z = Math.max(stories, 0) * STORY;
  const p = (dx, dy, h) => project(x + dx, y + dy, h);
  const a = p(0, 0, 0);
  const b = p(1, 0, 0);
  const c = p(1, 1, 0);
  const d = p(0, 1, 0);
  const A = p(0, 0, z);
  const B = p(1, 0, z);
  const C = p(1, 1, z);
  const D = p(0, 1, z);
  if (z > 0) {
    polyAt(g, [b, c, C, B], colors.right);
    polyAt(g, [d, c, C, D], colors.left);
  }
  polyAt(g, [A, B, C, D], colors.top);
  return C;
}

function drawCrane(g, x, y, stories, bob) {
  const [sx, sy] = project(x + 0.15, y + 0.15, stories * STORY);
  const topY = sy - 16;
  g.moveTo(sx, sy).lineTo(sx, topY).stroke({ width: 2, color: 0xd7d7d7 });
  g.moveTo(sx, topY).lineTo(sx + 14, topY + 2).stroke({ width: 2, color: 0xfdd835 });
  g.circle(sx + 14, topY + 6 + bob, 1.6).fill({ color: 0x9e9e9e });
}

function drawCity(g, city, light) {
  g.clear();
  if (!city) return;
  const { tiles, period } = city.map;
  const road = light.streetLights > 0.5 ? 0x3a3a22 : 0x3a3f36;
  const grass = 0x2e7d32;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const roadTile = x % period === 0 || y % period === 0;
      const [sx, sy] = project(x, y, 0);
      const [a1, a2] = project(x + 1, y, 0);
      const [b1, b2] = project(x + 1, y + 1, 0);
      const [c1, c2] = project(x, y + 1, 0);
      polyAt(g, [[sx, sy], [a1, a2], [b1, b2], [c1, c2]], roadTile ? road : grass);
    }
  }

  const items = [];
  for (const b of city.buildings) items.push({ key: b.x + b.y, draw: () => drawBuilding(g, b, light) });
  for (const p of city.parks) items.push({ key: p.x + p.y, draw: () => drawPark(g, p) });
  for (const q of city.sideQuests) items.push({ key: q.x + q.y + 0.5, draw: () => drawQuest(g, q) });
  for (const l of city.landmarks) {
    if (l.key === "capitol") continue;
    items.push({ key: l.x + l.y, draw: () => drawLandmark(g, l) });
  }
  items.sort((a, b) => a.key - b.key);
  for (const item of items) item.draw();
}

function drawBuilding(g, b, light) {
  const colors = COLORS[b.type] || COLORS.office;
  const stories = b.status === "complete" ? b.targetStories : Math.max(b.storiesBuilt, 0.2);
  drawBox(g, b.x, b.y, stories, colors);
  if (b.type === "capitol") {
    const [cx, cy] = project(b.x + 0.5, b.y + 0.5, stories * STORY + 6);
    g.circle(cx, cy, 5).fill({ color: 0xfdd835 });
  }
  if (light.windowLight > 0.35 && stories >= 1) {
    const floors = Math.min(6, Math.floor(stories));
    for (let i = 0; i < floors; i++) {
      const [wx, wy] = project(b.x + 0.35, b.y + 0.65, 3 + i * 4);
      g.rect(wx, wy, 2, 2).fill({ color: 0xfff3a0 });
    }
  }
}

function drawPark(g, p) {
  drawBox(g, p.x, p.y, 0.15, { top: 0x43a047, left: 0x2e7d32, right: 0x66bb6a });
  const [tx, ty] = project(p.x + 0.5, p.y + 0.45, 2);
  g.circle(tx, ty, 3).fill({ color: 0x1b5e20 });
}

function drawQuest(g, q) {
  drawBox(g, q.x, q.y, 1.2, { top: 0xfdd835, left: 0xb88a00, right: 0xfff59d });
  drawBox(g, q.x + 1, q.y, 0.8, { top: 0xd62828, left: 0x8a1c1c, right: 0xe8501e });
}

function drawLandmark(g, l) {
  if (l.key === "unionStation") {
    drawBox(g, l.x, l.y, 3, { top: 0xf5f5f5, left: 0x8d6e63, right: 0xd7ccc8 });
    const [sx, sy] = project(l.x + 0.5, l.y + 0.2, 12);
    g.rect(sx - 8, sy, 16, 3).fill({ color: 0xfdd835 });
  } else if (l.key === "courthouse") {
    drawBox(g, l.x, l.y, 4, { top: 0xeceff1, left: 0x546e7a, right: 0xcfd8dc });
  } else if (l.key === "artMuseum") {
    drawBox(g, l.x, l.y, 5, { top: 0xd62828, left: 0x4e342e, right: 0xffcc80 });
  } else if (l.key === "cathedral") {
    drawBox(g, l.x, l.y, 6, { top: 0xcfd8dc, left: 0x455a64, right: 0xb0bec5 });
    const [sx, sy] = project(l.x + 0.5, l.y + 0.5, 22);
    g.moveTo(sx, sy - 8).lineTo(sx - 4, sy).lineTo(sx + 4, sy).fill({ color: 0xeceff1 });
  } else {
    drawBox(g, l.x, l.y, 3, COLORS.state);
  }
}

function drawDust(g, x, y, stories) {
  const [sx, sy] = project(x + 0.6, y + 0.6, stories * STORY);
  g.circle(sx, sy, 3).fill({ color: 0xc4b08a, alpha: 0.8 });
  g.circle(sx + 5, sy - 2, 2).fill({ color: 0x8d7b63, alpha: 0.7 });
}

function drawPlane(g, x, y) {
  g.roundRect(x, y, 22, 6, 2).fill({ color: 0xffffff });
  g.rect(x + 6, y + 4, 10, 3).fill({ color: 0xd62828 });
  g.rect(x + 8, y - 3, 8, 3).fill({ color: 0xfdd835 });
  g.circle(x + 20, y + 3, 2).fill({ color: 0x0d2a6b });
}

export default function CityView({ city, fx }) {
  const hostRef = useRef(null);
  const appRef = useRef(null);
  const worldRef = useRef(null);
  const stateRef = useRef({ city, fx });
  // The ticker reads this ref from Pixi's loop, which is outside React.
  // Updating it during render is forbidden, so the effect copies props in
  // after each commit. The crane is at most one frame behind the new city.
  useEffect(() => {
    stateRef.current = { city, fx };
  }, [city, fx]);

  useEffect(() => {
    const host = hostRef.current;
    let dead = false;
    let application;
    const pointers = new Map();
    let pinchDist = 0;

    const boot = async () => {
      application = new Application();
      await application.init({
        background: 0x87b4e0,
        resizeTo: host,
        antialias: false,
        preference: "webgl",
        roundPixels: true,
      });
      if (dead) {
        application.destroy();
        return;
      }
      application.canvas.style.touchAction = "none";
      application.canvas.style.imageRendering = "pixelated";
      host.appendChild(application.canvas);
      const world = new Container();
      const ground = new Graphics();
      const fxLayer = new Graphics();
      world.addChild(ground, fxLayer);
      application.stage.addChild(world);
      appRef.current = application;
      worldRef.current = world;

      const fit = () => {
        if (!stateRef.current.city) return;
        const tiles = stateRef.current.city.map.tiles;
        const mapW = tiles * TW;
        const mapH = tiles * TH + 40;
        const s = Math.min(application.screen.width / (mapW + 16), application.screen.height / (mapH + 24));
        world.scale.set(Math.max(0.7, Math.min(s, 4)));
        world.position.set(application.screen.width / 2, application.screen.height * 0.16);
      };
      fit();

      const paint = () => {
        const { city: live, fx: liveFx } = stateRef.current;
        const shown = liveFx?.city || live;
        if (!shown) return;
        const light = lightingAt(new Date());
        const [r, g, b] = light.sky[2];
        application.renderer.background.color = (r << 16) + (g << 8) + b;
        const amb = light.ambient.map((v) => Math.max(0, Math.min(255, Math.round(Math.min(v, 1) * 255))));
        world.tint = (amb[0] << 16) + (amb[1] << 8) + amb[2];
        drawCity(ground, shown, light);
        fxLayer.clear();
        const site =
          liveFx?.crane ||
          shown.buildings.find((building) => building.status === "in_progress");
        if (site) {
          const bob = Math.sin(performance.now() / 280) * 2;
          drawCrane(fxLayer, site.x, site.y, site.stories ?? site.storiesBuilt ?? 0, bob);
          if (liveFx?.dust) drawDust(fxLayer, site.x, site.y, site.stories ?? site.storiesBuilt ?? 0);
        }
        if (liveFx?.plane) {
          const w = application.screen.width;
          const x = -30 + (w + 50) * liveFx.plane.progress;
          const y = 28 + Math.sin(liveFx.plane.progress * 8) * 8;
          // The plane is in screen space, so undo the camera before drawing it.
          const invX = (x - world.x) / world.scale.x;
          const invY = (y - world.y) / world.scale.y;
          drawPlane(fxLayer, invX, invY);
        }
      };
      application.ticker.add(paint);
      paint();

      const canvas = application.canvas;
      const down = (event) => {
        canvas.setPointerCapture?.(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      };
      const move = (event) => {
        const prev = pointers.get(event.pointerId);
        if (!prev) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const pts = [...pointers.values()];
        if (pts.length >= 2) {
          const now = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (pinchDist) {
            const next = Math.max(0.4, Math.min(4, world.scale.x * (now / pinchDist)));
            world.scale.set(next);
          }
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
        const next = Math.max(0.4, Math.min(4, world.scale.x * (event.deltaY > 0 ? 0.9 : 1.1)));
        world.scale.set(next);
      };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
      canvas.addEventListener("wheel", wheel, { passive: false });
      worldRef.current.cleanup = () => {
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
      worldRef.current?.cleanup?.();
      if (appRef.current && !appRef.current.destroyed) {
        appRef.current.destroy(true);
      }
      appRef.current = null;
    };
  }, []);

  return <div className="city-canvas" ref={hostRef} />;
}
