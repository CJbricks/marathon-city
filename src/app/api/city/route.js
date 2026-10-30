// POST /api/city
// Creates a save after the opening flow: a city (only Denver in the beta),
// all-history or a start date, or demo mode. Demo copies prototype/activities.txt
// in so the skyline exists with no Strava keys. Replacing a save clears the
// old activities first; Strava tokens are kept so the owner is not sent
// through OAuth again.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { loadDemoActivities } from "@/lib/demo";
import { cityPayload } from "@/lib/payload";
import { utcToday } from "@/lib/replay";
import { getUserId } from "@/lib/session";

export async function POST(request) {
  const userId = await getUserId();
  const body = await request.json().catch(() => ({}));
  if (body.city && body.city !== "Denver") {
    return NextResponse.json({ error: "Only Denver is open in the beta." }, { status: 400 });
  }
  const demo = Boolean(body.demo);
  const startMode = demo ? "demo" : body.startMode === "all" ? "all" : "date";
  const startDate = startMode === "date" ? body.startDate || utcToday() : null;
  const store = getStore();
  await store.ensureUser(userId);
  await store.clearCity(userId);
  const save = {
    city: "Denver",
    startMode,
    startDate,
    lastSyncedAt: demo ? new Date().toISOString() : null,
    demo,
    createdAt: new Date().toISOString(),
  };
  await store.saveCity(userId, save);
  if (demo) await store.addActivities(userId, loadDemoActivities());
  return NextResponse.json(await cityPayload(userId));
}
