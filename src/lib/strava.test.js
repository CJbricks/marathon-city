// The mapper is pure so a trail run can be checked without calling Strava.
import { describe, expect, it } from "vitest";
import { hasActivityReadAll, stravaActivityType, stravaStartLocal } from "./strava.js";

describe("stravaActivityType", () => {
  it("prefers sport_type and stores a trail run under the run list", () => {
    expect(stravaActivityType({ sport_type: "TrailRun", type: "Run" })).toBe("TrailRun");
    expect(stravaActivityType({ sport_type: "Trail Run", type: "Run" })).toBe("TrailRun");
    expect(stravaActivityType({ type: "TrailRun" })).toBe("TrailRun");
    expect(stravaActivityType({ sport_type: "Ride", type: "Run" })).toBe("Ride");
    expect(stravaActivityType({ sport_type: "GravelRide", type: "Ride" })).toBe("GravelRide");
    expect(stravaActivityType({ sport_type: "MountainBikeRide" })).toBe("MountainBikeRide");
    expect(stravaActivityType({ sport_type: "EBikeRide" })).toBe("EBikeRide");
    expect(stravaActivityType({ sport_type: "VirtualRide" })).toBe("VirtualRide");
    expect(stravaActivityType({ type: "Run" })).toBe("Run");
    expect(stravaActivityType({})).toBe("Workout");
  });
});

describe("stravaStartLocal", () => {
  it("keeps the watch time and ignores the UTC start", () => {
    expect(
      stravaStartLocal({
        start_date: "2024-04-02T11:59:00Z",
        start_date_local: "2024-04-02T05:59:00",
      }),
    ).toBe("2024-04-02T05:59:00");
    expect(stravaStartLocal({ start_date: "2024-04-02T11:59:00Z" })).toBe("");
    expect(stravaStartLocal(null)).toBe("");
  });
});

describe("hasActivityReadAll", () => {
  it("accepts only the scope that includes private runs", () => {
    expect(hasActivityReadAll("read,activity:read_all")).toBe(true);
    expect(hasActivityReadAll("read activity:read_all")).toBe(true);
    expect(hasActivityReadAll("read,activity:read")).toBe(false);
    expect(hasActivityReadAll("")).toBe(false);
  });
});
