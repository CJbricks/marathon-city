// Which set of drawings a city uses.
//
// The save stores a city name ("Denver" or "Austin"). This file turns
// that name into the object paintScene draws with. The rules, the
// database, and the city code do not know about pixels. Adding a third
// city is a new file in this folder, one line in THEMES, and one name
// in names.js. It is not a change to simulate.js.
//
// A theme has this shape:
//   id            string, the save's city name
//   labels        optional map of slot key or quest name to a display name
//   ground        { far, mid, near, farUntil, midUntil } prairie colors
//   mountains     colors plus how tall the ridges are, in picture pixels
//   grass         three lawn colors
//   road          { day, night }
//   sidewalk      { day, night }
//   curb          { day, night }
//   lane          { day, night } center-line dashes
//   crosswalk     one color
//   skirt         [frontFace, sideFace] the lip under the diamond
//   sky           optional. { day: [top, mid, horizon], night: same, cloud }
//                 replaces the clock sky. Omit it and the keyframe sky is used.
//   lake          optional. { color, shine, band } a ribbon along the front
//                 edge of the diamond, `band` picture pixels wide. Omit it
//                 and the ground stays dry. The band is not the whole foreground.
//   drawBuilding(pen, building, ambient, night)
//   drawLandmark(pen, landmark, ambient, night)
//   drawPark(pen, park)
//   drawQuest(pen, quest, ambient)
//   drawStreets   optional. Omit it and the shared sidewalk painter runs.
//
// night is true at dusk and night. Denver's landmark painter ignores it.
// Austin uses it for the tower's orange crown.
//
// An unknown name paints Denver. A typo should not draw an empty picture.
// The list of names a new save may use lives in names.js, not here.

import { austinTheme } from "./austin";
import { denverTheme } from "./denver";

export { OPEN_THEMES, resolveTheme, themeClass } from "./names";

const THEMES = {
  Denver: denverTheme,
  Austin: austinTheme,
};

export function themeFor(name) {
  if (name && THEMES[name]) return THEMES[name];
  return denverTheme;
}

export function themeNames() {
  return Object.keys(THEMES);
}
