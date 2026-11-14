// The size of the city picture, and the math that turns a lot into pixels.
//
// The city used to be a 640×500 picture: each lot was 24 pixels wide and
// 12 tall, and one story was 3 pixels. This file doubles that. A phone
// still fits the whole diamond, because the picture and the lots grew by
// the same amount. The extra pixels are what windows, doors, and curbs
// are drawn with. Zooming to 1×, 2×, 3× then shows those pixels as solid
// blocks instead of blending them.
//
// Themes import this. They do not pick their own grid size, so Austin
// (when it exists) sits on the same streets as Denver.

export const SCENE_W = 1280;
export const SCENE_H = 1000;

// Origin of lot (0, 0). It sits near the middle of the picture so the
// diamond has sky above it and prairie below it.
export const OX = 640;
export const OY = 352;

// Where the painted sky stops and the prairie starts. CityView lines the
// flat full-screen ground up with this row.
export const HORIZON_Y = OY - 16;

// Half the width and half the height of one lot, in picture pixels.
// The 2:1 ratio is what makes the grid look isometric.
export const HW = 24;
export const HH = 12;

// One story, in picture pixels. A 10-story office is 60 pixels of wall.
export const STORY = 6;

// The Denver map is 7 blocks of 2 lots plus the road between them, which
// is 22 tiles on a side. gridFit watches this diamond, not the empty sky.
export const MAP_TILES = 22;

export function project(u, v, z = 0) {
  return [OX + (u - v) * HW, OY + (u + v) * HH - z];
}

// Outer corners of the diamond. project(0, 0) is the back corner,
// project(tiles, 0) the right, project(0, tiles) the left, and
// project(tiles, tiles) the front.
export function cityDiamond(tiles = MAP_TILES) {
  const back = project(0, 0);
  const right = project(tiles, 0);
  const left = project(0, tiles);
  const front = project(tiles, tiles);
  return {
    left: left[0],
    right: right[0],
    top: back[1],
    bottom: front[1],
  };
}
