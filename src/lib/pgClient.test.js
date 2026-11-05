import { afterEach, describe, expect, it } from "vitest";
import { healthBody, migrationUrl, migrationUrlLabel, redactSecrets, runtimeUrl, splitSchema } from "./pgClient.mjs";

const envKeys = ["DATABASE_URL", "DATABASE_URL_UNPOOLED"];

afterEach(() => {
  for (const key of envKeys) delete process.env[key];
});

describe("migration urls", () => {
  it("prefers the unpooled url and falls back to DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgres://example.test/pooled";
    process.env.DATABASE_URL_UNPOOLED = "postgres://example.test/direct";
    expect(migrationUrl()).toBe("postgres://example.test/direct");
    expect(migrationUrlLabel()).toBe("DATABASE_URL_UNPOOLED");
    expect(runtimeUrl()).toBe("postgres://example.test/pooled");
    delete process.env.DATABASE_URL_UNPOOLED;
    expect(migrationUrl()).toBe("postgres://example.test/pooled");
    expect(migrationUrlLabel()).toBe("DATABASE_URL");
  });

  it("is empty when no database is configured", () => {
    expect(migrationUrl()).toBe("");
    expect(migrationUrlLabel()).toBe("");
  });
});

describe("splitSchema", () => {
  it("keeps each idempotent statement and drops comments", () => {
    const statements = splitSchema(`
      -- header
      CREATE TABLE IF NOT EXISTS users (id TEXT);
      ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS race_name TEXT;
    `);
    expect(statements).toEqual([
      "CREATE TABLE IF NOT EXISTS users (id TEXT)",
      "ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS race_name TEXT",
    ]);
  });
});

describe("healthBody", () => {
  it("reports postgres only when the schema answers, and never a connection string", () => {
    const up = healthBody({ hasDatabase: true, onVercel: true, reachable: true, schemaReady: true });
    expect(up).toEqual({ ok: true, storage: "postgres", dbReachable: true });
    const down = healthBody({ hasDatabase: true, onVercel: true, reachable: false, schemaReady: false });
    expect(down).toEqual({ ok: false, storage: "postgres", dbReachable: false });
    const missingTable = healthBody({ hasDatabase: true, onVercel: true, reachable: true, schemaReady: false });
    expect(missingTable).toEqual({ ok: false, storage: "postgres", dbReachable: true });
    expect(JSON.stringify(up)).not.toMatch(/postgres:\/\//);
  });

  it("uses the file store locally and demo on Vercel when no database is set", () => {
    expect(healthBody({ hasDatabase: false, onVercel: false, reachable: false, schemaReady: false })).toEqual({
      ok: true,
      storage: "file",
      dbReachable: false,
    });
    expect(healthBody({ hasDatabase: false, onVercel: true, reachable: false, schemaReady: false }).storage).toBe("demo");
  });
});

describe("redactSecrets", () => {
  it("strips connection strings from an error", () => {
    const cleaned = redactSecrets("connect failed postgres://user:secret@ep.neon.tech/db?sslmode=require");
    expect(cleaned).toBe("connect failed [redacted]");
    expect(cleaned).not.toMatch(/secret/);
  });
});
