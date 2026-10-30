// GET /api/strava/start
// Sends the browser to Strava's own authorize page. `state` is a random
// value we also store in a cookie; the callback rejects a redirect whose
// state does not match, which is what stops another site from finishing
// the login for this browser.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeUrl, stravaConfigured } from "@/lib/strava";

export async function GET() {
  if (!stravaConfigured()) {
    return NextResponse.json(
      { error: "Strava keys are not set. Add them to .env.local or use Demo city." },
      { status: 400 },
    );
  }
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set("mc_oauth", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
  });
  return NextResponse.redirect(authorizeUrl(state));
}
