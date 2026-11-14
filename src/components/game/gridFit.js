// Where the 640×500 city picture sits when the page opens, which scales a
// pinch is allowed to stop on, and how a zoom or a drag stays on screen.
//
// Covering the whole phone (scale by the taller side) zoomed the diamond
// until its left and right corners left the screen. The old canvas was only
// about as tall as this picture, so the width set the scale and the whole
// grid fit with a margin. This does that on purpose: fit the picture inside
// the view, never crop it. A tall phone is limited by the width. A short
// desktop window is limited by the height, so the front of the diamond is
// not cut off there either. The sky and ground behind it are a separate
// layer and are not scaled by this function.
//
// Pinching in past 1× snaps to 1, 2, 3… so each city pixel becomes a solid
// block of screen pixels. The opening fit is allowed to stay a fraction
// (about 0.61 on a 390px phone). Zooming back out returns to that fit,
// centered, instead of stopping on 0.9 or 0.8. Same idea as brick-city's
// chooseScale: a whole-number scale is what keeps nearest-neighbor art crisp.
//
// The snap used to change only the scale. The picture is drawn as
// screen = pan + scene * zoom, so a bigger zoom with the same pan grows
// the city away from the top-left and the point between the fingers slides
// off that corner. placeZoom solves the pan so one scene pixel stays under
// the fingers, then clampCityPan keeps the diamond from leaving the view.

import { SCENE_H, SCENE_W } from "./pixelScene";

// Outer corners of the 22-tile diamond, in that picture's pixels.
// project(0, 0) is the back corner, project(22, 0) the right, project(0, 22)
// the left, and project(22, 22) the front. 22 is the map's tile count.
export const GRID_LEFT = 56;
export const GRID_RIGHT = 584;
export const GRID_TOP = 176;
export const GRID_BOTTOM = 440;

// The box clampCityPan watches. It is the diamond, not the full 640×500
// picture: the rest of that picture is sky and prairie, and the backdrop
// already covers those.
export const CITY_BOUNDS = {
  left: GRID_LEFT,
  right: GRID_RIGHT,
  top: GRID_TOP,
  bottom: GRID_BOTTOM,
};

// The old pinch cap. 6× is enough to read a window pixel and still leaves
// the city on the screen.
export const MAX_GRID_ZOOM = 6;

// After a pan or a zoom, this fraction of the view still has to show the
// diamond. 0.4 is a large slice of the phone, not a one-pixel sliver.
// A diamond smaller than that slice stays fully inside the view instead.
export const MIN_VISIBLE_FRACTION = 0.4;

export function gridPlacement(screenW, screenH) {
  const w = Math.max(1, screenW);
  const h = Math.max(1, screenH);
  const scale = Math.min(w / SCENE_W, h / SCENE_H);
  return {
    scale,
    x: (w - SCENE_W * scale) / 2,
    y: (h - SCENE_H * scale) / 2,
  };
}

// The ladder is the opening fit, then every whole number above it up to
// the cap. A fit of 0.61 becomes [0.61, 1, 2, 3, 4, 5, 6]. A fit of 1.8
// becomes [1.8, 2, 3, 4, 5, 6]. The fit itself is the only non-integer,
// and only because that is the scale that shows the whole city.
export function zoomSteps(fitScale, maxZoom = MAX_GRID_ZOOM) {
  const fit = Math.max(0.05, fitScale);
  const steps = [fit];
  const firstInteger = fit < 1 ? 1 : Math.floor(fit) + 1;
  for (let step = firstInteger; step <= maxZoom; step += 1) steps.push(step);
  return steps;
}

// direction +1 zooms in, -1 zooms out, one step on the ladder.
export function stepZoom(current, fitScale, direction, maxZoom = MAX_GRID_ZOOM) {
  const steps = zoomSteps(fitScale, maxZoom);
  if (direction > 0) return steps.find((step) => step > current + 1e-4) ?? steps[steps.length - 1];
  let previous = steps[0];
  for (const step of steps) {
    if (step < current - 1e-4) previous = step;
    else break;
  }
  return previous;
}

// screen = pan + scene * zoom, so the picture pixel under a finger is
// (finger - pan) / zoom. To change the scale and keep that pixel under
// the finger, pan' = finger - scene * nextZoom.
//
// Pass sceneX/sceneY when the gesture already knows which pixel to hold
// (a pinch remembers the pixel between the fingers at the start, and the
// midpoint can move). Omit them to hold whatever is under the focal point
// right now (one notch of the mouse wheel).
export function zoomAboutPoint({ panX, panY, zoom, nextZoom, focalX, focalY, sceneX, sceneY }) {
  const safeZoom = Math.abs(zoom) > 1e-6 ? zoom : 1;
  const sx = sceneX ?? (focalX - panX) / safeZoom;
  const sy = sceneY ?? (focalY - panY) / safeZoom;
  return {
    zoom: nextZoom,
    panX: focalX - sx * nextZoom,
    panY: focalY - sy * nextZoom,
    sceneX: sx,
    sceneY: sy,
  };
}

// Keep a substantial part of the diamond inside the view.
//
// The city's screen rect is pan + bounds * zoom. On each axis the overlap
// with the view has to be at least `keep` pixels. `keep` is 40% of that
// side of the view, but never more than the city and never more than the
// view: a city smaller than the slice stays fully on screen, and a city
// larger than the view can slide until only that slice remains.
// That last case is what stops a drag from parking the diamond past the edge.
function clampSpan(start, length, screen, minFraction) {
  const keep = Math.min(length, screen, Math.max(48, screen * minFraction));
  const minStart = keep - length;
  const maxStart = screen - keep;
  return Math.min(maxStart, Math.max(minStart, start));
}

export function clampCityPan({
  panX,
  panY,
  zoom,
  screenW,
  screenH,
  bounds = CITY_BOUNDS,
  minFraction = MIN_VISIBLE_FRACTION,
}) {
  const safeZoom = Math.abs(zoom) > 1e-6 ? zoom : 1;
  const width = Math.max(1, screenW);
  const height = Math.max(1, screenH);
  const cityW = Math.max(0, (bounds.right - bounds.left) * safeZoom);
  const cityH = Math.max(0, (bounds.bottom - bounds.top) * safeZoom);
  const left = panX + bounds.left * safeZoom;
  const top = panY + bounds.top * safeZoom;
  const clampedLeft = clampSpan(left, cityW, width, minFraction);
  const clampedTop = clampSpan(top, cityH, height, minFraction);
  return {
    panX: panX + (clampedLeft - left),
    panY: panY + (clampedTop - top),
  };
}

// One zoom step, as CityView applies it.
// Landing on the opening contain-fit recenters the picture. That scale is
// "show the whole city", so the corner under the fingers is not kept.
// Any other stop, including a snap to 1×, 2×, or 3×, holds the focal
// scene pixel and then clamps. The clamp can nudge the focal point when
// the fingers are over empty margin and the unclamped pan would leave
// the diamond short of the required overlap.
export function placeZoom({
  panX,
  panY,
  zoom,
  nextZoom,
  focalX,
  focalY,
  sceneX,
  sceneY,
  fitScale,
  fitX,
  fitY,
  screenW,
  screenH,
  bounds = CITY_BOUNDS,
  minFraction = MIN_VISIBLE_FRACTION,
}) {
  if (fitScale != null && Math.abs(nextZoom - fitScale) <= 1e-4) {
    return { zoom: fitScale, panX: fitX, panY: fitY };
  }
  const anchored = zoomAboutPoint({ panX, panY, zoom, nextZoom, focalX, focalY, sceneX, sceneY });
  const clamped = clampCityPan({
    panX: anchored.panX,
    panY: anchored.panY,
    zoom: nextZoom,
    screenW,
    screenH,
    bounds,
    minFraction,
  });
  return {
    zoom: nextZoom,
    panX: clamped.panX,
    panY: clamped.panY,
    sceneX: anchored.sceneX,
    sceneY: anchored.sceneY,
  };
}
