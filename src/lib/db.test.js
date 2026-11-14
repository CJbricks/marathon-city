// The file store is the laptop stand-in for Postgres. These tests check
// the three-city cap, the name, and that one city's runs do not leak into
// another. The same methods exist on the Postgres store.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { peekAttempt, recordFailure } from "./cityCode.js";
import { getStore, resetStoreCache } from "./db.js";
import { cityPayload } from "./payload.js";
import { SaveRejected } from "./saves.js";

let dir;

const run = (id, miles, date = "2026-01-02") => ({
  stravaId: id,
  type: "Run",
  date,
  miles,
  seconds: miles * 600,
  title: id,
  seq: 1,
});

beforeEach(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  dir = await mkdtemp(path.join(tmpdir(), "mc-saves-"));
  process.env.CITY_STORE_PATH = path.join(dir, "store.json");
  resetStoreCache();
});

afterEach(async () => {
  resetStoreCache();
  delete process.env.CITY_STORE_PATH;
  await rm(dir, { recursive: true, force: true });
});

describe("named saves", () => {
  it("keeps three named cities apart and refuses a blank or a fourth", async () => {
    const store = getStore();
    await store.ensureUser("user-1");
    const first = await store.createSave("user-1", {
      name: "  Training block ",
      city: "Denver",
      startMode: "all",
      demo: false,
    });
    expect(first.name).toBe("Training block");
    expect(first.slot).toBe(1);
    expect(first.active).toBe(true);
    expect(first.code).toMatch(/^\d{5}$/);
    await store.addActivities("user-1", first.id, [run("easy", 3)]);

    const second = await store.createSave("user-1", {
      name: "Long runs",
      city: "Denver",
      startMode: "date",
      startDate: "2026-06-01",
      demo: false,
    });
    await store.addActivities("user-1", second.id, [run("long", 10, "2026-06-02")]);
    await store.addActivities("user-1", second.id, [run("long", 10, "2026-06-02")]);

    expect(await store.listActivities(first.id)).toHaveLength(1);
    expect(await store.listActivities(second.id)).toHaveLength(1);
    expect(second.code).toMatch(/^\d{5}$/);
    expect(second.code).not.toBe(first.code);
    expect((await store.getSave("user-1")).id).toBe(second.id);

    await store.setActive("user-1", first.id);
    expect((await store.getSave("user-1")).name).toBe("Training block");

    const third = await store.createSave("user-1", {
      name: "Demo city",
      city: "Denver",
      startMode: "demo",
      demo: true,
    });
    expect(third.slot).toBe(3);
    await expect(store.createSave("user-1", { name: "Fourth", city: "Denver", startMode: "all" })).rejects.toBeInstanceOf(
      SaveRejected,
    );
    await expect(store.createSave("user-1", { name: "   ", city: "Denver", startMode: "all" })).rejects.toThrow(
      /Name the city/,
    );

    const replaced = await store.createSave("user-1", {
      name: "Fall block",
      city: "Denver",
      startMode: "all",
      replaceId: second.id,
    });
    expect(replaced.slot).toBe(2);
    expect(await store.listSaves("user-1")).toHaveLength(3);
    expect(await store.listActivities(second.id)).toEqual([]);
    expect(await store.listActivities(first.id)).toHaveLength(1);

    await store.clearCity("user-1", replaced.id);
    const left = await store.listSaves("user-1");
    expect(left.map((save) => save.name).sort()).toEqual(["Demo city", "Training block"]);
    expect(await store.listActivities(first.id)).toHaveLength(1);
  });

  it("reads a one-city file from before names existed", async () => {
    const userId = "user-legacy";
    await writeFile(
      process.env.CITY_STORE_PATH,
      JSON.stringify({
        users: {},
        tokens: {},
        activities: {
          [userId]: [run("old", 5, "2026-02-01")],
        },
        saves: {
          [userId]: { city: "Denver", startMode: "all", demo: false },
        },
      }),
    );
    resetStoreCache();
    const store = getStore();
    const saves = await store.listSaves(userId);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ id: userId, name: "Denver", slot: 1, active: true });
    expect(saves[0].code).toMatch(/^\d{5}$/);
    expect((await store.listSaves(userId))[0].code).toBe(saves[0].code);
    expect(await store.listActivities(userId)).toHaveLength(1);

    const added = await store.createSave(userId, {
      name: "Second",
      city: "Denver",
      startMode: "all",
    });
    expect(added.slot).toBe(2);
    expect(await store.listActivities(userId)).toHaveLength(1);
    expect(await store.listActivities(added.id)).toEqual([]);
  });

  it("replays only the active city's miles", async () => {
    const store = getStore();
    await store.ensureUser("user-2");
    const slow = await store.createSave("user-2", { name: "Easy", city: "Denver", startMode: "all" });
    await store.addActivities("user-2", slow.id, [run("a", 2, "2026-03-01")]);
    const fast = await store.createSave("user-2", { name: "Fast", city: "Denver", startMode: "all" });
    await store.addActivities("user-2", fast.id, [run("b", 8, "2026-03-02")]);

    const body = await cityPayload("user-2");
    expect(body.save.name).toBe("Fast");
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].miles).toBe(8);
    expect(body.saves.map((save) => [save.name, save.totalRunMiles])).toEqual([
      ["Easy", 2],
      ["Fast", 8],
    ]);
    expect(body.city.summary.totalRunMiles).toBe(8);
    expect(body.save.code).toMatch(/^\d{5}$/);
    expect(body.save.ownerId).toBeUndefined();
    expect(body.saves.every((save) => /^\d{5}$/.test(save.code))).toBe(true);
  });

  it("opens the same city from a code and keeps the owner's sync clock", async () => {
    const store = getStore();
    await store.ensureUser("owner");
    await store.ensureUser("guest");
    const city = await store.createSave("owner", { name: "Shared", city: "Denver", startMode: "all" });
    expect(await store.claimCode("guest", "99999")).toBeNull();
    const opened = await store.claimCode("guest", city.code);
    expect(opened.id).toBe(city.id);
    expect((await store.getSave("guest")).id).toBe(city.id);
    expect((await store.getSave("guest")).lastSyncedAt).toBeNull();

    await store.addActivities("guest", city.id, [run("guest-run", 4)]);
    expect(await store.listActivities(city.id)).toHaveLength(1);
    expect(await store.addActivities("stranger", city.id, [run("nope", 1)])).toEqual([]);

    const stamped = await store.getSave("guest");
    stamped.lastSyncedAt = "2026-11-07T00:00:00.000Z";
    await store.saveCity("guest", stamped);
    expect((await store.getSave("owner")).lastSyncedAt).toBeNull();
    expect((await store.getSave("guest")).lastSyncedAt).toBe("2026-11-07T00:00:00.000Z");

    const body = await cityPayload("guest");
    expect(body.save.id).toBe(city.id);
    expect(body.save.code).toBe(city.code);
    expect(body.activities).toHaveLength(1);
  });

  it("keeps the watch time and builds Rockman's from an Austin save", async () => {
    const store = getStore();
    await store.ensureUser("user-1");
    const save = await store.createSave("user-1", { name: "Dawn", city: "Austin", startMode: "all" });
    const rows = Array.from({ length: 10 }, (_, i) => ({
      stravaId: `dawn-${i}`,
      type: "Run",
      date: `2024-02-${String(i + 1).padStart(2, "0")}`,
      miles: 2,
      seconds: 1200,
      title: "early",
      seq: i,
      startLocal: `2024-02-${String(i + 1).padStart(2, "0")}T05:59:00`,
    }));
    await store.addActivities("user-1", save.id, rows);
    const stored = await store.listActivities(save.id);
    expect(stored[0].startLocal).toBe("2024-02-01T05:59:00");
    const body = await cityPayload("user-1");
    expect(body.city.landmarks.filter((l) => l.key === "rockmansBakery")).toHaveLength(1);
    expect(body.city.landmarks.filter((l) => l.key === "lbjLibrary")).toHaveLength(0);
  });

  it("stores a failed-code lock on the device key", async () => {
    const store = getStore();
    let state = null;
    const now = 5_000_000;
    for (let i = 0; i < 5; i += 1) {
      state = recordFailure(state, now + i);
      await store.setCodeAttempt("user:guest", state);
    }
    const saved = await store.getCodeAttempt("user:guest");
    expect(peekAttempt(saved, now + 10).allowed).toBe(false);
    expect(peekAttempt(saved, saved.lockedUntil + 1).allowed).toBe(true);
  });
});
