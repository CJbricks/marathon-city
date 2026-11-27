// Which set of drawings a city uses.
//
// The save stores a city name ("Denver", "Austin", or "Tokyo"). This file
// turns that name into the object paintScene draws with. The rules, the
// database, and the city code do not know about pixels. Adding a city is
// a new file in this folder, one line in THEMES, and one name in names.js.
// Tokyo is the worked example. See docs/NOTES.md.
//
// Austin's library, gallery, and bakery are the exception to "art only".
// Their thresholds live in rules.js under cities.Austin, and simulate.js
// places them only when the save's city is Austin. A city that only
// changes drawings still does not need a simulator change.
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
//   There is no lake field. Austin used to pass one, and pixelScene painted
//   a ribbon from it. The ribbon left gaps. The gaps showed the pinned
//   prairie, which does not zoom, and a turn did not keep the ribbon on
//   the shore. A new city draws a shore inside a lot if it needs one.
//   drawBuilding(pen, building, ambient, night)
//   drawLandmark(pen, landmark, ambient, night)
//   drawPark(pen, park)
//   drawQuest(pen, quest, ambient)
//   drawStreets   optional. Omit it and the shared sidewalk painter runs.
//   drawHorizon   optional. (pen, horizonY, light) paints the distance
//                 behind the city instead of the shared seven-peak ridge.
//                 Tokyo uses it for a faded architectural skyline.
//                 Omit it and the ridge runs.
//
// night is true at dusk and night. Denver's landmark painter ignores it.
// Austin uses it for the tower's orange crown.
//
// An unknown name paints Denver. A typo should not draw an empty picture.
// The list of names a new save may use lives in names.js, not here.

import { austinTheme } from "./austin";
import { denverTheme } from "./denver";
import { tokyoTheme } from "./tokyo";

export { OPEN_THEMES, PICKER_CITIES, resolveTheme, themeClass } from "./names";

const THEMES = {
  Denver: denverTheme,
  Austin: austinTheme,
  Tokyo: tokyoTheme,
};

export function themeFor(name) {
  if (name && THEMES[name]) return THEMES[name];
  return denverTheme;
}

export function themeNames() {
  return Object.keys(THEMES);
}
