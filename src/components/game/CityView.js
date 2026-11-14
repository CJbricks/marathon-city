"use client";

// Shows the painted city. The sky, mountains, and prairie are one texture
// that stays put. The lots and buildings are a second texture, and only
// that one follows a drag or a pinch. Both start at the size from
// gridFit.js: the whole 1280×1000 picture fits inside the view, so a tall
// phone does not zoom the diamond off the sides. Pinching in past 1× snaps
// to 1, 2, 3… so the pixels stay square. Each snap keeps the picture pixel
// between the fingers under the fingers, then clamps the pan so the diamond
// cannot leave the screen. Zooming back to the opening fit recenters it.
// The crane, the plane, the parade, the transit lines, the streak vehicles,
// and the walkers are drawn in the same picture pixels as the buildings.
// Buildings are their own sprites, sorted by how close they are. A car is
// drawn in the gap before any building that is in front of it, so it
// disappears behind that building instead of sitting on the roof. None of
// the movers call paintScene, so the skyline stays cached.
//
// Which drawings are in the texture comes from the save's city name
// ("Denver" or "Austin"). That name is the theme. The pinch math does
// not know it. Austin at dusk adds a few bat rectangles over the bridge.
// They are an overlay, like the cars: the city texture is not repainted
// just to flap a wing. Denver never enters that branch.

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { lightingAt, lightingAtMinutes } from "@/lib/lighting";
import rules from "@/lib/rules";
import { dustPuffs } from "./dust";
import { hex } from "./pixelPen";
import { themeFor } from "./themes";
import { clampCityPan, gridPlacement, placeZoom, stepZoom } from "./gridFit";
import { CONFETTI, drawCrane, drawParade, drawPlane, drawPopulation, drawTransitMarks, drawTransitMovers } from "./overlaySprites";
import {
  DEPTH_BUCKETS,
  HORIZON_Y,
  SCENE_H,
  SCENE_W,
  bucketIndex,
  fitBackdropExtras,
  listProps,
  paintExtendedBackdrop,
  paintGroundPixels,
  paintPropPixels,
  project,
  propDepth,
  tintSkyColor,
} from "./pixelScene";

const DUST_LIGHT = 0xfff3c4;
const DUST_DARK = 0xc4a574;

function packRgb([r, g, b]) {
  return (r << 16) + (g << 8) + b;
}

// Flat color behind the detailed picture. It covers any gap the 1280×1000
// scene does not reach, with sky at the top and sandy ground at the bottom.
// horizonY is where that picture's own ground starts, so the flat sand
// meets the painted prairie instead of cutting across the mountains.
function drawFill(g, w, h, light, horizonY, groundHex = "#c4b56a") {
  g.clear();
  const horizon = Math.round(Math.max(0, Math.min(h, horizonY)));
  g.rect(0, 0, w, h).fill({ color: packRgb(light.sky[0]) });
  if (horizon < h) {
    // Same prairie color as the painted ground, including the time-of-day
    // tint, so a gap does not show up as a lighter stripe. Denver's near
    // ground is the tan this used to hard-code.
    const tint = light.ambient || [1, 1, 1];
    const sand = hex(groundHex).map((v, i) => Math.round(Math.max(0, Math.min(255, v * (tint[i] ?? 1)))));
    g.rect(0, horizon, w, h - horizon).fill({ color: packRgb(sand) });
  }
}

// Bats are a handful of rectangles. The bridge texture cannot flap them:
// that picture is cached until the lighting phase changes. Nine bats, three
// rects each, only while Austin is at dusk or night.
function drawBatSwarm(g, x, y, now, nightSky) {
  g.clear();
  const [cx, cy] = project(x + 0.5, y + 0.5, 50);
  // Light enough to show on a night sky, dark enough to show on dusk.
  // Wings are two pixels tall. A one-pixel wing turned into a dash once
  // the picture was zoomed, and it stopped reading as a bat.
  const color = nightSky ? 0xe4d4c0 : 0x1a120c;
  for (let i = 0; i < 9; i += 1) {
    const up = Math.sin(now / 160 + i * 1.3) > 0;
    const ang = now / 1100 + (i / 9) * Math.PI * 2;
    const rad = 16 + (i % 4) * 9;
    const bx = Math.round(cx + Math.cos(ang) * rad * 1.6);
    const by = Math.round(cy + Math.sin(ang) * rad * 0.4);
    const lift = up ? -2 : 1;
    g.rect(bx - 1, by, 3, 2).fill({ color });
    g.rect(bx - 6, by + lift, 5, 2).fill({ color });
    g.rect(bx + 2, by + lift, 5, 2).fill({ color });
  }
}

function adoptTexture(sprite, canvas) {
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  const previous = sprite.texture;
  sprite.texture = texture;
  if (previous && previous !== Texture.EMPTY) previous.destroy(true);
}

function canvasFromPixels(pixels, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData(w, h);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

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


// About 18% of finger spread is one click on the zoom ladder. A smaller
// wobble is ignored so a shaky pinch does not skip a step.
const PINCH_STEP_RATIO = 1.18;

export default function CityView({ city, fx, celebrate, theme = "Denver" }) {
  const hostRef = useRef(null);
  const stateRef = useRef({ city, fx, celebrate, theme });

  useEffect(() => {
    stateRef.current = { city, fx, celebrate, theme };
  }, [city, fx, celebrate, theme]);

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
        // One canvas pixel per CSS pixel, and no retina backing store.
        // A device-pixel buffer would be three times as wide on a phone
        // and the browser would scale it back down, which softens the
        // blocks. globals.css pins the canvas to its box (width and
        // height 100%), so Safari still fills the screen.
        resolution: 1,
        autoDensity: false,
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
      // Lawns and streets. Everything with height lives in `depth`, sorted
      // so a closer building is drawn after the car it should hide.
      const groundSprite = new Sprite(Texture.EMPTY);
      const depth = new Container();
      depth.sortableChildren = true;
      const marks = new Graphics();
      marks.zIndex = 0.25;
      depth.addChild(marks);
      const buckets = [];
      for (let i = 0; i < DEPTH_BUCKETS; i += 1) {
        const g = new Graphics();
        g.zIndex = i + 0.5;
        depth.addChild(g);
        buckets.push(g);
      }
      // The crane and the dust share one object so they stay on the lot
      // that is going up, just in front of that building.
      const siteFx = new Graphics();
      depth.addChild(siteFx);
      // Above the bridge, under any building closer to the camera. zIndex
      // is set when the bridge is known. Denver leaves this object empty.
      const bats = new Graphics();
      depth.addChild(bats);
      world.addChild(groundSprite, depth);
      const propSprites = new Map();
      const usedBuckets = new Set();
      const layerFor = (key) => {
        const i = bucketIndex(key);
        usedBuckets.add(i);
        return buckets[i];
      };
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
      let groundKey = "";
      let marksKey = "";
      let batKey = "";
      const upload = (live, light, themeName) => {
        const groundSig = `${themeName}|${light.phase}|${live.map?.tiles}|${live.map?.period}`;
        if (groundSig !== groundKey) {
          groundKey = groundSig;
          adoptTexture(groundSprite, canvasFromPixels(paintGroundPixels(live, light, { theme: themeName }), SCENE_W, SCENE_H));
          texBytes = SCENE_W * SCENE_H * 4;
        }
        // Each prop keeps its own signature. A story going up repaints
        // that one building. A lighting change repaints all of them,
        // because the phase is part of the signature. Cars are not.
        const props = listProps(live);
        const alive = new Set();
        let propBytes = 0;
        for (const prop of props) {
          alive.add(prop.id);
          const sig = `${themeName}|${light.phase}|${prop.sig}`;
          let sprite = propSprites.get(prop.id);
          if (sprite && sprite.propSig === sig) {
            sprite.zIndex = prop.depth;
            propBytes += sprite.propBytes || 0;
            continue;
          }
          const crop = paintPropPixels(prop, light, themeName);
          if (!crop) {
            if (sprite) {
              depth.removeChild(sprite);
              const previous = sprite.texture;
              sprite.destroy();
              if (previous && previous !== Texture.EMPTY) previous.destroy(true);
              propSprites.delete(prop.id);
            }
            continue;
          }
          if (!sprite) {
            sprite = new Sprite(Texture.EMPTY);
            depth.addChild(sprite);
            propSprites.set(prop.id, sprite);
          }
          adoptTexture(sprite, canvasFromPixels(crop.data, crop.w, crop.h));
          sprite.position.set(crop.x, crop.y);
          sprite.zIndex = prop.depth;
          sprite.propSig = sig;
          sprite.propBytes = crop.w * crop.h * 4;
          propBytes += sprite.propBytes;
        }
        for (const [id, sprite] of propSprites) {
          if (alive.has(id)) continue;
          depth.removeChild(sprite);
          const previous = sprite.texture;
          sprite.destroy();
          if (previous && previous !== Texture.EMPTY) previous.destroy(true);
          propSprites.delete(id);
        }
        const sig = `${groundSig}|${props.length}|${propBytes}`;
        if (sig !== painted) {
          painted = sig;
          host.dataset.texBytes = String(texBytes + propBytes);
        }
      };

      const paint = () => {
        const { city: live, fx: liveFx, theme: themeName = "Denver" } = stateRef.current;
        const shown = liveFx?.city || live;
        if (!shown) return;
        const light = viewClock();
        const themeObj = themeFor(themeName);
        const skyTop = tintSkyColor(light.sky[0], light, themeObj);
        const [r, g, b] = skyTop;
        application.renderer.background.color = (r << 16) + (g << 8) + b;
        const key = `${themeName}|${light.phase}|${Math.round(application.screen.width)}|${Math.round(application.screen.height)}|${Math.round(placed.y)}|${placed.scale.toFixed(4)}`;
        if (key !== fillKey) {
          fillKey = key;
          const shownLight = themeObj.sky
            ? {
                ...light,
                sky: [0, 1, 2].map((i) => tintSkyColor(light.sky[i], light, themeObj)),
              }
            : light;
          drawFill(
            fill,
            application.screen.width,
            application.screen.height,
            shownLight,
            placed.y + HORIZON_Y * placed.scale,
            themeObj.ground.near,
          );
        }
        // Grow the pinned picture until it covers the screen, but keep the
        // 1280×1000 block on the same spot as the grid. A drag moves the
        // grid only. The extra sky and ground stay here. fitBackdropExtras
        // stops that picture from passing the GPU's texture limit.
        const extra = fitBackdropExtras(
          Math.ceil(Math.max(0, placed.y) / placed.scale),
          Math.ceil(Math.max(0, application.screen.height - (placed.y + SCENE_H * placed.scale)) / placed.scale),
          Math.ceil(Math.max(0, placed.x) / placed.scale),
          Math.ceil(Math.max(0, application.screen.width - (placed.x + SCENE_W * placed.scale)) / placed.scale),
        );
        const nextSky = `${themeName}|${light.phase}|${extra.top}|${extra.bottom}|${extra.left}|${extra.right}`;
        if (nextSky !== skyKey) {
          skyKey = nextSky;
          adoptTexture(skySprite, paintExtendedBackdrop(light, extra.top, extra.bottom, extra.left, extra.right, themeName));
          skySprite.position.set(-extra.left, -extra.top);
        }
        upload(shown, light, themeName);
        const site = liveFx?.crane || shown.buildings.find((building) => building.status === "in_progress");
        if (site) {
          // Just in front of this lot, and behind any building closer to
          // the camera. The bucket for this depth is 0.5 above the integer,
          // so 0.25 keeps the crane between its own building and the cars.
          siteFx.zIndex = propDepth(site.x, site.y, 1) + 0.25;
          const bob = Math.round(Math.sin(performance.now() / 420) * 4);
          const stories = site.stories ?? site.targetStories ?? site.storiesBuilt ?? 2;
          drawCrane(siteFx, site.x, site.y, stories, bob);
          if (liveFx?.dust) {
            const puffs = dustPuffs(performance.now(), {
              west: project(site.x, site.y + 1, 0),
              east: project(site.x + 1, site.y, 0),
              south: project(site.x + 1, site.y + 1, 0),
            });
            for (const puff of puffs) {
              if (!puff.s) continue;
              siteFx.rect(puff.x, puff.y, puff.s, puff.s).fill({ color: puff.tone ? DUST_DARK : DUST_LIGHT });
              // A second pixel makes the speck read as a puff instead of a dot
              // on the pavement. Still a rectangle, still the same eight slots.
              if (!puff.tone) siteFx.rect(puff.x + 6, puff.y - 4, 4, 4).fill({ color: 0xfff6d0 });
            }
          }
        } else {
          siteFx.clear();
        }
        const celebrating = stateRef.current.celebrate;
        const frameNow = performance.now();
        const transitKey = (shown.transit || []).map((piece) => `${piece.mode}:${piece.index}`).join(",");
        if (transitKey !== marksKey) {
          marksKey = transitKey;
          drawTransitMarks(marks, shown);
        }
        for (const i of usedBuckets) buckets[i].clear();
        usedBuckets.clear();
        drawTransitMovers(layerFor, shown, frameNow);
        drawPopulation(layerFor, shown, frameNow);
        if (celebrating) drawParade(layerFor, shown, frameNow);
        // Dusk and night only. A midday clear would run every frame on a
        // Denver city for no reason, so the object is wiped once, when the
        // swarm goes away, and then left alone.
        const nightBats = themeName === "Austin" && (light.windowLight >= 0.5 || light.stars >= 0.3);
        if (nightBats) {
          const bridge = (shown.landmarks || []).find((mark) => mark.key === "unionStation");
          if (bridge) {
            const nextBat = `${bridge.x}:${bridge.y}`;
            if (nextBat !== batKey) {
              batKey = nextBat;
              bats.zIndex = propDepth(bridge.x, bridge.y, 1) + 0.15;
            }
            drawBatSwarm(bats, bridge.x, bridge.y, frameNow, light.stars > 0.7);
          } else if (batKey) {
            bats.clear();
            batKey = "";
          }
        } else if (batKey) {
          bats.clear();
          batKey = "";
        }
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
