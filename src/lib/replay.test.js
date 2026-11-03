// The plane rule is easy to get off-by-one, so it has its own test
// instead of being buried in the animation component.
import { describe, expect, it } from "vitest";
import { shouldFlyPlane, visibleActivities } from "./replay.js";

const run = (miles, i) => ({ type: "Run", miles, date: "2024-01-0" + ((i % 9) + 1), stravaId: String(i) });

describe("shouldFlyPlane", () => {
  it("flies on the 4th and 8th run over 5 miles, and not on shorter runs", () => {
    const runs = [6, 3, 6, 6, 9, 2, 8, 7, 10].map(run);
    // Long runs are indexes 0, 2, 3, 4, 6, 7, 8. The 4th of those is index 4.
    expect(shouldFlyPlane(runs.slice(0, 1), runs[0])).toBe(false);
    expect(shouldFlyPlane(runs.slice(0, 5), runs[4])).toBe(true);
    expect(shouldFlyPlane(runs.slice(0, 8), runs[7])).toBe(false);
    expect(shouldFlyPlane(runs, runs[5])).toBe(false);
  });

  it("counts a trail run toward the flyover", () => {
    const trail = [
      { type: "TrailRun", miles: 8 },
      { type: "Run", miles: 6 },
      { type: "Run", miles: 6 },
      { type: "Trail Run", miles: 7 },
    ];
    expect(shouldFlyPlane(trail, trail[3])).toBe(true);
  });
});

describe("visibleActivities", () => {
  it("drops runs from before a chosen start date", () => {
    const activities = [
      { date: "2024-01-01", type: "Run" },
      { date: "2024-06-01", type: "Run" },
    ];
    const kept = visibleActivities(activities, { startMode: "date", startDate: "2024-05-01" });
    expect(kept.map((a) => a.date)).toEqual(["2024-06-01"]);
  });
});
