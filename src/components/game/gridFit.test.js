// The opening scale of the city, and the pinch math that keeps it there.
// A 390px-wide phone must show the whole diamond, centered, with margin.
// A short desktop window must not crop it either. A later pinch snaps to
// 1×, 2×, 3× without sliding the point under the fingers, and a drag
// cannot carry the diamond off the view. These numbers are what CityView applies.
import { describe, expect, it } from "vitest";
import { SCENE_H, SCENE_W } from "./pixelScene";
import {
  GRID_BOTTOM,
  GRID_LEFT,
  GRID_RIGHT,
  GRID_TOP,
  MIN_VISIBLE_FRACTION,
  clampCityPan,
  gridPlacement,
  placeZoom,
  stepZoom,
  zoomAboutPoint,
} from "./gridFit";

function diamond(screenW, screenH) {
  const place = gridPlacement(screenW, screenH);
  return {
    place,
    left: place.x + GRID_LEFT * place.scale,
    right: place.x + GRID_RIGHT * place.scale,
    top: place.y,
    bottom: place.y + SCENE_H * place.scale,
  };
}

describe("gridPlacement", () => {
  it("fits the whole diamond inside a phone width, centered, with margin", () => {
    const { place, left, right, top, bottom } = diamond(390, 815);
    expect(place.scale).toBeCloseTo(390 / SCENE_W, 5);
    expect(place.x).toBeCloseTo(0, 5);
    expect(left).toBeGreaterThan(20);
    expect(right).toBeLessThan(370);
    expect(right - left).toBeLessThan(390);
    expect((left + right) / 2).toBeCloseTo(195, 0);
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(815);
  });

  it("keeps the whole picture on a short desktop window", () => {
    const { place, left, right, top, bottom } = diamond(1440, 900);
    expect(place.scale).toBeCloseTo(900 / SCENE_H, 5);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(1440);
    expect(top).toBeCloseTo(0, 5);
    expect(bottom).toBeCloseTo(900, 5);
    expect((place.x + (place.x + SCENE_W * place.scale)) / 2).toBeCloseTo(720, 0);
  });

  it("does not use the tall side of a phone to enlarge the grid", () => {
    const phone = gridPlacement(390, 815);
    const cover = Math.max(390 / SCENE_W, 815 / SCENE_H);
    expect(phone.scale).toBeLessThan(cover);
    expect(phone.scale * GRID_RIGHT).toBeLessThan(390);
  });
});

describe("stepZoom", () => {
  it("snaps past 1x to whole numbers and returns to the phone's contain-fit", () => {
    const fit = gridPlacement(390, 844).scale;
    expect(fit).toBeLessThan(1);
    expect(fit).toBeCloseTo(390 / SCENE_W, 5);
    expect(stepZoom(fit, fit, 1)).toBe(1);
    expect(stepZoom(1, fit, 1)).toBe(2);
    expect(stepZoom(2, fit, 1)).toBe(3);
    expect(stepZoom(2, fit, -1)).toBe(1);
    expect(stepZoom(1, fit, -1)).toBeCloseTo(fit, 5);
    expect(stepZoom(fit, fit, -1)).toBeCloseTo(fit, 5);
    expect(stepZoom(6, fit, 1)).toBe(6);
  });

  it("treats a contain-fit above 1 as the smallest scale", () => {
    // Both sides have to be larger than the 1280×1000 picture. A 900px
    // tall window used to be, back when the picture was 500px tall.
    const fit = gridPlacement(1800, 1400).scale;
    expect(fit).toBeGreaterThan(1);
    expect(Number.isInteger(fit)).toBe(false);
    expect(stepZoom(fit, fit, 1)).toBe(2);
    expect(stepZoom(2, fit, -1)).toBeCloseTo(fit, 5);
    expect(stepZoom(fit, fit, -1)).toBeCloseTo(fit, 5);
  });
});

function overlap(panX, panY, zoom, screenW, screenH) {
  const left = panX + GRID_LEFT * zoom;
  const right = panX + GRID_RIGHT * zoom;
  const top = panY + GRID_TOP * zoom;
  const bottom = panY + GRID_BOTTOM * zoom;
  return {
    x: Math.min(right, screenW) - Math.max(left, 0),
    y: Math.min(bottom, screenH) - Math.max(top, 0),
  };
}

function sceneUnder(panX, panY, zoom, focalX, focalY) {
  return [(focalX - panX) / zoom, (focalY - panY) / zoom];
}

describe("zoomAboutPoint", () => {
  it("keeps the same picture pixel under the fingers when the scale snaps", () => {
    const fit = gridPlacement(390, 844);
    // Near the right corner of the diamond, which is where a phone pinch
    // used to throw the grid off the screen.
    const sceneX = GRID_RIGHT - 24;
    const sceneY = (GRID_TOP + GRID_BOTTOM) / 2;
    const focalX = fit.x + sceneX * fit.scale;
    const focalY = fit.y + sceneY * fit.scale;
    let zoom = fit.scale;
    let panX = fit.x;
    let panY = fit.y;
    for (const nextZoom of [1, 2, 3]) {
      const anchored = zoomAboutPoint({
        panX,
        panY,
        zoom,
        nextZoom,
        focalX,
        focalY,
        sceneX,
        sceneY,
      });
      // A bare scale change (the old bug) leaves the pan alone, so the
      // pixel that was under the fingers is somewhere else.
      const jumped = sceneUnder(panX, panY, nextZoom, focalX, focalY);
      expect(jumped[0]).not.toBeCloseTo(sceneX, 1);
      zoom = anchored.zoom;
      panX = anchored.panX;
      panY = anchored.panY;
      const held = sceneUnder(panX, panY, zoom, focalX, focalY);
      expect(held[0]).toBeCloseTo(sceneX, 5);
      expect(held[1]).toBeCloseTo(sceneY, 5);
    }
  });

  it("uses the pixel currently under the cursor when no scene point is passed", () => {
    const fit = gridPlacement(390, 844);
    const focalX = 300;
    const focalY = 420;
    const [sceneX, sceneY] = sceneUnder(fit.x, fit.y, fit.scale, focalX, focalY);
    const anchored = zoomAboutPoint({
      panX: fit.x,
      panY: fit.y,
      zoom: fit.scale,
      nextZoom: 2,
      focalX,
      focalY,
    });
    const held = sceneUnder(anchored.panX, anchored.panY, anchored.zoom, focalX, focalY);
    expect(held[0]).toBeCloseTo(sceneX, 5);
    expect(held[1]).toBeCloseTo(sceneY, 5);
  });
});

describe("clampCityPan", () => {
  it("leaves the opening phone placement alone", () => {
    const fit = gridPlacement(390, 844);
    const clamped = clampCityPan({
      panX: fit.x,
      panY: fit.y,
      zoom: fit.scale,
      screenW: 390,
      screenH: 844,
    });
    expect(clamped.panX).toBeCloseTo(fit.x, 5);
    expect(clamped.panY).toBeCloseTo(fit.y, 5);
  });

  it("lets a small drag stand and pulls a huge drag back onto the phone", () => {
    const fit = gridPlacement(390, 844);
    const nudged = clampCityPan({
      panX: fit.x + 12,
      panY: fit.y + 12,
      zoom: fit.scale,
      screenW: 390,
      screenH: 844,
    });
    expect(nudged.panX).toBeCloseTo(fit.x + 12, 5);
    expect(nudged.panY).toBeCloseTo(fit.y + 12, 5);

    const shoved = clampCityPan({
      panX: 5000,
      panY: -8000,
      zoom: 2,
      screenW: 390,
      screenH: 844,
    });
    expect(overlap(5000, -8000, 2, 390, 844).x).toBeLessThanOrEqual(0);
    const visible = overlap(shoved.panX, shoved.panY, 2, 390, 844);
    const minX = Math.min((GRID_RIGHT - GRID_LEFT) * 2, 390 * MIN_VISIBLE_FRACTION);
    const minY = Math.min((GRID_BOTTOM - GRID_TOP) * 2, 844 * MIN_VISIBLE_FRACTION);
    expect(visible.x).toBeGreaterThanOrEqual(minX - 0.01);
    expect(visible.y).toBeGreaterThanOrEqual(minY - 0.01);
  });
});

describe("placeZoom", () => {
  it("snaps to 2x at the edge of the city without losing the focal pixel", () => {
    const screenW = 390;
    const screenH = 844;
    const fit = gridPlacement(screenW, screenH);
    const sceneX = GRID_RIGHT - 24;
    const sceneY = (GRID_TOP + GRID_BOTTOM) / 2;
    const focalX = fit.x + sceneX * fit.scale;
    const focalY = fit.y + sceneY * fit.scale;
    let zoom = fit.scale;
    let panX = fit.x;
    let panY = fit.y;
    for (const step of [1, 1]) {
      const nextZoom = stepZoom(zoom, fit.scale, step);
      const placed = placeZoom({
        panX,
        panY,
        zoom,
        nextZoom,
        focalX,
        focalY,
        sceneX,
        sceneY,
        fitScale: fit.scale,
        fitX: fit.x,
        fitY: fit.y,
        screenW,
        screenH,
      });
      zoom = placed.zoom;
      panX = placed.panX;
      panY = placed.panY;
    }
    expect(zoom).toBe(2);
    const held = sceneUnder(panX, panY, zoom, focalX, focalY);
    expect(held[0]).toBeCloseTo(sceneX, 4);
    expect(held[1]).toBeCloseTo(sceneY, 4);
    const visible = overlap(panX, panY, zoom, screenW, screenH);
    expect(visible.x).toBeGreaterThan(screenW * MIN_VISIBLE_FRACTION);
    expect(visible.y).toBeGreaterThan(80);
    // The right corner of the diamond is still on the phone, so this is
    // the edge of the city and not the middle of it.
    expect(panX + GRID_RIGHT * zoom).toBeGreaterThan(screenW * 0.7);
    expect(panX + GRID_RIGHT * zoom).toBeLessThan(screenW + 80);
  });

  it("returns to the centered contain-fit when zooming all the way out", () => {
    const fit = gridPlacement(390, 844);
    const back = placeZoom({
      panX: -400,
      panY: 20,
      zoom: 2,
      nextZoom: fit.scale,
      focalX: 20,
      focalY: 40,
      sceneX: GRID_RIGHT,
      sceneY: GRID_BOTTOM,
      fitScale: fit.scale,
      fitX: fit.x,
      fitY: fit.y,
      screenW: 390,
      screenH: 844,
    });
    expect(back.zoom).toBeCloseTo(fit.scale, 5);
    expect(back.panX).toBeCloseTo(fit.x, 5);
    expect(back.panY).toBeCloseTo(fit.y, 5);
  });

  it("clamps a snap whose focal point is not over the city", () => {
    const placed = placeZoom({
      panX: 0,
      panY: 0,
      zoom: 1,
      nextZoom: 3,
      focalX: 390,
      focalY: 844,
      sceneX: -400,
      sceneY: -400,
      fitScale: 0.6,
      fitX: 0,
      fitY: 100,
      screenW: 390,
      screenH: 844,
    });
    const visible = overlap(placed.panX, placed.panY, placed.zoom, 390, 844);
    expect(visible.x).toBeGreaterThanOrEqual(390 * MIN_VISIBLE_FRACTION - 0.01);
    expect(visible.y).toBeGreaterThanOrEqual(844 * MIN_VISIBLE_FRACTION - 0.01);
    // The unclamped pan would have followed the empty margin off-screen.
    const raw = zoomAboutPoint({
      panX: 0,
      panY: 0,
      zoom: 1,
      nextZoom: 3,
      focalX: 390,
      focalY: 844,
      sceneX: -400,
      sceneY: -400,
    });
    expect(overlap(raw.panX, raw.panY, 3, 390, 844).x).toBeLessThanOrEqual(0);
  });
});
