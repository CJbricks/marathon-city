// Applies src/lib/schema.sql. Run with `npm run migrate` after DATABASE_URL
// is set. Without that variable there is nothing to migrate: the app uses
// the JSON file store instead, and this script exits successfully so a
// setup script can call it either way.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("No DATABASE_URL. Using the local JSON store (.data/store.json). No migration needed.");
  process.exit(0);
}

const schema = readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf8");
const local = /localhost|127\.0\.0\.1/.test(url);
const sql = postgres(url, { ssl: local ? false : "require", max: 1 });

try {
  await sql.unsafe(schema);
  console.log("Schema is up to date.");
} finally {
  await sql.end();
}
