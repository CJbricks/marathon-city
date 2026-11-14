// Proves the replay is deterministic, and that landmark caps hold.
// Cathedrals now occupy lots once the mileage bank allows them, so the
// demo city is no longer lot-for-lot identical to prototype/city.json.
// Miles are unchanged: the sample log is still 704.95 run miles.
// Streak vehicles, lifetime pedestrians, and the ride ladder are checked
// here too, because those counts have to stay stable when the rules do.

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

  it("keeps the demo walk landmarks and adds the ride stadiums the log earned", () => {
    expect(city.sideQuests.map((q) => q.name)).toEqual([
      "Coors Field",
      "Ball Arena",
      "Confluence Park bridge",
      "16th Street Mall",
      "Red Rocks Amphitheatre",
    ]);
    expect(city.sideQuests.filter((q) => q.kind === "half" || q.kind === "full")).toEqual([]);
    expect(city.transit).toEqual([]);
    // 51 finished Monday weeks, in streaks whose lengths are
    // 8, 2, 1, 4, 1, 1, 1, 1, 4, 28. Each streak contributes max(0, length - 2).
    expect(city.vehicles).toHaveLength(36);
    expect(city.vehicles.slice(0, 5).map((v) => v.type)).toEqual(["car", "truck", "bus", "police", "car"]);
    expect(city.pedestrians).toMatchObject({ count: 207, miles: 51.97 });
    expect(city.summary.vehicles).toBe(36);
    expect(city.summary.pedestrians).toBe(207);
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

function effort(type, miles, i) {
  return {
    type,
    date: `2024-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    miles,
    seconds: Math.round(miles * 540),
    seq: i,
    stravaId: `${type}-${i}`,
  };
}

describe("marathon efforts and transit", () => {
  const open = { ...rules, asOfDate: "2024-06-01" };

  it("lets a 13.1 mile trail run unlock Cherry Creek Trail", () => {
    const out = simulate([effort("TrailRun", 13.1, 0)], open);
    expect(out.sideQuests.map((q) => q.name)).toEqual(["Cherry Creek Trail"]);
    expect(out.sideQuests[0].kind).toBe("half");
    expect(out.transit).toEqual([]);
  });

  it("unlocks the trail, the zoo, and the gardens across three half marathons", () => {
    const out = simulate([13.1, 13.1, 13.1].map((m, i) => effort(i === 0 ? "TrailRun" : "Run", m, i)), open);
    expect(out.sideQuests.map((q) => q.name)).toEqual([
      "Cherry Creek Trail",
      "Denver Zoo",
      "Denver Botanic Gardens",
    ]);
  });

  it("treats a 26.2 mile run as a half and a full, and not as an ultra", () => {
    const out = simulate([effort("Run", 26.2, 0)], open);
    expect(out.sideQuests.map((q) => q.name)).toEqual(["Cherry Creek Trail", "Big Blue Bear"]);
    expect(out.transit).toEqual([]);
  });

  it("lays a bike route at 26.3 miles and cycles the transit list after that", () => {
    const one = simulate([effort("Run", 26.3, 0)], open);
    expect(one.transit.map((t) => t.mode)).toEqual(["bike"]);
    const four = simulate([26.3, 27, 30, 31].map((m, i) => effort(i % 2 ? "TrailRun" : "Run", m, i)), open);
    expect(four.transit.map((t) => t.mode)).toEqual(["bike", "bus", "lightRail", "bike"]);
  });

  it("adds trail miles to stories", () => {
    const out = simulate([effort("Trail Run", 1, 0), effort("TrailRun", 1, 1)], open);
    expect(out.summary.totalRunMiles).toBe(2);
    expect(out.buildings.reduce((s, b) => s + b.storiesBuilt, 0)).toBe(2);
  });

  it("lets weight sessions unlock nothing", () => {
    const out = simulate([effort("WeightTraining", 1, 0), effort("Workout", 1, 1)], open);
    expect(out.sideQuests).toEqual([]);
    expect(out.vehicles).toEqual([]);
    expect(out.pedestrians.count).toBe(0);
    expect(out.summary.totalRunMiles).toBe(0);
  });
});

function onDate(type, miles, date, seq) {
  return {
    type,
    date,
    miles,
    seconds: Math.round(miles * 600),
    seq,
    stravaId: `${type}-${date}-${seq}`,
  };
}

// 2024-01-01 is a Monday, so each step of 7 is the next streak week.
function mondays(start, count) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i * 7);
    return date.toISOString().slice(0, 10);
  });
}

function asOfAfter(startMonday, weeks) {
  const date = new Date(`${startMonday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

describe("ride landmarks", () => {
  const open = { ...rules, asOfDate: "2026-06-01" };

  it("earns Coors, Ball Arena, and Empower Field from year-to-date ride miles", () => {
    expect(simulate([effort("Ride", 9, 0)], open).sideQuests).toEqual([]);
    expect(simulate([effort("MountainBikeRide", 10, 0)], open).sideQuests.map((q) => q.name)).toEqual([
      "Coors Field",
    ]);
    const mid = simulate([effort("GravelRide", 25, 0)], open);
    expect(mid.sideQuests.map((q) => q.name)).toEqual(["Coors Field", "Ball Arena"]);
    expect(mid.sideQuests.every((q) => q.kind === "ride")).toBe(true);
    expect(simulate([effort("VirtualRide", 50, 0)], open).sideQuests.map((q) => q.name)).toEqual([
      "Coors Field",
      "Ball Arena",
      "Empower Field at Mile High",
    ]);
  });

  it("does not add ride miles from two different years", () => {
    const out = simulate(
      [onDate("Ride", 9, "2024-06-01", 0), onDate("EBikeRide", 9, "2025-06-01", 1)],
      open,
    );
    expect(out.sideQuests).toEqual([]);
  });

  it("keeps a stadium earned in an earlier year", () => {
    const out = simulate(
      [onDate("Ride", 10, "2015-06-01", 0), onDate("Ride", 25, "2026-05-01", 1)],
      open,
    );
    expect(out.sideQuests.map((q) => [q.name, q.year])).toEqual([
      ["Coors Field", 2015],
      ["Ball Arena", 2026],
    ]);
  });
});

describe("vehicle streaks", () => {
  const start = "2024-01-01";
  const runsOn = (dates, type = "Run") =>
    dates.map((date, i) => onDate(type, 1, date, i));

  it("awards nothing for two weeks and then cycles car, truck, bus, police", () => {
    const two = simulate(runsOn(mondays(start, 2)), { ...rules, asOfDate: asOfAfter(start, 2) });
    expect(two.vehicles).toEqual([]);
    const three = simulate(runsOn(mondays(start, 3)), { ...rules, asOfDate: asOfAfter(start, 3) });
    expect(three.vehicles.map((v) => v.type)).toEqual(["car"]);
    const six = simulate(runsOn(mondays(start, 6), "TrailRun"), { ...rules, asOfDate: asOfAfter(start, 6) });
    expect(six.vehicles.map((v) => v.type)).toEqual(["car", "truck", "bus", "police"]);
    const seven = simulate(runsOn(mondays(start, 7)), { ...rules, asOfDate: asOfAfter(start, 7) });
    expect(seven.vehicles.map((v) => v.type)).toEqual(["car", "truck", "bus", "police", "car"]);
  });

  it("waits until the week has ended", () => {
    const runs = runsOn(mondays(start, 3));
    expect(simulate(runs, { ...rules, asOfDate: "2024-01-21" }).vehicles).toEqual([]);
    expect(simulate(runs, { ...rules, asOfDate: "2024-01-22" }).vehicles).toHaveLength(1);
  });

  it("resets the streak count after a gap and does not remove the cars already earned", () => {
    const dates = ["2024-01-01", "2024-01-08", "2024-01-15", "2024-01-22", "2024-02-05", "2024-02-12", "2024-02-19"];
    const out = simulate(runsOn(dates), { ...rules, asOfDate: "2024-02-26" });
    expect(out.vehicles.map((v) => v.type)).toEqual(["car", "truck", "bus"]);
  });

  it("counts a Monday week once, and starts the next week on Monday", () => {
    const doubled = runsOn(["2024-01-02", "2024-01-04", "2024-01-08", "2024-01-15"]);
    expect(simulate(doubled, { ...rules, asOfDate: "2024-01-22" }).vehicles).toHaveLength(1);
    // Saturday and Sunday are the week of Jan 1. Monday Jan 8 is the next week.
    const boundary = runsOn(["2024-01-06", "2024-01-07", "2024-01-08", "2024-01-15"]);
    expect(simulate(boundary, { ...rules, asOfDate: "2024-01-22" }).vehicles).toHaveLength(1);
  });

  it("lets a ride-only week break the streak", () => {
    const acts = [
      ...runsOn(["2024-01-01", "2024-01-08"]),
      onDate("Ride", 30, "2024-01-15", 9),
      onDate("Run", 1, "2024-01-22", 10),
    ];
    const out = simulate(acts, { ...rules, asOfDate: "2024-01-29" });
    expect(out.vehicles).toEqual([]);
    expect(out.sideQuests.map((q) => q.name)).toEqual(["Coors Field", "Ball Arena"]);
  });

  it("reads afterWeeks from the rules", () => {
    const custom = {
      ...rules,
      asOfDate: asOfAfter(start, 2),
      vehicles: { ...rules.vehicles, afterWeeks: 0 },
    };
    expect(simulate(runsOn(mondays(start, 2)), custom).vehicles).toHaveLength(2);
  });
});

describe("pedestrians", () => {
  const open = { ...rules, asOfDate: "2026-01-01" };

  it("gives four people per lifetime walk mile and none for a shorter scrap", () => {
    const none = simulate([onDate("Walk", 0.24, "2024-05-01", 0)], open);
    expect(none.pedestrians.count).toBe(0);
    const one = simulate([onDate("Walk", 0.25, "2024-05-01", 0)], open);
    expect(one.pedestrians.count).toBe(1);
    const acrossYears = simulate(
      [onDate("Walk", 0.2, "2024-05-01", 0), onDate("Walk", 0.2, "2025-05-01", 1)],
      open,
    );
    expect(acrossYears.pedestrians.count).toBe(1);
    expect(acrossYears.pedestrians.miles).toBe(0.4);
    expect(acrossYears.sideQuests).toEqual([]);
    expect(acrossYears.pedestrians.seed).toBe(simulate(
      [onDate("Walk", 0.2, "2024-05-01", 0), onDate("Walk", 0.2, "2025-05-01", 1)],
      open,
    ).pedestrians.seed);
  });

  it("still unlocks the walk landmarks from year-to-date miles", () => {
    const out = simulate([onDate("Walk", 50, "2025-06-01", 0)], open);
    expect(out.sideQuests.map((q) => q.name)).toEqual([
      "Confluence Park bridge",
      "16th Street Mall",
      "Red Rocks Amphitheatre",
    ]);
    expect(out.pedestrians.count).toBe(200);
    expect(out.pedestrians.count).toBeGreaterThan(rules.pedestrians.maxAnimated);
  });
});
