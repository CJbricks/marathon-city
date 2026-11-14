// The cached city texture is keyed by sceneSignature. Cars, walkers, and
// the ultra transit lines move every frame, so they must not be part of
// that key. A new side quest does change the picture, so it must.
// The picture itself is the 2× scene: sidewalks lighter than asphalt,
// and the capitol's dome actually gold.

import { describe, expect, it } from "vitest";
import { lightingAtMinutes } from "../../lib/lighting";
import { HW, HH, SCENE_H, SCENE_W, project } from "./sceneLayout";
import { paintScenePixels, sceneSignature } from "./pixelScene";
import { themeFor, themeNames } from "./themes";

const base = {
  buildings: [{ id: 1, status: "complete", storiesBuilt: 2 }],
  landmarks: [{ key: "unionStation" }],
  parks: [{}],
  sideQuests: [{ name: "Coors Field" }],
};

describe("sceneSignature", () => {
  it("ignores vehicles, pedestrians, and transit", () => {
    const quiet = sceneSignature({ ...base, vehicles: [], pedestrians: { count: 0 }, transit: [] }, "day");
    const busy = sceneSignature(
      {
        ...base,
        vehicles: [{ type: "car" }, { type: "bus" }],
        pedestrians: { count: 200, seed: 5 },
        transit: [{ mode: "bus" }],
      },
      "day",
    );
    expect(quiet).toBe(busy);
  });

  it("changes when a side quest is earned", () => {
    const before = sceneSignature(base, "day");
    const after = sceneSignature(
      { ...base, sideQuests: [...base.sideQuests, { name: "Denver Zoo" }] },
      "day",
    );
    expect(before).not.toBe(after);
  });

  it("includes the theme, so a second city repaints", () => {
    expect(sceneSignature(base, "day", "Denver")).not.toBe(sceneSignature(base, "day", "Austin"));
  });
});

describe("2x scene", () => {
  it("doubles the old 640×500 picture and the lot step", () => {
    expect(SCENE_W).toBe(1280);
    expect(SCENE_H).toBe(1000);
    expect(HW).toBe(24);
    expect(HH).toBe(12);
    const origin = project(0, 0);
    const step = project(1, 0);
    expect(step[0] - origin[0]).toBe(24);
    expect(step[1] - origin[1]).toBe(12);
  });

  it("paints a sidewalk around the asphalt and a gold capitol dome", () => {
    const city = {
      map: { tiles: 8, period: 3 },
      buildings: [
        {
          id: 1,
          type: "capitol",
          x: 4,
          y: 4,
          status: "complete",
          targetStories: 13,
          storiesBuilt: 13,
          variant: 1,
        },
      ],
      landmarks: [],
      parks: [],
      sideQuests: [],
    };
    const data = paintScenePixels(city, lightingAtMinutes(12 * 60 + 30), { gridOnly: true, theme: "Denver" });
    const at = (u, v) => {
      const [x, y] = project(u, v);
      const i = (Math.round(y) * SCENE_W + Math.round(x)) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    // The back corner of a road lot is sidewalk. The middle is asphalt.
    const edge = at(1.08, 0.08);
    const middle = at(1.5, 0.5);
    expect(edge[3]).toBe(255);
    expect(middle[3]).toBe(255);
    const lum = (p) => p[0] + p[1] + p[2];
    expect(lum(edge)).toBeGreaterThan(lum(middle) + 40);
    // Sky outside the diamond stays clear in the grid picture.
    expect(at(0, -1)[3]).toBe(0);

    let gold = 0;
    const [cx, cy] = project(4.5, 4.5, 40);
    for (let y = cy - 20; y <= cy + 4; y += 1) {
      for (let x = cx - 20; x <= cx + 20; x += 1) {
        if (x < 0 || y < 0 || x >= SCENE_W || y >= SCENE_H) continue;
        const i = (y * SCENE_W + x) * 4;
        if (data[i] > 180 && data[i + 1] > 120 && data[i + 2] < 90 && data[i + 3] === 255) gold += 1;
      }
    }
    expect(gold).toBeGreaterThan(30);
  });
});

describe("theme seam", () => {
  it("paints Denver and falls back for a city that has no drawings yet", () => {
    expect(themeNames()).toEqual(["Denver"]);
    expect(themeFor("Denver").id).toBe("Denver");
    expect(themeFor("Austin")).toBe(themeFor("Denver"));
    expect(typeof themeFor("Denver").drawBuilding).toBe("function");
    expect(themeFor("Denver").sidewalk.day).not.toBe(themeFor("Denver").road.day);
  });
});
