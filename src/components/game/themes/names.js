// Which city names a new save is allowed to use.
//
// This file has no pixels in it on purpose. The API route checks the name
// before it writes a row, and it should not have to load the painters to
// do that. The drawings live next door, in denver.js, austin.js, and tokyo.js.
//
// An empty name means Denver. Saves written before Austin existed stored
// "Denver", and a request that forgets the field should keep doing that.
// A name that is not in OPEN_THEMES is refused. It is not quietly drawn
// as Denver, because the person picked a card that is still marked soon.

// Flagstaff and New York are cards on the picker, and they are not in
// OPEN_THEMES, so the API still refuses them. Tokyo is open the same way
// Austin is: the name is stored, and the theme file does the drawing.
export const OPEN_THEMES = ["Denver", "Austin", "Tokyo"];

// Picker order. A name in this list but not in OPEN_THEMES stays a SOON
// card. Flagstaff replaced the locked Boulder card. The word is split
// onto two lines in Screens.js because it does not fit the pixel face
// in one row of that card.
export const PICKER_CITIES = ["AUSTIN", "DENVER", "FLAGSTAFF", "NEW YORK", "TOKYO"];

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
