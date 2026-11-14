// Where the 640×500 city picture sits when the page opens, and which
// scales a pinch is allowed to stop on.
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
// (about 0.61 on a 390px phone). Zooming back out returns to that fit
// instead of stopping on 0.9 or 0.8. Same idea as brick-city's chooseScale:
// a whole-number scale is what keeps nearest-neighbor art crisp.

import { SCENE_H, SCENE_W } from "./pixelScene";

// Outer corners of the 22-tile diamond, in that picture's pixels.
// project(0, 22) and project(22, 0) with origin 320 and a 12-pixel step.
export const GRID_LEFT = 56;
export const GRID_RIGHT = 584;

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

// The old pinch cap. 6× is enough to read a window pixel and still leaves
// the city on the screen.
export const MAX_GRID_ZOOM = 6;

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
