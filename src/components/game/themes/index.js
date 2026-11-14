// Which set of drawings a city uses.
//
// The save stores a city name ("Denver"). This file turns that name into
// the object paintScene draws with. The rules, the database, and the city
// code do not know about pixels. Adding Austin is a new file in this
// folder plus one line in THEMES. It is not a change to simulate.js.
//
// A theme has this shape:
//   id            string, the save's city name
//   ground        { far, mid, near, farUntil, midUntil } prairie colors
//   mountains     colors plus how tall the ridges are, in picture pixels
//   grass         three lawn colors
//   road          { day, night }
//   sidewalk      { day, night }
//   curb          { day, night }
//   lane          { day, night } center-line dashes
//   crosswalk     one color
//   skirt         [frontFace, sideFace] the lip under the diamond
//   drawBuilding(pen, building, ambient, night)
//   drawLandmark(pen, landmark, ambient)
//   drawPark(pen, park)
//   drawQuest(pen, quest, ambient)
//   drawStreets   optional. Omit it and the shared sidewalk painter runs.
//
// An unknown name paints Denver. The beta only creates Denver saves, and
// a typo should not draw an empty picture.

import { denverTheme } from "./denver";

const THEMES = {
  Denver: denverTheme,
};

export function themeFor(name) {
  if (name && THEMES[name]) return THEMES[name];
  return denverTheme;
}

export function themeNames() {
  return Object.keys(THEMES);
}
