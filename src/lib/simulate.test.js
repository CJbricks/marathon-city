// Proves the replay is deterministic and faithful to the prototype.
// The fixture is prototype/activities.txt replayed "as of" 2026-10-29,
// which is the city checked in as prototype/city.json. If a rule change
// is intentional, that JSON is the picture of what the old city looked like;
// this test tells you the new city diverged.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import rules from "./rules.js";
import { parseActivityFile, simulate } from "./simulate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const text = readFileSync(join(root, "prototype/activities.txt"), "utf8");
const expected = JSON.parse(readFileSync(join(root, "prototype/city.json"), "utf8"));

describe("simulate", () => {
  const activities = parseActivityFile(text);
  const city = simulate(activities, rules);

  it("builds the same stories from the same runs every time", () => {
    const again = simulate(activities, rules);
    expect(again).toEqual(city);
  });

  it("matches the prototype city lot by lot", () => {
    expect(city.summary.totalRunMiles).toBe(expected.summary.totalRunMiles);
    expect(city.summary.buildingsCompleted).toBe(expected.summary.buildingsCompleted);
    expect(city.log).toEqual(expected.log);
    expect(city.buildings.map((b) => [b.id, b.type, b.x, b.y, b.targetStories, b.storiesBuilt, b.status])).toEqual(
      expected.buildings.map((b) => [b.id, b.type, b.x, b.y, b.targetStories, b.storiesBuilt, b.status]),
    );
    expect(city.landmarks.map((l) => [l.key, l.x, l.y, l.date])).toEqual(
      expected.landmarks.map((l) => [l.key, l.x, l.y, l.date]),
    );
    expect(city.parks.map((p) => p.name)).toEqual(expected.parks.map((p) => p.name));
    expect(city.sideQuests.map((q) => q.name)).toEqual(expected.sideQuests.map((q) => q.name));
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
