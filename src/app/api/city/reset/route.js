// POST /api/city/reset
// Forgets the city on screen and its runs, after the owner confirms.
// The other named saves stay. The Strava connection stays too, so the
// next city does not have to ask for permission again.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { cityPayload } from "@/lib/payload";
import { getUserId } from "@/lib/session";

export async function POST() {
  const userId = await getUserId();
  const store = getStore();
  await store.ensureUser(userId);
  const save = await store.getSave(userId);
  if (save) await store.clearCity(userId, save.id);
  return NextResponse.json(await cityPayload(userId));
}
