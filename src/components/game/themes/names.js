// Which city names a new save is allowed to use.
//
// This file has no pixels in it on purpose. The API route checks the name
// before it writes a row, and it should not have to load the painters to
// do that. The drawings live next door, in denver.js and austin.js.
//
// An empty name means Denver. Saves written before Austin existed stored
// "Denver", and a request that forgets the field should keep doing that.
// A name that is not in OPEN_THEMES is refused. It is not quietly drawn
// as Denver, because the person picked a card that is still marked soon.

export const OPEN_THEMES = ["Denver", "Austin"];

export function resolveTheme(name) {
  if (name == null || String(name).trim() === "") return "Denver";
  const wanted = String(name).trim().toLowerCase();
  return OPEN_THEMES.find((id) => id.toLowerCase() === wanted) || null;
}

// Denver keeps the page's built-in Nuggets colors, so it gets no extra
// class. Any other open city gets theme-<id> and the stylesheet can
// recolor the frame, the buttons, and the bottom bar for that city only.
export function themeClass(name) {
  if (!name || name === "Denver") return "";
  return `theme-${String(name).toLowerCase()}`;
}
