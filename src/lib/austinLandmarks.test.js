// Austin-only landmarks. Denver's replay is the control: the same log must
// come back without the library, the gallery, or the bakery, and the
// Capitol must still appear at 250 miles rather than at 500.
//
// The numbers under test are the defaults in rules.cities.Austin. A second
// check edits those numbers and replays, so a hardcoded threshold in
// simulate.js would fail one of the two.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { replay } from "./replay.js";
import rules from "./rules.js";
import { parseActivityFile, simulate, startedBeforeHour } from "./simulate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const demo = parseActivityFile(readFileSync(join(root, "prototype/activities.txt"), "utf8"));

const wideMap = {
  ...rules.map,
  blocks: 20,
  coreLots: 80,
  innerLots: 200,
};

function austinRules(patch = {}) {
  const base = rules.cities.Austin.landmarks;
  const landmarks = { ...base };
  for (const [key, extra] of Object.entries(patch)) {
    landmarks[key] = { ...base[key], ...extra };
  }
  return {
    ...rules,
    city: "Austin",
    asOfDate: "2026-06-01",
    map: wideMap,
    cities: { ...rules.cities, Austin: { ...rules.cities.Austin, landmarks } },
  };
}

const austin = austinRules();

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

function early(count, clock, type = "Run") {
  return Array.from({ length: count }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return {
      type,
      date: `2024-04-${day}`,
      miles: 3,
      seconds: 3 * 600,
      seq: i,
      stravaId: `${type}-${clock}-${i}`,
      startLocal: `2024-04-${day}T${clock}`,
    };
  });
}

function paced(miles, seconds, i) {
  const day = String(i + 1).padStart(2, "0");
  return {
    type: "Run",
    date: `2024-05-${day}`,
    miles,
    seconds,
    seq: i,
    stravaId: `p${i}`,
    startLocal: `2024-05-${day}T12:00:00`,
  };
}

function keys(city) {
  return city.landmarks.map((l) => l.key);
}

function slot(at) {
  const period = rules.map.blockLots + 1;
  return [at[0] * period + 1 + at[2], at[1] * period + 1 + at[3]];
}

describe("LBJ Presidential Library", () => {
  const library = rules.cities.Austin.landmarks.lbjLibrary.at;

  it("unlocks at 500 lifetime miles and not at 499, on its own lot", () => {
    const almost = simulate(withMiles(49, 10, 9), austin);
    const exact = simulate(mileRuns(50, 10), austin);
    expect(almost.summary.totalRunMiles).toBe(499);
    expect(exact.summary.totalRunMiles).toBe(500);
    expect(keys(almost)).not.toContain("lbjLibrary");
    expect(keys(exact).filter((key) => key === "lbjLibrary")).toHaveLength(1);
    const [x, y] = slot(library);
    const placed = exact.landmarks.find((l) => l.key === "lbjLibrary");
    expect([placed.x, placed.y]).toEqual([x, y]);
    expect(exact.buildings.some((b) => b.x === x && b.y === y)).toBe(false);
    expect(almost.buildings.some((b) => b.x === x && b.y === y)).toBe(false);
    expect(almost.landmarks.some((l) => l.x === x && l.y === y)).toBe(false);
  });

  it("leaves the Texas Capitol at 250 miles", () => {
    const before = simulate(withMiles(24, 10, 9), austin);
    const atCapitol = simulate(mileRuns(25, 10), austin);
    const atLibrary = simulate(mileRuns(50, 10), austin);
    expect(before.summary.totalRunMiles).toBe(249);
    expect(before.buildings.filter((b) => b.type === "capitol")).toHaveLength(0);
    expect(atCapitol.summary.totalRunMiles).toBe(250);
    expect(atCapitol.buildings.filter((b) => b.type === "capitol")).toHaveLength(1);
    expect(keys(atCapitol)).not.toContain("lbjLibrary");
    expect(atLibrary.buildings.filter((b) => b.type === "capitol")).toHaveLength(1);
    const capitol = atLibrary.buildings.find((b) => b.type === "capitol");
    const lbj = atLibrary.landmarks.find((l) => l.key === "lbjLibrary");
    expect([capitol.x, capitol.y]).not.toEqual([lbj.x, lbj.y]);
  });

  it("reads cumulativeRunMiles from the rules", () => {
    const moved = austinRules({ lbjLibrary: { cumulativeRunMiles: 40 } });
    expect(keys(simulate(mileRuns(3, 10), moved))).not.toContain("lbjLibrary");
    expect(keys(simulate(mileRuns(4, 10), moved)).filter((key) => key === "lbjLibrary")).toHaveLength(1);
  });
});

describe("Martha's Art Gallery", () => {
  it("unlocks once, on the first pace PR of at least 5 miles, beside the Blanton", () => {
    const none = simulate(
      [paced(6, 6 * 500, 0), paced(6, 6 * 540, 1), paced(6, 6 * 600, 2)],
      austin,
    );
    const same = simulate([paced(6, 6 * 600, 0), paced(6, 6 * 600, 1)], austin);
    const sprint = simulate([paced(4, 4 * 500, 0), paced(4, 4 * 400, 1)], austin);
    const once = simulate(
      [paced(6, 6 * 600, 0), paced(6, 6 * 540, 1), paced(6, 6 * 500, 2)],
      austin,
    );
    expect(keys(none)).not.toContain("marthasGallery");
    expect(keys(same)).not.toContain("marthasGallery");
    expect(keys(sprint)).not.toContain("marthasGallery");
    expect(keys(once).filter((key) => key === "marthasGallery")).toHaveLength(1);
    const gallery = once.landmarks.find((l) => l.key === "marthasGallery");
    const period = rules.map.blockLots + 1;
    const [bx, by] = rules.map.civicCenter.block;
    const [ox, oy] = rules.map.civicCenter.slots.artMuseum;
    const blanton = [bx * period + 1 + ox, by * period + 1 + oy];
    expect([gallery.x, gallery.y]).toEqual(slot(rules.cities.Austin.landmarks.marthasGallery.at));
    expect(Math.abs(gallery.x - blanton[0]) + Math.abs(gallery.y - blanton[1])).toBeLessThanOrEqual(2);
    expect(once.buildings.some((b) => b.x === gallery.x && b.y === gallery.y)).toBe(false);
  });

  it("reads minDistance from the rules", () => {
    const moved = austinRules({ marthasGallery: { minDistance: 2 } });
    const city = simulate([paced(3, 3 * 600, 0), paced(3, 3 * 500, 1)], moved);
    expect(keys(city).filter((key) => key === "marthasGallery")).toHaveLength(1);
  });
});

describe("Rockman's Bakery", () => {
  it("unlocks at 10 early runs and not at 9", () => {
    expect(keys(simulate(early(9, "05:59:00"), austin))).not.toContain("rockmansBakery");
    const ten = simulate(early(10, "05:59:00"), austin);
    expect(keys(ten).filter((key) => key === "rockmansBakery")).toHaveLength(1);
    expect(ten.landmarks.find((l) => l.key === "rockmansBakery")).toMatchObject({
      x: slot(rules.cities.Austin.landmarks.rockmansBakery.at)[0],
      y: slot(rules.cities.Austin.landmarks.rockmansBakery.at)[1],
    });
  });

  it("counts 5:59 and 5:59:59, and does not count 6:00", () => {
    expect(keys(simulate(early(10, "05:59:59"), austin)).filter((key) => key === "rockmansBakery")).toHaveLength(1);
    expect(keys(simulate(early(10, "06:00:00"), austin))).not.toContain("rockmansBakery");
    const nineEarly = [
      ...early(9, "05:59:00"),
      {
        type: "Run",
        date: "2024-04-20",
        miles: 3,
        seconds: 1800,
        seq: 20,
        stravaId: "on-the-hour",
        startLocal: "2024-04-20T06:00:00",
      },
    ];
    expect(keys(simulate(nineEarly, austin))).not.toContain("rockmansBakery");
    // The offset is part of the text. The hour in front of it is the watch.
    expect(keys(simulate(early(10, "05:59:00-06:00"), austin)).filter((key) => key === "rockmansBakery")).toHaveLength(1);
  });

  it("ignores rides, missing clocks, and a Denver save", () => {
    expect(keys(simulate(early(10, "05:59:00", "Ride"), austin))).not.toContain("rockmansBakery");
    const blank = early(10, "05:59:00").map(({ startLocal, ...row }) => row);
    expect(keys(simulate(blank, austin))).not.toContain("rockmansBakery");
    const trail = [...early(9, "05:59:00"), { ...early(1, "05:59:00", "TrailRun")[0], date: "2024-04-20", stravaId: "trail", seq: 20, startLocal: "2024-04-20T05:59:00" }];
    expect(keys(simulate(trail, austin)).filter((key) => key === "rockmansBakery")).toHaveLength(1);
    const denver = { ...austin, city: "Denver" };
    expect(keys(simulate(early(10, "05:59:00"), denver))).not.toContain("rockmansBakery");
    expect(keys(simulate(mileRuns(50, 10), denver))).not.toContain("lbjLibrary");
  });

  it("reads earlyRuns and beforeHour from the rules", () => {
    const fewer = austinRules({ rockmansBakery: { earlyRuns: 4 } });
    expect(keys(simulate(early(3, "05:59:00"), fewer))).not.toContain("rockmansBakery");
    expect(keys(simulate(early(4, "05:59:00"), fewer)).filter((key) => key === "rockmansBakery")).toHaveLength(1);
    const five = austinRules({ rockmansBakery: { beforeHour: 5 } });
    expect(keys(simulate(early(10, "05:59:00"), five))).not.toContain("rockmansBakery");
    expect(keys(simulate(early(10, "04:59:00"), five)).filter((key) => key === "rockmansBakery")).toHaveLength(1);
  });

  it("follows the save city through replay", () => {
    const runs = early(10, "05:59:00");
    const asOf = "2026-06-01";
    expect(keys(replay(runs, { city: "Austin", startMode: "all" }, asOf))).toContain("rockmansBakery");
    expect(keys(replay(runs, { city: "Denver", startMode: "all" }, asOf))).not.toContain("rockmansBakery");
    expect(keys(replay(runs, { startMode: "all" }, asOf))).not.toContain("rockmansBakery");
  });
});

describe("startedBeforeHour", () => {
  it("compares the clock in the text, not a timezone conversion", () => {
    expect(startedBeforeHour("2024-04-01T05:59:00", 6)).toBe(true);
    expect(startedBeforeHour("2024-04-01T05:59:59", 6)).toBe(true);
    expect(startedBeforeHour("2024-04-01T06:00:00", 6)).toBe(false);
    expect(startedBeforeHour("2024-04-01T06:00:01", 6)).toBe(false);
    expect(startedBeforeHour("2024-04-01T05:59:00-06:00", 6)).toBe(true);
    expect(startedBeforeHour("2024-04-01", 6)).toBe(false);
    expect(startedBeforeHour("", 6)).toBe(false);
  });
});

describe("Denver is unchanged", () => {
  it("builds the same demo city with or without an explicit Denver name", () => {
    const plain = simulate(demo, rules);
    const named = simulate(demo, { ...rules, city: "Denver" });
    expect(named).toEqual(plain);
    expect(keys(plain)).not.toContain("lbjLibrary");
    expect(keys(plain)).not.toContain("marthasGallery");
    expect(keys(plain)).not.toContain("rockmansBakery");
  });

  it("adds the library and the gallery to an Austin replay of the same log, and not the bakery", () => {
    const city = simulate(demo, { ...rules, city: "Austin" });
    expect(city.summary.totalRunMiles).toBe(704.95);
    expect(city.buildings.filter((b) => b.type === "capitol")).toHaveLength(1);
    expect(city.landmarks.filter((l) => l.key === "lbjLibrary")).toHaveLength(1);
    expect(city.landmarks.filter((l) => l.key === "marthasGallery")).toHaveLength(1);
    expect(city.landmarks.filter((l) => l.key === "rockmansBakery")).toHaveLength(0);
  });
});
