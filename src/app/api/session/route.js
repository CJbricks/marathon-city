// GET /api/session
// First call mints the browser's user id cookie. Every later call loads
// that user's save from the store and replays it. This is a Route Handler:
// it runs only on the server, which is why it can read the cookie and the
// database. The page itself never imports the store.

import { NextResponse } from "next/server";
import { cityPayload } from "@/lib/payload";
import { getUserId } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  const body = await cityPayload(userId);
  return NextResponse.json(body);
}
