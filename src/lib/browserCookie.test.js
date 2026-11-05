import { describe, expect, it } from "vitest";
import { browserCookie } from "./browserCookie.js";

describe("browserCookie", () => {
  it("is httpOnly, Lax, and site-wide so the Strava redirect can send it back", () => {
    expect(browserCookie(60)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
  });
});