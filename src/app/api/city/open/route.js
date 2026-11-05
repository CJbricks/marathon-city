// POST /api/city/open
// Makes one of this user's saved cities the one on screen. The other
// saves stay. The response is the same payload as /api/session, replayed
// from the opened city's own runs.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { cityPayload } from "@/lib/payload";
import { getUserId } from "@/lib/session";

export async function POST(request) {
  const userId = await getUserId();
  const body = await request.json().catch(() => ({}));
  const saveId = typeof body.saveId === "string" ? body.saveId : "";
  if (!saveId) return NextResponse.json({ error: "Pick a city." }, { status: 400 });
  const store = getStore();
  await store.ensureUser(userId);
  const save = await store.setActive(userId, saveId);
  if (!save) return NextResponse.json({ error: "That city is not one of yours." }, { status: 404 });
  return NextResponse.json(await cityPayload(userId));
}
