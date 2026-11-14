// The cached city texture is keyed by sceneSignature. Cars, walkers, and
// the ultra transit lines move every frame, so they must not be part of
// that key. A new side quest does change the picture, so it must.

import { describe, expect, it } from "vitest";
import { sceneSignature } from "./pixelScene";

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
});
