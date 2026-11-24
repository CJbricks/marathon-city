// Turns the city view by 90 degrees without editing the save.
//
// The lots in the city object are the layout the rules built. A turn is
// only a different camera. orientCity copies the things we draw and
// gives the copy new coordinates. The original buildings keep the x and
// y that a city code would rebuild. Cars and the streets read the same
// turn so they land on those moved lots. There is no lake to turn. The
// ribbon that used to follow the south edge gapped and crossed the lots.
//
// The map is a square, tiles on a side. Its center is tiles / 2. One
// click of the right button is one clockwise quarter, and the right
// corner of the diamond moves to the front:
//
//   (u, v) -> (tiles - v, u)
//
// The center point stays put, so the city spins in place instead of
// sliding. Four right turns are a full circle. One left turn is the
// opposite formula, (u, v) -> (v, tiles - u), and it undoes one right.
//
// Depth is "how close to the camera." In this projection that is u + v:
// a bigger sum is lower on the screen and is drawn later. After a turn
// the sum has to be the turned u and v. A tower that moved to the front
// then covers the cars in front of it. Sorting by the old sum would
// leave that tower behind a car it should hide.

import { MAP_TILES } from "./sceneLayout";

export const ROTATION_KEY = "mc-view-quarter";

// 0, 1, 2, 3. Negatives wrap, so a left turn from 0 is 3 (270°).
export function normalizeQuarter(turns) {
  const n = Number(turns);
  if (!Number.isFinite(n)) return 0;
  return ((Math.trunc(n) % 4) + 4) % 4;
}

export function quarterRight(turns) {
  return normalizeQuarter(turns + 1);
}

export function quarterLeft(turns) {
  return normalizeQuarter(turns - 1);
}

// Clockwise quarters. 0 returns the same point, with the same numbers,
// so a city that has not been turned paints the pixels it always did.
export function rotateGridPoint(u, v, quarterTurns, tiles = MAP_TILES) {
  const turns = normalizeQuarter(quarterTurns);
  if (turns === 0) return [u, v];
  // Right: the right corner (tiles, 0) becomes the front (tiles, tiles).
  if (turns === 1) return [tiles - v, u];
  if (turns === 2) return [tiles - u, tiles - v];
  // Left of the original, which is also three rights.
  return [v, tiles - u];
}

// A lot is stored by its back corner, the corner farthest from the
// camera. Turning the square moves a different corner into the back.
// Using the old corner as the new origin would slide the building by a
// whole lot. The new origin is the back corner of the turned square,
// the minimum u and the minimum v of the four corners.
export function rotateLot(x, y, quarterTurns, tiles = MAP_TILES, span = 1) {
  const turns = normalizeQuarter(quarterTurns);
  if (turns === 0) return [x, y];
  const s = span;
  const corners = [
    rotateGridPoint(x, y, turns, tiles),
    rotateGridPoint(x + s, y, turns, tiles),
    rotateGridPoint(x, y + s, turns, tiles),
    rotateGridPoint(x + s, y + s, turns, tiles),
  ];
  let minU = corners[0][0];
  let minV = corners[0][1];
  for (let i = 1; i < corners.length; i += 1) {
    if (corners[i][0] < minU) minU = corners[i][0];
    if (corners[i][1] < minV) minV = corners[i][1];
  }
  return [minU, minV];
}

// Buildings are drawn for one isometric angle: dark wall on the left,
// mid wall on the right, roof toward the viewer. There is no second
// drawing for the other compass directions. A horizontal flip at 90°
// and 270° swaps the two walls, which reads as the other diagonal.
// 0° and 180° stay unflipped so roofs stay upright. Landmarks and side
// quests are not flipped. A clock or a sign mirrored would be harder
// to recognize, and this game does not draw readable words on them.
export function mirrorBuildingSprite(quarterTurns) {
  const turns = normalizeQuarter(quarterTurns);
  return turns === 1 || turns === 3;
}

function moveItem(item, quarter, tiles, span) {
  const [x, y] = rotateLot(item.x, item.y, quarter, tiles, span);
  return { ...item, x, y };
}

// A drawing copy. Vehicles and the map stay as they are: roads are
// still described in the saved grid, and the painters turn each point
// as they draw it. viewQuarter is how those painters know which way.
// Quarter 0 returns the same object so nothing downstream can tell a
// turn happened.
export function orientCity(city, quarterTurns) {
  if (!city) return city;
  const quarter = normalizeQuarter(quarterTurns);
  if (quarter === 0) return city;
  const tiles = city.map?.tiles || MAP_TILES;
  return {
    ...city,
    viewQuarter: quarter,
    buildings: (city.buildings || []).map((item) => moveItem(item, quarter, tiles, 1)),
    landmarks: (city.landmarks || []).map((item) => moveItem(item, quarter, tiles, 1)),
    parks: (city.parks || []).map((item) => moveItem(item, quarter, tiles, 1)),
    sideQuests: (city.sideQuests || []).map((item) => moveItem(item, quarter, tiles, 2)),
  };
}

export function readStoredQuarter() {
  if (typeof window === "undefined") return 0;
  try {
    return normalizeQuarter(window.localStorage.getItem(ROTATION_KEY));
  } catch {
    return 0;
  }
}

export function storeQuarter(quarter) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROTATION_KEY, String(normalizeQuarter(quarter)));
  } catch {
    // Private mode can refuse storage. The turn still shows this visit.
  }
}
