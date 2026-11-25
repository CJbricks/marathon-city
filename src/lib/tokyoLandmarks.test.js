// Tokyo's one extra landmark. Denver's replay is the control: the same
// log must come back without the Skytree, and without Austin's library,
// gallery, or bakery. The Capitol is still the shared slot at 250 miles.
//
// The number under test is rules.cities.Tokyo.landmarks.tokyoSkytree.
// A second check edits that number and replays, so a hardcoded 500 in
// simulate.js would fail one of the two.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import rules from "./rules.js";
import { parseActivityFile, simulate } from "./simulate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const demo = parseActivityFile(readFileSync(join(root, "prototype/activities.txt"), "utf8"));

const wideMap = {
  ...rules.map,
  blocks: 20,
  coreLots: 80,
  innerLots: 200,
};

function tokyoRules(patch = {}) {
  const base = rules.cities.Tokyo.landmarks;
  const landmarks = { ...base };
  for (const [key, extra] of Object.entries(patch)) {
    landmarks[key] = { ...base[key], ...extra };
  }
  return {
    ...rules,
    city: "Tokyo",
    asOfDate: "2026-06-01",
    map: wideMap,
    cities: { ...rules.cities, Tokyo: { ...rules.cities.Tokyo, landmarks } },
  };
}

const tokyo = tokyoRules();

function onDay(i) {
  const month = Math.floor(i / 28) + 1;
  const day = (i % 28) + 1;
  return `2021-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mileRuns(count, each = 10) {
  return Array.from({ length: count }, (_, i) => ({
    type: "Run",
    date: onDay(i),
    miles: each,
    seconds: each * 600,
    seq: i,
    stravaId: `m${i}`,
  }));
}

function withMiles(count, each, extraMiles) {
  return [
    ...mileRuns(count, each),
    {
      type: "Run",
      date: "2021-06-01",
      miles: extraMiles,
      seconds: extraMiles * 600,
      seq: 0,
      stravaId: `extra-${extraMiles}`,
    },
  ];
}

function keys(city) {
  return city.landmarks.map((l) => l.key);
}

function slot(at) {
  const period = rules.map.blockLots + 1;
  return [at[0] * period + 1 + at[2], at[1] * period + 1 + at[3]];
}

describe("Tokyo Skytree", () => {
  const at = rules.cities.Tokyo.landmarks.tokyoSkytree.at;

  it("unlocks at 500 lifetime miles and not at 499, on its own lot", () => {
    const almost = simulate(withMiles(49, 10, 9), tokyo);
    const exact = simulate(mileRuns(50, 10), tokyo);
    expect(almost.summary.totalRunMiles).toBe(499);
    expect(exact.summary.totalRunMiles).toBe(500);
    expect(keys(almost)).not.toContain("tokyoSkytree");
    expect(keys(exact).filter((key) => key === "tokyoSkytree")).toHaveLength(1);
    const [x, y] = slot(at);
    const placed = exact.landmarks.find((l) => l.key === "tokyoSkytree");
    expect(placed.name).toBe("Tokyo Skytree");
    expect(placed.run).toMatchObject({ miles: 10, date: onDay(49) });
    expect([placed.x, placed.y]).toEqual([x, y]);
    expect(exact.buildings.some((b) => b.x === x && b.y === y)).toBe(false);
    expect(almost.buildings.some((b) => b.x === x && b.y === y)).toBe(false);
  });

  it("leaves the palace slot at 250 miles", () => {
    const before = simulate(withMiles(24, 10, 9), tokyo);
    const atPalace = simulate(mileRuns(25, 10), tokyo);
    const atTower = simulate(mileRuns(50, 10), tokyo);
    expect(before.buildings.filter((b) => b.type === "capitol")).toHaveLength(0);
    expect(atPalace.summary.totalRunMiles).toBe(250);
    expect(atPalace.buildings.filter((b) => b.type === "capitol")).toHaveLength(1);
    expect(keys(atPalace)).not.toContain("tokyoSkytree");
    const capitol = atTower.buildings.find((b) => b.type === "capitol");
    const skytree = atTower.landmarks.find((l) => l.key === "tokyoSkytree");
    expect([capitol.x, capitol.y]).not.toEqual([skytree.x, skytree.y]);
  });

  it("reads cumulativeRunMiles from the rules", () => {
    const moved = tokyoRules({ tokyoSkytree: { cumulativeRunMiles: 40 } });
    expect(keys(simulate(mileRuns(3, 10), moved))).not.toContain("tokyoSkytree");
    expect(keys(simulate(mileRuns(4, 10), moved)).filter((key) => key === "tokyoSkytree")).toHaveLength(1);
  });

  it("does not give Tokyo the Austin library, gallery, or bakery", () => {
    const city = simulate(demo, { ...rules, city: "Tokyo" });
    expect(city.summary.totalRunMiles).toBe(704.95);
    expect(keys(city)).toContain("tokyoSkytree");
    expect(keys(city)).not.toContain("lbjLibrary");
    expect(keys(city)).not.toContain("marthasGallery");
    expect(keys(city)).not.toContain("rockmansBakery");
    expect(city.buildings.filter((b) => b.type === "capitol")).toHaveLength(1);
    const denver = simulate(demo, rules);
    expect(keys(denver)).not.toContain("tokyoSkytree");
  });
});
