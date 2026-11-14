// The dust puff stays a handful of pixels at the foot of the lot.
// CityView draws whatever this returns, so the test does not need a canvas.
import { describe, expect, it } from "vitest";
import { dustPuffs } from "./dust.js";

const anchors = {
  west: [100, 200],
  east: [140, 200],
  south: [120, 220],
};

describe("dustPuffs", () => {
  it("puffs from the base and the sides without allocating a new list", () => {
    const first = dustPuffs(0, anchors);
    expect(first).toHaveLength(8);
    const drawn = first.filter((puff) => puff.s > 0);
    expect(drawn.length).toBeGreaterThan(0);
    for (const puff of drawn) {
      const origin = puff.side < 0 ? anchors.west : puff.side > 0 ? anchors.east : anchors.south;
      expect(Math.abs(puff.x - origin[0])).toBeLessThan(56);
      expect(puff.y).toBeLessThanOrEqual(origin[1]);
      expect(puff.y).toBeGreaterThan(origin[1] - 48);
      expect(puff.s).toBeLessThanOrEqual(10);
    }
    const early = first.map((puff) => puff.y);
    const later = dustPuffs(450, anchors);
    expect(later).toBe(first);
    expect(later.map((puff) => puff.y).join(",")).not.toBe(early.join(","));
  });
});
