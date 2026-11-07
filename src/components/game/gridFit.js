// Where the 640×500 city picture sits when the page opens.
// Covering the whole phone (scale by the taller side) zoomed the diamond
// until its left and right corners left the screen. The old canvas was only
// about as tall as this picture, so the width set the scale and the whole
// grid fit with a margin. This does that on purpose: fit the picture inside
// the view, never crop it. A tall phone is limited by the width. A short
// desktop window is limited by the height, so the front of the diamond is
// not cut off there either. The sky and ground behind it are a separate
// layer and are not scaled by this function.

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
