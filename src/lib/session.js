// Identifies the browser. The cookie holds only a random user id. Strava
// tokens live in the store, keyed by that id, so a stolen page cannot read
// them from JavaScript (the cookie is httpOnly).

import { cookies } from "next/headers";
import { browserCookie } from "./browserCookie.js";

const NAME = "mc_user";
export const USER_MAX_AGE = 60 * 60 * 24 * 400;

export async function getUserId() {
  const jar = await cookies();
  let id = jar.get(NAME)?.value;
  if (!id) {
    id = crypto.randomUUID();
    jar.set(NAME, id, browserCookie(USER_MAX_AGE));
  }
  return id;
}

export async function readUserId() {
  const jar = await cookies();
  return jar.get(NAME)?.value || null;
}
