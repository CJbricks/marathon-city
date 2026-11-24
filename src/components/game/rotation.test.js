// The view turn is a pure function of a grid point. Four rights come
// back to the start. One left undoes one right. Depth is the turned
// u + v, so a block that rotated to the front sorts in front.

import { describe, expect, it } from "vitest";
import { bucketIndex, propDepth } from "./pixelScene";
import { MAP_TILES, project } from "./sceneLayout";
import { GRID_BOTTOM, GRID_LEFT, GRID_RIGHT, GRID_TOP } from "./gridFit";
import {
  mirrorBuildingSprite,
  normalizeQuarter,
  orientCity,
  quarterLeft,
  quarterRight,
  rotateGridPoint,
  rotateLot,
} from "./rotation";

const TILES = MAP_TILES;

function depthAt(x, y, turns, span = 1) {
  const [rx, ry] = rotateLot(x, y, turns, TILES, span);
  return propDepth(rx, ry, span);
}

describe("rotateGridPoint", () => {
  const samples = [
    [0, 0],
    [TILES, 0],
    [0, TILES],
    [TILES, TILES],
    [TILES / 2, TILES / 2],
    [3, 17],
    [5.5, 3.25],
    [0.5, 21.5],
  ];

  it("treats four rights as a full circle", () => {
    for (const [u, v] of samples) {
      let x = u;
      let y = v;
      for (let i = 0; i < 4; i += 1) {
        [x, y] = rotateGridPoint(x, y, 1, TILES);
      }
      expect(x).toBeCloseTo(u, 8);
      expect(y).toBeCloseTo(v, 8);
    }
  });

  it("lets one left undo one right, and the other way around", () => {
    for (const [u, v] of samples) {
      const [ru, rv] = rotateGridPoint(u, v, 1, TILES);
      const [backU, backV] = rotateGridPoint(ru, rv, -1, TILES);
      expect(backU).toBeCloseTo(u, 8);
      expect(backV).toBeCloseTo(v, 8);
      const [lu, lv] = rotateGridPoint(u, v, quarterLeft(0), TILES);
      const [homeU, homeV] = rotateGridPoint(lu, lv, quarterRight(0), TILES);
      expect(homeU).toBeCloseTo(u, 8);
      expect(homeV).toBeCloseTo(v, 8);
    }
  });

  it("keeps quarter 0 as the same numbers", () => {
    expect(rotateGridPoint(4, 9, 0, TILES)).toEqual([4, 9]);
    expect(normalizeQuarter(-1)).toBe(3);
    expect(normalizeQuarter(4)).toBe(0);
    expect(normalizeQuarter(5)).toBe(1);
  });

  it("spins the diamond corners without moving the box the pinch clamp watches", () => {
    const corners = [
      [0, 0],
      [TILES, 0],
      [0, TILES],
      [TILES, TILES],
    ];
    for (const turns of [0, 1, 2, 3]) {
      const pts = corners.map(([u, v]) => project(...rotateGridPoint(u, v, turns, TILES)));
      const left = Math.min(...pts.map((p) => p[0]));
      const right = Math.max(...pts.map((p) => p[0]));
      const top = Math.min(...pts.map((p) => p[1]));
      const bottom = Math.max(...pts.map((p) => p[1]));
      expect(left).toBe(GRID_LEFT);
      expect(right).toBe(GRID_RIGHT);
      expect(top).toBe(GRID_TOP);
      expect(bottom).toBe(GRID_BOTTOM);
    }
  });
});

describe("rotateLot", () => {
  it("returns a lot to its origin after four rights, for a block and a 2-lot quest", () => {
    for (const span of [1, 2]) {
      let x = 4;
      let y = 7;
      for (let i = 0; i < 4; i += 1) {
        [x, y] = rotateLot(x, y, 1, TILES, span);
      }
      expect(x).toBe(4);
      expect(y).toBe(7);
    }
  });

  it("lets a left turn put the lot back", () => {
    const [x, y] = rotateLot(8, 2, 1, TILES, 1);
    expect(rotateLot(x, y, -1, TILES, 1)).toEqual([8, 2]);
    const [qx, qy] = rotateLot(6, 15, 1, TILES, 2);
    expect(rotateLot(qx, qy, quarterLeft(0), TILES, 2)).toEqual([6, 15]);
  });
});

describe("depth after a turn", () => {
  it("brings the right-hand block in front of the block that was at the front", () => {
    const right = { x: 18, y: 3 };
    const front = { x: 16, y: 16 };
    expect(depthAt(front.x, front.y, 0)).toBeGreaterThan(depthAt(right.x, right.y, 0));
    expect(depthAt(right.x, right.y, 1)).toBeGreaterThan(depthAt(front.x, front.y, 1));
    // Four rights restore the depth, not just the coordinates.
    expect(depthAt(right.x, right.y, 4)).toBe(depthAt(right.x, right.y, 0));
    expect(depthAt(front.x, front.y, 4)).toBe(depthAt(front.x, front.y, 0));
  });

  it("still hides a mover that is behind the turned front corner", () => {
    // The front corner of a turned lot is one span past the new origin,
    // not the old front corner run through the point formula. The old
    // front is a different corner of the square once the camera has moved.
    const [ox, oy] = rotateLot(10, 10, 1, TILES, 1);
    const front = propDepth(ox, oy, 1);
    const fu = ox + 1;
    const fv = oy + 1;
    expect(fu + fv).toBe(front);
    const behind = fu - 0.6 + (fv - 0.6);
    const ahead = fu + 0.4 + (fv + 0.4);
    expect(behind).toBeLessThan(front);
    expect(bucketIndex(behind) + 0.5).toBeLessThan(front);
    expect(bucketIndex(ahead) + 0.5).toBeGreaterThan(front);
    expect(bucketIndex(ahead) + 0.5).toBeLessThan(front + 1);
  });

  it("uses the same front-corner depth the painter sorts by", () => {
    expect(depthAt(10, 10, 0)).toBe(propDepth(10, 10, 1));
    expect(depthAt(10, 10, 0)).toBe(22);
  });
});

describe("orientCity", () => {
  it("copies lots for drawing and leaves the saved city alone", () => {
    const city = {
      map: { tiles: TILES, period: 3 },
      buildings: [{ id: 7, x: 3, y: 4, type: "office" }],
      landmarks: [{ key: "unionStation", x: 5, y: 6 }],
      parks: [{ name: "Cheesman Park", x: 1, y: 2 }],
      sideQuests: [{ name: "Coors Field", x: 8, y: 9 }],
      vehicles: [{ type: "car", index: 0 }],
    };
    const view = orientCity(city, 1);
    expect(city.buildings[0].x).toBe(3);
    expect(city.buildings[0].y).toBe(4);
    expect(city.viewQuarter).toBeUndefined();
    expect(view).not.toBe(city);
    expect(view.viewQuarter).toBe(1);
    expect(view.buildings[0]).not.toBe(city.buildings[0]);
    expect(view.buildings[0].x).not.toBe(3);
    expect(view.landmarks[0].x).not.toBe(5);
    expect(view.sideQuests[0].x).not.toBe(8);
    expect(view.vehicles).toBe(city.vehicles);
    expect(orientCity(city, 0)).toBe(city);
    expect(orientCity(city, 4)).toBe(city);
  });

  it("flips ordinary buildings only on the odd quarters", () => {
    expect(mirrorBuildingSprite(0)).toBe(false);
    expect(mirrorBuildingSprite(1)).toBe(true);
    expect(mirrorBuildingSprite(2)).toBe(false);
    expect(mirrorBuildingSprite(3)).toBe(true);
    expect(mirrorBuildingSprite(-1)).toBe(true);
  });
});
