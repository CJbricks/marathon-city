// Identifies the browser. The cookie holds only a random user id. Strava
// tokens live in the store, keyed by that id, so a stolen page cannot read
// them from JavaScript (the cookie is httpOnly).

import { cookies } from "next/headers";

const NAME = "mc_user";

export async function getUserId() {
  const jar = await cookies();
  let id = jar.get(NAME)?.value;
  if (!id) {
    id = crypto.randomUUID();
    jar.set(NAME, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 400,
    });
  }
  return id;
}

export async function readUserId() {
  const jar = await cookies();
  return jar.get(NAME)?.value || null;
}
