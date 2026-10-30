// Demo mode reads the checked-in activity log instead of calling Strava.
// The file stays in prototype/ because that log is the sample data, not a
// script the app executes. parseActivityFile puts the rows in the same
// order the golden test uses, so Demo city matches the prototype pictures.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseActivityFile } from "./simulate.js";

export function loadDemoActivities() {
  const text = readFileSync(path.join(process.cwd(), "prototype/activities.txt"), "utf8");
  return parseActivityFile(text);
}
