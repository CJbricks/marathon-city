// Hit testing is picture pixels, not the screen. A turn moves the lot.
// A flip moves a building's box and must not move a landmark's box.

import { describe, expect, it } from "vitest";
import { MAP_TILES, project } from "./sceneLayout";
import { orientCity, rotateLot } from "./rotation";
import {
  TAP_SLOP,
  isTap,
  pickLandmark,
  placeLandmarkPopup,
  popupForProp,
  scenePoint,
  spriteBounds,
  spriteScaleFor,
} from "./landmarkHit";

describe("scenePoint and taps", () => {
  it("turns a canvas pixel into a picture pixel", () => {
    expect(scenePoint(50, 40, 10, 20, 2)).toEqual({ x: 20, y: 10 });
    expect(scenePoint(0, 0, 0, 0, 0)).toBeNull();
  });

  it("treats a small lift as a tap and a drag or a pinch as not", () => {
    expect(isTap({ x: 0, y: 0 }, { x: TAP_SLOP, y: 0 }, false)).toBe(true);
    expect(isTap({ x: 0, y: 0 }, { x: TAP_SLOP + 1, y: 0 }, false)).toBe(false);
    expect(isTap({ x: 0, y: 0 }, { x: 1, y: 1 }, true)).toBe(false);
    expect(isTap(null, { x: 0, y: 0 }, false)).toBe(false);
  });
});

describe("sprite boxes", () => {
  it("flips ordinary buildings on the odd quarters and never flips a landmark", () => {
    expect(spriteScaleFor("building", 0)).toBe(1);
    expect(spriteScaleFor("building", 1)).toBe(-1);
    expect(spriteScaleFor("building", 2)).toBe(1);
    expect(spriteScaleFor("building", 3)).toBe(-1);
    expect(spriteScaleFor("landmark", 1)).toBe(1);
    expect(spriteScaleFor("landmark", 3)).toBe(1);
  });

  it("keeps a mirrored sprite on the same lot by measuring from the right edge", () => {
    const plain = spriteBounds(100, 40, 30, 80, 1);
    const flipped = spriteBounds(130, 40, 30, 80, -1);
    expect(plain).toEqual({ x: 100, y: 40, w: 30, h: 80 });
    expect(flipped).toEqual(plain);
  });
});

describe("pickLandmark", () => {
  const station = {
    x: 10,
    y: 10,
    w: 40,
    h: 50,
    depth: 8,
    popup: { key: "unionStation", run: null },
  };

  it("hits the landmark and ignores the grass beside it", () => {
    expect(pickLandmark({ x: 12, y: 12 }, [station]).popup.key).toBe("unionStation");
    expect(pickLandmark({ x: 0, y: 0 }, [station])).toBeNull();
  });

  it("lets a closer house hide the landmark behind it", () => {
    const house = { x: 10, y: 10, w: 40, h: 50, depth: 20, popup: null };
    expect(pickLandmark({ x: 12, y: 12 }, [station, house])).toBeNull();
  });

  it("still hits a landmark that is in front of a house", () => {
    const house = { x: 10, y: 10, w: 40, h: 50, depth: 2, popup: null };
    const dome = { ...station, depth: 30, popup: { key: "capitol", run: { date: "2024-01-01" } } };
    expect(pickLandmark({ x: 12, y: 12 }, [house, dome]).popup.key).toBe("capitol");
  });

  it("misses a landmark after a turn unless the box moved with the lot", () => {
    const [u, v] = rotateLot(14, 14, 1, MAP_TILES, 1);
    const [px, py] = project(u + 0.5, v + 0.5, 24);
    const turned = {
      x: px - 20,
      y: py - 40,
      w: 40,
      h: 60,
      depth: u + v + 2,
      popup: { key: "unionStation", run: null },
    };
    const point = { x: px, y: py - 10 };
    expect(pickLandmark(point, [turned]).popup.key).toBe("unionStation");
    expect(pickLandmark(point, [station])).toBeNull();
    expect(u).not.toBe(14);
  });
});

describe("popupForProp", () => {
  it("reads the capitol off the building and other landmarks off the turned lot", () => {
    const city = orientCity(
      {
        buildings: [
          { id: 7, type: "capitol", x: 13, y: 13, run: { date: "2024-06-01", miles: 5, stravaId: "99" } },
          { id: 8, type: "rowhouse", x: 2, y: 2 },
        ],
        landmarks: [
          { key: "unionStation", x: 14, y: 14, run: { date: "2024-02-02", miles: 10, stravaId: "demo-4" } },
        ],
        parks: [],
        sideQuests: [],
      },
      1,
    );
    const station = city.landmarks[0];
    expect(popupForProp({ id: `l:unionStation:${station.x}:${station.y}` }, city).run.stravaId).toBe("demo-4");
    expect(popupForProp({ id: "b:7" }, city).key).toBe("capitol");
    expect(popupForProp({ id: "b:8" }, city)).toBeNull();
    expect(popupForProp({ id: "p:1:1:Cheesman Park" }, city)).toBeNull();
  });
});

describe("placeLandmarkPopup", () => {
  it("stays on a phone-width view and grows from the building", () => {
    const placed = placeLandmarkPopup({
      anchorX: 200,
      anchorY: 420,
      width: 232,
      height: 140,
      viewW: 390,
      viewH: 700,
    });
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.left + placed.width).toBeLessThanOrEqual(382);
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.top + 140).toBeLessThanOrEqual(700 - 76);
    expect(placed.originX).toBeCloseTo(200 - placed.left);
    expect(placed.originY).toBeCloseTo(420 - placed.top);
  });

  it("drops below a building that is already at the top", () => {
    const placed = placeLandmarkPopup({
      anchorX: 40,
      anchorY: 20,
      width: 232,
      height: 120,
      viewW: 390,
      viewH: 600,
    });
    expect(placed.top).toBeGreaterThanOrEqual(20);
    expect(placed.left).toBe(8);
  });
});
