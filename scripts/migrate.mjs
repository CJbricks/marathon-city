// Applies src/lib/schema.sql.
// `npm run migrate` runs this directly. The Vercel build runs it first,
// while the platform has the database URL, so the tables exist before the
// site starts. With no URL it logs one line and exits 0: a laptop build
// has nothing to migrate and must still succeed.
//
// DDL uses DATABASE_URL_UNPOOLED when Vercel provides it. That is the
// direct Neon connection. The pooled URL is for short runtime queries and
// is a poor place to run CREATE TABLE. The name of the variable is logged.
// The value is not.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { migrationUrl, migrationUrlLabel, postgresOptions, redactSecrets, splitSchema } from "../src/lib/pgClient.mjs";

const url = migrationUrl();
if (!url) {
  console.log("No DATABASE_URL. Skipping migration. The JSON store (.data/store.json) will be used.");
  process.exit(0);
}

const schema = readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf8");
const statements = splitSchema(schema);
const sql = postgres(url, postgresOptions(url));

try {
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  console.log(`Schema is up to date (migration used ${migrationUrlLabel()}).`);
} catch (error) {
  console.error("Migration failed.", redactSecrets(error?.message || error));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
