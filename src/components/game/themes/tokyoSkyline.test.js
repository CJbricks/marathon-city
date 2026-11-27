// The horizon row, and the shoji and engawa on a machiya.
//
// Denver's backdrop is the control for the snow range. Austin's is the
// control for a ridge with the snow pushed off the top. Neither theme
// has a drawHorizon, so a change that paints this row onto those cities
// fails here. The row itself is picture pixels. The view quarter never
// reaches it, which is why the pagoda stays over the same column at
// every turn. Landmarks still do not mirror. That check is the other half.

import { describe, expect, it } from "vitest";
import { lightingAtMinutes } from "../../../lib/lighting";
import { HORIZON_Y, SCENE_W, listProps, paintBackdropPixels, paintPropPixels } from "../pixelScene";
import { themeFor } from "./index";
import { SKYLINE_PLAN } from "./tokyoSkyline";

const light = lightingAtMinutes(12 * 60 + 30);

function at(data, x, y) {
  const i = (y * SCENE_W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

// Hazed vermilion. City red is (217, 58, 51). Mist pulls green and blue
// up toward the sky, so the horizon red is lighter and g sits near b.
function vermilion(r, g, b) {
  return r > 190 && r > g + 50 && r > b + 50 && Math.abs(g - b) < 40;
}

function inDisc(x, y) {
  return (x - 168) ** 2 + (y - 78) ** 2 <= 12 * 12;
}

function vermilionPixels(data) {
  const hits = [];
  for (let y = 0; y < HORIZON_Y; y += 1) {
    for (let x = 0; x < SCENE_W; x += 1) {
      if (inDisc(x, y)) continue;
      const [r, g, b] = at(data, x, y);
      if (vermilion(r, g, b)) hits.push({ x, y, r, g, b });
    }
  }
  return hits;
}

describe("Tokyo skyline", () => {
  const tokyo = paintBackdropPixels(light, "Tokyo");
  const denver = paintBackdropPixels(light, "Denver");
  const austin = paintBackdropPixels(light, "Austin");

  it("uses every roof form, and puts the concrete slab beside the old house", () => {
    const roofs = SKYLINE_PLAN.filter((piece) => piece.roof).map((piece) => piece.roof);
    expect(new Set(roofs)).toEqual(new Set(["kirizuma", "yosemune", "irimoya", "hogyo"]));
    expect(SKYLINE_PLAN.some((piece) => piece.kind === "pagoda")).toBe(true);
    expect(SKYLINE_PLAN.some((piece) => piece.kind === "gate")).toBe(true);
    expect(SKYLINE_PLAN.some((piece) => piece.kind === "temple")).toBe(true);
    const box = SKYLINE_PLAN.find((piece) => piece.kind === "box");
    const house = SKYLINE_PLAN.find((piece) => piece.id === "old-house");
    expect(box).toBeTruthy();
    expect(house.roof).toBe("irimoya");
    expect(box.x - (house.x + house.w)).toBeLessThan(12);
    expect(box.x).toBeGreaterThan(house.x);
  });

  it("keeps the pagoda the tallest vermilion, with the gate lower and no rays", () => {
    const hits = vermilionPixels(tokyo);
    expect(hits.length).toBeGreaterThan(80);
    const top = hits.reduce((best, hit) => (hit.y < best.y ? hit : best));
    const pagoda = SKYLINE_PLAN.find((piece) => piece.kind === "pagoda");
    const gate = SKYLINE_PLAN.find((piece) => piece.kind === "gate");
    expect(Math.abs(top.x - pagoda.x)).toBeLessThan(40);
    expect(top.y).toBeLessThan(HORIZON_Y - 90);
    const gateHits = hits.filter((hit) => Math.abs(hit.x - gate.x) < 80);
    expect(gateHits.length).toBeGreaterThan(20);
    const gateTop = Math.min(...gateHits.map((hit) => hit.y));
    expect(gateTop).toBeGreaterThan(top.y + 20);
    // Lighter than the plain city red, which is what the haze is for.
    const city = (0xd9 + 0x3a + 0x33) / 3;
    expect((top.r + top.g + top.b) / 3).toBeGreaterThan(city + 30);
    expect(top.r - top.b).toBeLessThan(0xd9 - 0x33);
    expect(at(tokyo, 168, 78)).toEqual([0xd9, 0x3a, 0x33]);
    expect(at(tokyo, 184, 78)).not.toEqual([0xd9, 0x3a, 0x33]);
    expect(at(tokyo, 168, 94)).not.toEqual([0xd9, 0x3a, 0x33]);
  });

  it("plants pink blossoms along the base and a glass band in the concrete slab", () => {
    let pink = 0;
    let pinkMin = SCENE_W;
    let pinkMax = 0;
    for (let y = HORIZON_Y - 36; y < HORIZON_Y; y += 1) {
      for (let x = 0; x < SCENE_W; x += 1) {
        const [r, g, b] = at(tokyo, x, y);
        if (r > 190 && b > g + 8 && r > b && g > 120) {
          pink += 1;
          if (x < pinkMin) pinkMin = x;
          if (x > pinkMax) pinkMax = x;
        }
      }
    }
    expect(pink).toBeGreaterThan(200);
    expect(pinkMax - pinkMin).toBeGreaterThan(600);

    const box = SKYLINE_PLAN.find((piece) => piece.kind === "box");
    let glass = 0;
    let concrete = 0;
    for (let y = HORIZON_Y - 70; y < HORIZON_Y - 4; y += 1) {
      for (let x = box.x; x < box.x + box.w; x += 1) {
        const [r, g, b] = at(tokyo, x, y);
        if (b > r + 2 && g > r && r > 160) glass += 1;
        if (Math.abs(r - g) < 14 && b < r - 4 && r > 170 && r < 230) concrete += 1;
      }
    }
    expect(glass).toBeGreaterThan(8);
    expect(concrete).toBeGreaterThan(20);
  });

  it("leaves Denver's snow range and Austin's hills alone", () => {
    expect(themeFor("Denver").drawHorizon).toBeUndefined();
    expect(themeFor("Austin").drawHorizon).toBeUndefined();
    expect(at(denver, 10, 0)).toEqual([0x5b, 0x8f, 0xd6]);
    expect(at(austin, 10, 0)).toEqual([0x8e, 0xc8, 0xee]);
    const snowCols = (data) => {
      const cols = [];
      for (let x = 0; x < SCENE_W; x += 1) {
        let n = 0;
        for (let y = 180; y < 330; y += 1) {
          const [r, g, b] = at(data, x, y);
          if (r > 250 && g > 250 && b > 250) n += 1;
        }
        if (n > 6) cols.push(x);
      }
      return cols;
    };
    const range = snowCols(denver);
    expect(range.length).toBeGreaterThan(8);
    expect(range[range.length - 1] - range[0]).toBeGreaterThan(400);
    expect(snowCols(tokyo)).toEqual([]);
    expect(snowCols(austin)).toEqual([]);
    // Austin's low sky is still the warm gold, not Tokyo's cream horizon.
    const low = at(austin, 10, 200);
    expect(low[0]).toBeGreaterThan(low[2]);
  });

  it("stays upright at every quarter, and landmarks still do not flip", () => {
    const pagoda = SKYLINE_PLAN.find((piece) => piece.kind === "pagoda");
    for (const quarter of [0, 1, 2, 3]) {
      const props = listProps({
        viewQuarter: quarter,
        buildings: [
          { id: 1, type: "rowhouse", x: 4, y: 4, status: "complete", targetStories: 3, storiesBuilt: 3, variant: 1 },
        ],
        landmarks: [
          { key: "courthouse", x: 6, y: 6 },
          { key: "tokyoSkytree", x: 8, y: 8 },
          { key: "cathedral", x: 9, y: 7 },
        ],
        parks: [{ name: "Cheesman Park", x: 3, y: 5 }],
        sideQuests: [{ name: "Coors Field", x: 2, y: 2 }],
      });
      expect(props.find((prop) => prop.id.startsWith("b:")).mirror).toBe(quarter % 2 === 1);
      expect(props.filter((prop) => !prop.id.startsWith("b:")).every((prop) => prop.mirror === false)).toBe(true);
    }
    // The backdrop call has no quarter. The pagoda column is the proof
    // the row was not moved to follow a turned lot.
    const hits = vermilionPixels(tokyo);
    const top = hits.reduce((best, hit) => (hit.y < best.y ? hit : best));
    expect(Math.abs(top.x - pagoda.x)).toBeLessThan(40);
  });
});

describe("Tokyo machiya", () => {
  function house(stories) {
    return listProps({
      buildings: [
        {
          id: 4,
          type: "rowhouse",
          x: 6,
          y: 6,
          status: "complete",
          targetStories: stories,
          storiesBuilt: stories,
          variant: 2,
        },
      ],
      landmarks: [],
      parks: [],
      sideQuests: [],
    })[0];
  }

  function count(picture, pred) {
    let n = 0;
    for (let i = 0; i < picture.data.length; i += 4) {
      if (picture.data[i + 3] === 0) continue;
      if (pred(picture.data[i], picture.data[i + 1], picture.data[i + 2])) n += 1;
    }
    return n;
  }

  // Paper is paler and more yellow than the plaster. The plaster hexes
  // sit at a blue of 228 or higher, or a red under 236.
  const paper = (r, g, b) => r > 235 && g > 210 && b < 230 && r - b > 28;
  const tile = (r, g, b) => r < 90 && g < 100 && b > r && g > r;

  it("paints shoji paper and an engawa roof under the main eaves", () => {
    const picture = paintPropPixels(house(3), light, "Tokyo");
    expect(count(picture, paper)).toBeGreaterThan(12);
    let tileTop = 0;
    let tileBottom = 0;
    const cut = Math.round(picture.h * 0.72);
    for (let y = 0; y < picture.h; y += 1) {
      for (let x = 0; x < picture.w; x += 1) {
        const i = (y * picture.w + x) * 4;
        if (picture.data[i + 3] === 0) continue;
        if (!tile(picture.data[i], picture.data[i + 1], picture.data[i + 2])) continue;
        if (y < picture.h * 0.35) tileTop += 1;
        if (y > cut) tileBottom += 1;
      }
    }
    expect(tileTop).toBeGreaterThan(20);
    expect(tileBottom).toBeGreaterThan(8);
  });
});
