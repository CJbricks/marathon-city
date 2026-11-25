// Which landmark a tap landed on.
//
// The city is a picture that has been panned, zoomed, and maybe turned.
// A tap arrives as a page pixel. This file turns that into a picture
// pixel and asks which sprite box contains it. The box is the one
// CityView already uploaded: the dirty rectangle of that building, after
// the lot was rotated, and after a normal building was flipped. Landmarks
// are not flipped. A clock or a spire mirrored left-to-right would be a
// different building, so their scale stays 1 and the box is not slid.
//
// The front-most sprite wins. Depth is the same number the painter sorts
// by (larger means closer to the camera). A tower standing in front of
// Union Station eats the tap. A house behind the capitol does not.
//
// Nothing here reads Strava. The run, if there is one, was copied onto
// the landmark when the city was replayed.

import { mirrorBuildingSprite } from "./rotation";
import { isPopupKey } from "../../lib/landmarkNames.js";

// A finger that wobbles less than this is a tap. More than this is a pan,
// and the popup stays closed so a drag that starts on a dome still drags.
export const TAP_SLOP = 12;

export function scenePoint(canvasX, canvasY, panX, panY, zoom) {
  if (!Number.isFinite(zoom) || Math.abs(zoom) < 1e-6) return null;
  return {
    x: (canvasX - panX) / zoom,
    y: (canvasY - panY) / zoom,
  };
}

export function isTap(start, end, pinched) {
  if (pinched || !start || !end) return false;
  if (!Number.isFinite(start.x) || !Number.isFinite(end.x)) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_SLOP;
}

// 90° and 270° flip ordinary buildings, including the capitol, because
// that sprite is drawn by the building painter. Landmark sprites never
// flip. See rotation.js.
export function spriteScaleFor(kind, quarter) {
  if (kind !== "building") return 1;
  return mirrorBuildingSprite(quarter) ? -1 : 1;
}

// Pixi draws a negative scale to the left of the anchor. CityView parks
// that anchor on the right edge so the building stays on its lot. The hit
// box has to use that same left edge, or a flipped capitol would answer
// taps on the lot next door.
export function spriteBounds(positionX, positionY, width, height, scaleX) {
  const left = scaleX < 0 ? positionX - width : positionX;
  return { x: left, y: positionY, w: width, h: height };
}

function contains(point, box) {
  return (
    point.x >= box.x &&
    point.x < box.x + box.w &&
    point.y >= box.y &&
    point.y < box.y + box.h
  );
}

// The capitol is a building sprite (id "b:<id>"), not a landmark sprite.
// Its landmark row is only a record of the finish. Every other tappable
// building is a landmark sprite whose id includes the turned lot, so a
// rotated city still finds the row it just drew.
export function popupForProp(prop, city) {
  if (!prop?.id || !city) return null;
  if (prop.id.startsWith("b:")) {
    const id = Number(prop.id.slice(2));
    const building = (city.buildings || []).find((item) => item.id === id);
    if (!building || building.type !== "capitol" || !isPopupKey("capitol")) return null;
    return { key: "capitol", run: building.run || null };
  }
  if (!prop.id.startsWith("l:")) return null;
  const landmark = (city.landmarks || []).find(
    (item) => prop.id === `l:${item.key}:${item.x}:${item.y}`,
  );
  if (!landmark || !isPopupKey(landmark.key)) return null;
  return { key: landmark.key, run: landmark.run || null };
}

// boxes are sprite rectangles in picture pixels. popup is null for a
// house, a park, or a side quest. Those still count: if one of them is
// closer than the landmark, the tap is not a landmark tap.
export function pickLandmark(point, boxes) {
  if (!point || !Array.isArray(boxes)) return null;
  let best = null;
  for (const box of boxes) {
    if (!box || !contains(point, box)) continue;
    if (!best || box.depth >= best.depth) best = box;
  }
  if (!best?.popup) return null;
  return best;
}

// Where the card sits, and which point on it the scale animation grows
// from. originX/originY are relative to the card's top-left and may fall
// outside the card. That is the building: the card scales out of it
// instead of popping up at the center of the screen.
// dock is the rotate buttons. The card stays above them so a turn is
// still a tap on the button, not a tap on the card.
export function placeLandmarkPopup({
  anchorX,
  anchorY,
  width,
  height,
  viewW,
  viewH,
  margin = 8,
  dock = 76,
}) {
  const w = Math.min(width, Math.max(80, viewW - margin * 2));
  const h = Math.min(height, Math.max(40, viewH - margin * 2));
  let left = anchorX - w / 2;
  left = Math.max(margin, Math.min(left, viewW - margin - w));
  let top = anchorY - h - 10;
  if (top < margin) top = anchorY + 16;
  const floor = Math.max(margin, viewH - dock - h);
  if (top > floor) top = floor;
  if (top < margin) top = margin;
  return {
    left,
    top,
    width: w,
    originX: anchorX - left,
    originY: anchorY - top,
  };
}
