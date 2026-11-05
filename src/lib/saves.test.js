// The three-slot cap and the name rule. These stay in saves.js so the
// file store and Postgres cannot drift apart.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { splitSchema } from "./pgClient.mjs";
import { MAX_SAVES, NAME_MAX, SaveRejected, cleanName, nextSlot, planCreate, saveLabel } from "./saves.js";

describe("cleanName", () => {
  it("trims, collapses spaces, and refuses a blank name", () => {
    expect(cleanName("  CJ's   Denver  ")).toBe("CJ's Denver");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("")).toBeNull();
    expect(cleanName(null)).toBeNull();
  });

  it("allows 24 characters and refuses 25", () => {
    expect(NAME_MAX).toBe(24);
    expect(cleanName("A".repeat(24))).toHaveLength(24);
    expect(cleanName("A".repeat(25))).toBeNull();
  });
});

describe("slots", () => {
  it("fills the lowest open slot and stops at three", () => {
    expect(MAX_SAVES).toBe(3);
    expect(nextSlot([])).toBe(1);
    expect(nextSlot([{ slot: 1 }, { slot: 3 }])).toBe(2);
    expect(nextSlot([{ slot: 1 }, { slot: 2 }, { slot: 3 }])).toBeNull();
  });

  it("reuses a replaced city's slot and rejects a fourth city", () => {
    const saves = [
      { id: "a", slot: 1 },
      { id: "b", slot: 2 },
      { id: "c", slot: 3 },
    ];
    expect(planCreate(saves, { name: "  Training block ", replaceId: "b" })).toEqual({
      name: "Training block",
      slot: 2,
      replaceId: "b",
    });
    expect(() => planCreate(saves, { name: "Fourth" })).toThrow(SaveRejected);
    try {
      planCreate(saves, { name: "Fourth" });
    } catch (error) {
      expect(error.status).toBe(409);
    }
    expect(() => planCreate(saves, { name: "   " })).toThrow(/Name the city/);
    expect(() => planCreate([{ id: "a", slot: 1 }], { name: "Nope", replaceId: "missing" })).toThrow(
      /not one of yours/,
    );
  });
});

describe("saveLabel", () => {
  it("tells a dated city from all-history and from demo", () => {
    expect(saveLabel({ startMode: "all" })).toBe("ALL HISTORY");
    expect(saveLabel({ startMode: "date", startDate: "2026-11-05" })).toBe("FROM 2026-11-05");
    expect(saveLabel({ demo: true, startMode: "demo" })).toBe("DEMO");
  });
});

describe("named save migration", () => {
  it("keeps each DO block as one statement", () => {
    const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
    const statements = splitSchema(sql);
    const blocks = statements.filter((statement) => statement.startsWith("DO"));
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block).toContain("BEGIN");
      expect(block).toContain("END $$");
      expect(block).toContain("save_id");
    }
    expect(statements.some((statement) => statement.startsWith("UPDATE"))).toBe(false);
    expect(statements.some((statement) => statement.includes("PRIMARY KEY (save_id)"))).toBe(true);
    expect(sql).toContain("CHECK (slot BETWEEN 1 AND 3)");
    expect(sql).toContain("BETWEEN 1 AND 24");
  });
});
