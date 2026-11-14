// The opening scale of the city. A 390px-wide phone must show the whole
// diamond, centered, with margin. A short desktop window must not crop it
// either. These numbers are what CityView applies before any drag.
import { describe, expect, it } from "vitest";
import { SCENE_H, SCENE_W } from "./pixelScene";
import { GRID_LEFT, GRID_RIGHT, gridPlacement, stepZoom } from "./gridFit";

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
    const fit = gridPlacement(1440, 900).scale;
    expect(fit).toBeGreaterThan(1);
    expect(Number.isInteger(fit)).toBe(false);
    expect(stepZoom(fit, fit, 1)).toBe(2);
    expect(stepZoom(2, fit, -1)).toBeCloseTo(fit, 5);
    expect(stepZoom(fit, fit, -1)).toBeCloseTo(fit, 5);
  });
});
