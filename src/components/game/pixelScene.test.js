// The cached city texture is keyed by sceneSignature. Cars, walkers, and
// the ultra transit lines move every frame, so they must not be part of
// that key. A new side quest does change the picture, so it must.
// The picture itself is the 2× scene: sidewalks lighter than asphalt,
// and the capitol's dome actually gold.

import { describe, expect, it } from "vitest";
import { lightingAtMinutes } from "../../lib/lighting";
import { HW, HH, SCENE_H, SCENE_W, project } from "./sceneLayout";
import { bucketIndex, listProps, moverDepth, paintPropPixels, paintScenePixels, propDepth, sceneSignature } from "./pixelScene";
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

describe("occlusion", () => {
  it("hides a mover that is behind a building's front corner", () => {
    // The building occupies the lot and faces the camera at its front
    // corner. A car on the street behind that corner sorts earlier.
    const front = propDepth(10, 10, 1);
    const behind = moverDepth(10.4, 9.2);
    const ahead = moverDepth(11.4, 11.2);
    expect(front).toBe(22);
    expect(bucketIndex(behind) + 0.5).toBeLessThan(front);
    expect(bucketIndex(ahead) + 0.5).toBeGreaterThan(front);
    expect(bucketIndex(ahead) + 0.5).toBeLessThan(front + 1);
  });

  it("cuts one building out without leaving the previous building's pixels", () => {
    const light = lightingAtMinutes(12 * 60 + 30);
    const capitol = listProps({
      buildings: [{ id: 1, type: "capitol", x: 4, y: 4, status: "complete", targetStories: 13, storiesBuilt: 13, variant: 1 }],
      landmarks: [],
      parks: [],
      sideQuests: [],
    })[0];
    const house = listProps({
      buildings: [{ id: 2, type: "rowhouse", x: 8, y: 2, status: "complete", targetStories: 2, storiesBuilt: 2, variant: 2 }],
      landmarks: [],
      parks: [],
      sideQuests: [],
    })[0];
    const dome = paintPropPixels(capitol, light, "Denver");
    const roof = paintPropPixels(house, light, "Denver");
    expect(dome.w * dome.h).toBeLessThan(SCENE_W * SCENE_H);
    let gold = 0;
    for (let i = 0; i < dome.data.length; i += 4) {
      if (dome.data[i] > 180 && dome.data[i + 1] > 120 && dome.data[i + 2] < 90) gold += 1;
    }
    expect(gold).toBeGreaterThan(30);
    let leaked = 0;
    for (let i = 0; i < roof.data.length; i += 4) {
      if (roof.data[i] > 180 && roof.data[i + 1] > 120 && roof.data[i + 2] < 90) leaked += 1;
    }
    expect(leaked).toBe(0);
    expect(roof.data.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
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
