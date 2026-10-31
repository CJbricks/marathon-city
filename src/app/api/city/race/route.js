// POST /api/city/race
// Updates only the race date and name on the current save. Activities stay
// put. An empty date clears the celebration. The menu and the opening flow
// both call this shape; the opening flow sends the fields with the new city
// instead, because that save does not exist yet.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { cityPayload } from "@/lib/payload";
import { getUserId } from "@/lib/session";

function cleanDate(value) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function POST(request) {
  const userId = await getUserId();
  const body = await request.json().catch(() => ({}));
  const store = getStore();
  await store.ensureUser(userId);
  const save = await store.getSave(userId);
  if (!save) return NextResponse.json({ error: "No city yet." }, { status: 400 });
  save.raceDate = cleanDate(body.raceDate);
  save.raceName = body.raceName ? String(body.raceName).trim() : null;
  await store.saveCity(userId, save);
  return NextResponse.json(await cityPayload(userId));
}
