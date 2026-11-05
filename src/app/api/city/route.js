// POST /api/city
// Creates one named save after the opening flow: a display name, a theme
// (only Denver in the beta), all-history or a start date, or demo mode,
// plus an optional race date. The name is not the theme. Demo copies
// prototype/activities.txt into this save only, so the other cities keep
// their own runs. Replacing a save deletes that slot first. Strava tokens
// stay on the user, so the next city does not ask for permission again.
// A fourth city is refused unless replaceId names one of the three.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { loadDemoActivities } from "@/lib/demo";
import { cityPayload } from "@/lib/payload";
import { utcToday } from "@/lib/replay";
import { SaveRejected } from "@/lib/saves";
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
  if (body.raceDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.raceDate)) {
    return NextResponse.json({ error: "Race day needs a real date." }, { status: 400 });
  }
  const store = getStore();
  await store.ensureUser(userId);
  try {
    const save = await store.createSave(userId, {
      name: body.name,
      city: "Denver",
      startMode,
      startDate,
      lastSyncedAt: demo ? new Date().toISOString() : null,
      demo,
      raceDate: body.raceDate || null,
      raceName: body.raceName ? String(body.raceName).trim().slice(0, 32) : null,
      replaceId: body.replaceId || null,
    });
    if (demo) await store.addActivities(userId, save.id, loadDemoActivities());
    return NextResponse.json(await cityPayload(userId));
  } catch (error) {
    if (error instanceof SaveRejected) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error?.code === "23505") {
      return NextResponse.json({ error: "That slot was just used. Try again." }, { status: 409 });
    }
    throw error;
  }
}
