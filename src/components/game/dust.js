// Construction dust. A story going up should be obvious on a phone, so a
// few pixel specks rise off the base and the sides of that lot.
// The speck list is fixed. CityView fills the same eight slots every frame
// instead of allocating a new puff for every tick of the build.
//
// Distances are picture pixels on the 1280×1000 scene, double the old
// 640×500 puffs, so a speck is still a puff and not a dot next to a
// building whose stories are 6 pixels tall.

const SPECS = [
  { side: -1, along: 0.2, lag: 0.05 },
  { side: -1, along: 0.55, lag: 0.4 },
  { side: -1, along: 0.85, lag: 0.72 },
  { side: 1, along: 0.15, lag: 0.22 },
  { side: 1, along: 0.5, lag: 0.58 },
  { side: 1, along: 0.82, lag: 0.9 },
  { side: 0, along: 0.35, lag: 0.12 },
  { side: 0, along: 0.7, lag: 0.48 },
];

const slots = SPECS.map((spec) => ({ x: 0, y: 0, s: 0, tone: 0, side: spec.side }));

// anchors are the lot's west side, east side, and front corner, in scene
// pixels. side -1 is west, +1 is east, 0 is the front. A speck with s 0
// is between puffs and should not be drawn.
export function dustPuffs(now, anchors) {
  for (let i = 0; i < SPECS.length; i += 1) {
    const spec = SPECS[i];
    const slot = slots[i];
    const t = ((now / 900) + spec.lag) % 1;
    const origin = spec.side < 0 ? anchors.west : spec.side > 0 ? anchors.east : anchors.south;
    if (t > 0.92) {
      slot.s = 0;
      continue;
    }
    const drift = spec.side * (6 + t * 24);
    const rise = 8 + t * 28;
    const along = (spec.along - 0.5) * 20;
    slot.x = Math.round(origin[0] + drift + along);
    slot.y = Math.round(origin[1] - rise);
    slot.s = t < 0.55 ? 10 : 6;
    slot.tone = i % 2;
    slot.side = spec.side;
  }
  return slots;
}
