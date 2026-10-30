// Turns a saved activity list into the city the screen draws.
// Both the route handlers and the browser call this, with the asOf date
// the server chose. Sharing that date matters: parks are awarded only for
// weeks that have fully ended by asOf, so the two sides must agree or the
// animation would finish on a different skyline than the database.

import rules from "./rules.js";
import { simulate } from "./simulate.js";

export function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function visibleActivities(activities, save) {
  if (!save || save.startMode !== "date" || !save.startDate) return activities;
  return activities.filter((a) => a.date >= save.startDate);
}

export function replay(activities, save, asOf = utcToday()) {
  return simulate(visibleActivities(activities, save), { ...rules, asOfDate: asOf });
}

// Every 4th run longer than 5 miles gets the plane. `runs` includes the
// run being played, in chronological order.
export function shouldFlyPlane(runs, run) {
  if (!run || run.type !== "Run" || Number(run.miles) <= 5) return false;
  const n = runs.filter((r) => r.type === "Run" && Number(r.miles) > 5).length;
  return n > 0 && n % 4 === 0;
}
