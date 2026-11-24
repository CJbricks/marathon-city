// Roads, curbs, and sidewalks. The map decides which lots are streets
// (rules.js, via the city object). This file only paints them.
//
// A theme supplies the colors. Austin can pass different asphalt and
// a different sidewalk, or replace this function entirely, without the
// street grid changing.
//
// viewQuarter on the city is a camera turn, not a new map. Each lot is
// drawn at the turned cell, and the lane dashes follow that same turn,
// so a car on the rotated road is still on asphalt. Quarter 0 uses the
// original coordinates and the original flat dashes.

import { hex, mul } from "./pixelPen";
import { rotateGridPoint, rotateLot } from "./rotation";
import { project } from "./sceneLayout";

// How far the asphalt sits inside the lot, as a fraction of the lot.
// 0.30 leaves a sidewalk about 7 picture pixels wide. On a phone that
// is about two screen pixels, which is the smallest band that still
// reads as a sidewalk when the whole city is on screen. The curb is
// the darker ring between the sidewalk and the asphalt.
const CURB = 0.26;
const ASPHALT = 0.38;

// A turned dash is a short diagonal. The unturned one is a flat hline,
// which is what the city has always drawn, so quarter 0 stays put.
function dashLine(pen, a, b, color, thick) {
  const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    pen.put(x, y, color);
    if (thick) pen.put(x, y - 1, color);
  }
}

export function drawStreets(pen, city, theme, ambient, night) {
  const tiles = city.map.tiles;
  const period = city.map.period;
  const quarter = city.viewQuarter || 0;
  // The lip under the near edge stays on the camera side. It is what
  // keeps the city from looking like it floats. The lake is the piece
  // that belongs to a compass edge, and it turns with the map.
  const at = (u, v) => {
    if (!quarter) return [u, v];
    return rotateGridPoint(u, v, quarter, tiles);
  };
  const cell = (u, v) => {
    if (!quarter) return [u, v];
    return rotateLot(u, v, quarter, tiles, 1);
  };
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
      const [cu, cv] = cell(u, v);
      if (!roadU && !roadV) {
        const lawn = grass[(u * 3 + v) % grass.length];
        pen.diamond(cu, cv, lawn);
        // A couple of darker tufts so an empty lot is not one flat color
        // once you zoom in. They are one pixel, so they disappear into
        // the lawn when the whole city is fit on a phone.
        if ((u * 5 + v * 3) % 7 === 0) {
          const [gx, gy] = at(u + 0.32, v + 0.62);
          const [tx, ty] = project(gx, gy);
          pen.put(tx, ty, mul(lawn, [0.82, 0.86, 0.78]));
          pen.put(tx + 1, ty, mul(lawn, [1.08, 1.12, 1]));
        }
        continue;
      }
      pen.diamond(cu, cv, walk);
      pen.insetDiamond(cu, cv, CURB, curb);
      pen.insetDiamond(cu, cv, ASPHALT, road);
      const intersection = roadU && roadV;
      const mark = (u0, v0, u1, v1, color, thick) => {
        const [p, q] = [at(u0, v0), at(u1, v1)];
        const a = project(p[0], p[1]);
        const b = project(q[0], q[1]);
        if (!quarter) {
          pen.hline(a[0], b[0], a[1], color);
          if (thick) pen.hline(a[0], b[0], a[1] - 1, color);
        } else {
          dashLine(pen, a, b, color, thick);
        }
      };
      if (!intersection && roadV) {
        mark(u + 0.32, v + 0.5, u + 0.68, v + 0.5, dash, true);
      } else if (!intersection && roadU) {
        mark(u + 0.5, v + 0.32, u + 0.5, v + 0.68, dash, true);
      } else if (u > 0 && v > 0 && u < tiles - 1 && v < tiles - 1) {
        // Short pale stripes, not a solid white X. A solid mark turned
        // the whole intersection into a bright blob at phone size.
        for (let s = 0; s < 3; s += 1) {
          mark(u + 0.3 + s * 0.14, v + 0.42, u + 0.42 + s * 0.14, v + 0.58, cross, false);
        }
      }
    }
  }
}
