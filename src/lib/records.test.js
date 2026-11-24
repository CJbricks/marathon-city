// Locks the medal's rules: the city's date window, the fastest effort,
// and a distance with no effort disappearing instead of showing a dash.
// These tests never call Strava. A time that is not in the cache cannot
// show up here, which is the same rule the panel uses.
import { describe, expect, it } from "vitest";
import {
  EFFORT_BATCH,
  STRAVA_DAY_LIMIT,
  STRAVA_DAY_MS,
  STRAVA_QUARTER_LIMIT,
  STRAVA_QUARTER_MS,
  STRAVA_READ_RESERVE,
  effortsFromDetail,
  formatRecordTime,
  readBudget,
  selectPersonalRecords,
} from "./records.js";

const AS_OF = "2026-11-24";

function run(id, date, efforts, extra = {}) {
  return {
    stravaId: id,
    type: "Run",
    date,
    miles: extra.miles ?? 6,
    seconds: extra.seconds ?? 3000,
    title: extra.title ?? `Run ${id}`,
    ...extra,
    stravaId: id,
    date,
  };
}

function cacheOf(entries) {
  const cache = {};
  for (const [id, efforts] of entries) cache[id] = { efforts };
  return cache;
}

describe("selectPersonalRecords", () => {
  const save = { startMode: "date", startDate: "2026-06-01" };

  it("keeps runs inside the city's start date and today, and drops the rest", () => {
    const activities = [
      run("1", "2026-05-31", null, { title: "Before the city" }),
      run("2", "2026-06-01", null, { title: "First day" }),
      run("3", "2026-11-24", null, { title: "Today" }),
      run("4", "2026-11-25", null, { title: "Tomorrow" }),
    ];
    const cache = cacheOf([
      ["1", [{ name: "1 mile", seconds: 250 }]],
      ["2", [{ name: "1 mile", seconds: 320 }]],
      ["3", [{ name: "1 mile", seconds: 300 }]],
      ["4", [{ name: "1 mile", seconds: 200 }]],
    ]);
    const result = selectPersonalRecords(activities, cache, { save, asOf: AS_OF });
    expect(result.pending).toBe(false);
    expect(result.runs).toBe(2);
    expect(result.rows).toEqual([
      {
        key: "mile",
        label: "Mile",
        seconds: 300,
        time: "5:00",
        date: "2026-11-24",
        title: "Today",
        stravaId: "3",
        url: "https://www.strava.com/activities/3",
      },
    ]);
  });

  it("uses every stored run when the city is all history", () => {
    const activities = [
      run("10", "2019-01-01"),
      run("11", "2026-11-24"),
    ];
    const cache = cacheOf([
      ["10", [{ name: "5k", seconds: 1100 }]],
      ["11", [{ name: "5k", seconds: 1200 }]],
    ]);
    const result = selectPersonalRecords(activities, cache, {
      save: { startMode: "all", startDate: null },
      asOf: AS_OF,
    });
    expect(result.rows.map((row) => row.stravaId)).toEqual(["10"]);
    expect(result.rows[0].time).toBe("18:20");
  });

  it("picks the fastest effort for each distance and hides a distance with none", () => {
    const activities = [
      run("21", "2026-07-01", null, { title: "Tempo", miles: 8 }),
      run("22", "2026-08-01", null, { title: "Long", miles: 22 }),
      run("23", "2026-09-01", null, { title: "Easy", miles: 4 }),
    ];
    const cache = cacheOf([
      ["21", [
        { name: "1 mile", seconds: 340 },
        { name: "5k", seconds: 1180 },
        { name: "10 mile", seconds: 4000 },
      ]],
      ["22", [
        { name: "1 mile", seconds: 360 },
        { name: "5k", seconds: 1100 },
        { name: "10k", seconds: 2475 },
        { name: "Half-Marathon", seconds: 5400 },
      ]],
      ["23", []],
    ]);
    const result = selectPersonalRecords(activities, cache, { save, asOf: AS_OF });
    expect(result.pending).toBe(false);
    expect(result.rows.map((row) => [row.label, row.time, row.title, row.date])).toEqual([
      ["Mile", "5:40", "Tempo", "2026-07-01"],
      ["5K", "18:20", "Long", "2026-08-01"],
      ["10K", "41:15", "Long", "2026-08-01"],
      ["Half Marathon", "1:30:00", "Long", "2026-08-01"],
    ]);
    expect(result.rows.some((row) => row.key === "marathon")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("—");
    expect(JSON.stringify(result)).not.toContain("10 mile");
  });

  it("keeps the earlier run when two efforts share a time", () => {
    const activities = [
      run("30", "2026-08-02", null, { title: "Later" }),
      run("31", "2026-07-02", null, { title: "Earlier" }),
    ];
    const cache = cacheOf([
      ["30", [{ name: "1 mile", seconds: 300 }]],
      ["31", [{ name: "1 mile", seconds: 300 }]],
    ]);
    const result = selectPersonalRecords(activities, cache, { save, asOf: AS_OF });
    expect(result.rows[0]).toMatchObject({ title: "Earlier", date: "2026-07-02", seconds: 300 });
  });

  it("does not invent a time from the activity's moving time, a ride, or an uncached run", () => {
    const activities = [
      run("40", "2026-07-04", null, { title: "Cached empty", seconds: 240, miles: 1 }),
      run("41", "2026-07-05", null, { title: "Not fetched yet", seconds: 200, miles: 1 }),
      { stravaId: "42", type: "Ride", date: "2026-07-06", miles: 20, seconds: 3000, title: "Bike" },
      { stravaId: "demo-1", type: "Run", date: "2026-07-07", miles: 26.2, seconds: 11000, title: "Demo" },
    ];
    const cache = cacheOf([
      ["40", []],
      ["42", [{ name: "1 mile", seconds: 250 }]],
    ]);
    const result = selectPersonalRecords(activities, cache, { save, asOf: AS_OF });
    expect(result.rows).toEqual([]);
    expect(result.pending).toBe(true);
    expect(result.runs).toBe(3);
    expect(result.cached).toBe(2);
  });

  it("shows a cached record while another run in range is still unfetched", () => {
    const activities = [
      run("50", "2026-07-01", null, { title: "Known" }),
      run("51", "2026-07-02", null, { title: "Waiting" }),
    ];
    const cache = cacheOf([["50", [{ name: "Marathon", seconds: 11700 }]]]);
    const result = selectPersonalRecords(activities, cache, { save, asOf: AS_OF });
    expect(result.pending).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ label: "Marathon", time: "3:15:00", title: "Known" });
  });

  it("accepts a half marathon written with a space and ignores a trail run's unknown names", () => {
    const activities = [
      { stravaId: "60", type: "TrailRun", date: "2026-08-01", miles: 15, seconds: 8000, title: "Trail" },
    ];
    const cache = cacheOf([["60", [{ name: "Half Marathon", seconds: 5000 }, { name: "400m", seconds: 70 }]]]);
    const result = selectPersonalRecords(activities, cache, { save, asOf: AS_OF });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      label: "Half Marathon",
      time: "1:23:20",
      url: "https://www.strava.com/activities/60",
    });
  });
});

describe("formatRecordTime", () => {
  it("uses m:ss under an hour and h:mm:ss at an hour", () => {
    expect(formatRecordTime(59)).toBe("0:59");
    expect(formatRecordTime(276)).toBe("4:36");
    expect(formatRecordTime(1180)).toBe("19:40");
    expect(formatRecordTime(3599)).toBe("59:59");
    expect(formatRecordTime(3600)).toBe("1:00:00");
    expect(formatRecordTime(3723)).toBe("1:02:03");
    expect(formatRecordTime(11700)).toBe("3:15:00");
    expect(formatRecordTime(0)).toBeNull();
    expect(formatRecordTime(-5)).toBeNull();
    expect(formatRecordTime("nope")).toBeNull();
  });
});

describe("effortsFromDetail", () => {
  it("reads elapsed_time for the five names and skips everything else", () => {
    const efforts = effortsFromDetail({
      best_efforts: [
        { name: "400m", elapsed_time: 70, moving_time: 70 },
        { name: "1 mile", elapsed_time: 312, moving_time: 300 },
        { name: "5K", elapsed_time: 1200 },
        { name: "10k", elapsed_time: 0, moving_time: 2400 },
        { name: "Half-Marathon", moving_time: 5000 },
        { name: "Marathon", elapsed_time: 11700.4 },
      ],
      segment_efforts: [{ name: "1 mile", elapsed_time: 200 }],
    });
    expect(efforts).toEqual([
      { name: "1 mile", seconds: 312 },
      { name: "5k", seconds: 1200 },
      { name: "marathon", seconds: 11700 },
    ]);
  });

  it("is an empty list when Strava sent no best efforts", () => {
    expect(effortsFromDetail({})).toEqual([]);
    expect(effortsFromDetail({ best_efforts: null })).toEqual([]);
  });
});

describe("readBudget", () => {
  it("stops detail fetches before the 15-minute and daily caps", () => {
    const now = Date.parse("2026-11-24T18:00:00Z");
    expect(readBudget([], now).forDetails).toBe(EFFORT_BATCH > 0 ? STRAVA_QUARTER_LIMIT - STRAVA_READ_RESERVE : 0);

    const quarterFull = Array.from({ length: STRAVA_QUARTER_LIMIT }, () => now - 60 * 1000);
    expect(readBudget(quarterFull, now).forDetails).toBe(0);

    const nearQuarter = Array.from({ length: STRAVA_QUARTER_LIMIT - STRAVA_READ_RESERVE }, () => now - 60 * 1000);
    expect(readBudget(nearQuarter, now).forDetails).toBe(0);

    const roomForFive = Array.from(
      { length: STRAVA_QUARTER_LIMIT - STRAVA_READ_RESERVE - EFFORT_BATCH },
      () => now - 60 * 1000,
    );
    expect(readBudget(roomForFive, now).forDetails).toBe(EFFORT_BATCH);

    const dayFull = Array.from({ length: STRAVA_DAY_LIMIT }, (_, i) => now - STRAVA_QUARTER_MS - i * 1000);
    expect(readBudget(dayFull, now)).toMatchObject({ quarter: 0, day: STRAVA_DAY_LIMIT, forDetails: 0 });

    const yesterday = [now - STRAVA_DAY_MS - 1000];
    expect(readBudget(yesterday, now)).toMatchObject({ quarter: 0, day: 0 });
  });
});
