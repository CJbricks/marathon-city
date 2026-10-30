// Proves the replay is deterministic, and that landmark caps hold.
// Cathedrals now occupy lots once the mileage bank allows them, so the
// demo city is no longer lot-for-lot identical to prototype/city.json.
// Miles are unchanged: the sample log is still 704.95 run miles.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import rules from "./rules.js";
import { parseActivityFile, simulate } from "./simulate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const text = readFileSync(join(root, "prototype/activities.txt"), "utf8");

function runs(milesEach, count) {
  return Array.from({ length: count }, (_, i) => ({
    type: "Run",
    date: `2020-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    miles: milesEach,
    seconds: milesEach * 600,
    seq: i,
    stravaId: `r${i}`,
  }));
}

const wideMap = {
  ...rules.map,
  blocks: 20,
  coreLots: 80,
  innerLots: 200,
};

describe("simulate", () => {
  const activities = parseActivityFile(text);
  const city = simulate(activities, rules);

  it("builds the same stories from the same runs every time", () => {
    const again = simulate(activities, rules);
    expect(again).toEqual(city);
  });

  it("caps the demo city at 3 cathedrals, 1 capitol, and 10 museums", () => {
    expect(city.summary.totalRunMiles).toBe(704.95);
    expect(city.landmarks.filter((l) => l.key === "cathedral")).toHaveLength(3);
    expect(city.buildings.filter((b) => b.type === "capitol")).toHaveLength(1);
    expect(city.landmarks.filter((l) => l.key === "capitol")).toHaveLength(1);
    expect(city.buildings.filter((b) => b.type === "museum").length).toBeLessThanOrEqual(10);
    for (const key of ["unionStation", "courthouse", "artMuseum"]) {
      expect(city.landmarks.filter((l) => l.key === key)).toHaveLength(1);
    }
  });

  it("gives one cathedral per 200 miles and stops only if max is set", () => {
    const open = { ...rules, asOfDate: "2022-01-01", map: wideMap };
    expect(simulate(runs(10, 19), open).landmarks.filter((l) => l.key === "cathedral")).toHaveLength(0);
    expect(simulate(runs(10, 20), open).landmarks.filter((l) => l.key === "cathedral")).toHaveLength(1);
    expect(simulate(runs(10, 100), open).landmarks.filter((l) => l.key === "cathedral")).toHaveLength(5);
    const capped = {
      ...open,
      landmarks: { ...rules.landmarks, cathedral: { ...rules.landmarks.cathedral, max: 2 } },
    };
    expect(simulate(runs(10, 100), capped).landmarks.filter((l) => l.key === "cathedral")).toHaveLength(2);
  });

  it("never starts an eleventh museum, and still builds only one capitol", () => {
    const capped = {
      ...rules,
      asOfDate: "2024-06-01",
      map: wideMap,
      ringWeights: {
        core: { museum: 1 },
        inner: { museum: 1 },
        outer: { museum: 1 },
      },
      buildingTypes: {
        ...rules.buildingTypes,
        museum: { ...rules.buildingTypes.museum, perCity: 2 },
      },
    };
    const out = simulate(runs(12, 40), capped);
    expect(out.buildings.filter((b) => b.type === "museum")).toHaveLength(2);
    expect(out.buildings.filter((b) => b.type === "capitol")).toHaveLength(1);
  });

  it("carries a partial mile onto the next run", () => {
    const tiny = [
      { type: "Run", date: "2024-01-01", miles: 1.25, seconds: 750, seq: 1, stravaId: "a" },
      { type: "Run", date: "2024-01-02", miles: 0.75, seconds: 450, seq: 2, stravaId: "b" },
    ];
    const out = simulate(tiny, { ...rules, asOfDate: "2024-01-03" });
    const built = out.buildings.reduce((s, b) => s + b.storiesBuilt, 0);
    expect(out.summary.totalRunMiles).toBe(2);
    expect(built).toBe(2);
    expect(out.buildings[0].storiesBuilt).toBeGreaterThan(0);
  });
});
