// Roads, curbs, and sidewalks. The map decides which lots are streets
// (rules.js, via the city object). This file only paints them.
//
// A theme supplies the colors. Austin can pass different asphalt and
// a different sidewalk, or replace this function entirely, without the
// street grid changing.

import { hex, mul } from "./pixelPen";
import { project } from "./sceneLayout";

// How far the asphalt sits inside the lot, as a fraction of the lot.
// 0.30 leaves a sidewalk about 7 picture pixels wide. On a phone that
// is about two screen pixels, which is the smallest band that still
// reads as a sidewalk when the whole city is on screen. The curb is
// the darker ring between the sidewalk and the asphalt.
const CURB = 0.26;
const ASPHALT = 0.38;

export function drawStreets(pen, city, theme, ambient, night) {
  const tiles = city.map.tiles;
  const period = city.map.period;
  const grass = theme.grass.map((c) => mul(hex(c), ambient));
  const road = mul(hex(night ? theme.road.night : theme.road.day), ambient);
  const walk = mul(hex(night ? theme.sidewalk.night : theme.sidewalk.day), ambient);
  const curb = mul(hex(night ? theme.curb.night : theme.curb.day), ambient);
  const dash = hex(night ? theme.lane.night : theme.lane.day);
  const cross = hex(theme.crosswalk);
  const skirt = theme.skirt.map((c) => mul(hex(c), ambient));

  // The front lip of the diamond. Two faces, so the city sits on the
  // prairie instead of floating. The drop is 20 picture pixels, double
  // the old 10, so the lip stays the same thickness on a phone.
  pen.fillPoly(
    [project(0, tiles, 0), project(tiles, tiles, 0), project(tiles, tiles, -20), project(0, tiles, -20)],
    skirt[0],
  );
  pen.fillPoly(
    [project(tiles, tiles, 0), project(tiles, 0, 0), project(tiles, 0, -20), project(tiles, tiles, -20)],
    skirt[1],
  );

  for (let v = 0; v < tiles; v += 1) {
    for (let u = 0; u < tiles; u += 1) {
      const roadU = u % period === 0;
      const roadV = v % period === 0;
      if (!roadU && !roadV) {
        const lawn = grass[(u * 3 + v) % grass.length];
        pen.diamond(u, v, lawn);
        // A couple of darker tufts so an empty lot is not one flat color
        // once you zoom in. They are one pixel, so they disappear into
        // the lawn when the whole city is fit on a phone.
        if ((u * 5 + v * 3) % 7 === 0) {
          const [tx, ty] = project(u + 0.32, v + 0.62);
          pen.put(tx, ty, mul(lawn, [0.82, 0.86, 0.78]));
          pen.put(tx + 1, ty, mul(lawn, [1.08, 1.12, 1]));
        }
        continue;
      }
      pen.diamond(u, v, walk);
      pen.insetDiamond(u, v, CURB, curb);
      pen.insetDiamond(u, v, ASPHALT, road);
      const intersection = roadU && roadV;
      if (!intersection && roadV) {
        const a = project(u + 0.32, v + 0.5);
        const b = project(u + 0.68, v + 0.5);
        pen.hline(a[0], b[0], a[1], dash);
        pen.hline(a[0], b[0], a[1] - 1, dash);
      } else if (!intersection && roadU) {
        const a = project(u + 0.5, v + 0.32);
        const b = project(u + 0.5, v + 0.68);
        pen.hline(a[0], b[0], a[1], dash);
        pen.hline(a[0], b[0], a[1] - 1, dash);
      } else if (u > 0 && v > 0 && u < tiles - 1 && v < tiles - 1) {
        // Short pale stripes, not a solid white X. A solid mark turned
        // the whole intersection into a bright blob at phone size.
        for (let s = 0; s < 3; s += 1) {
          const a = project(u + 0.3 + s * 0.14, v + 0.42);
          const b = project(u + 0.42 + s * 0.14, v + 0.58);
          pen.hline(a[0], b[0], a[1], cross);
        }
      }
    }
  }
}
