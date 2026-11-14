// Deterministic city replay.
// Give it the same activities and the same rules and it returns the same
// lots, heights, landmarks, parks, side quests, transit lines, vehicles,
// and pedestrians. Nothing here is random in the usual sense: building
// types come from a seeded generator, and the seed is the activity date
// plus its position, so a re-run cannot reshuffle the skyline.
//
// The browser and the server both import this file. It must stay free of
// Node APIs (no fs, no database) so a Log run animation can replay on the
// phone without asking the server for every frame.
//
// Denver and Austin share this replay. rules.cities.Austin is the extra:
// three landmarks a Denver save never receives. replay() passes the save's
// city in as rules.city. A missing city is Denver.

import rulesDefault from "./rules.js";

const DAY = 86400000;
const toDate = (s) => new Date(s + "T00:00:00Z");
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * DAY));
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const hund = (x) => Math.round(x * 100);
const mi = (h) => +(h / 100).toFixed(2);

// Wall clock from a Strava start_date_local string. The digits after T are
// already the athlete's local time. new Date() would read that string in
// the server's zone, and a 5:59am Austin run can fall on the previous
// evening when the server is UTC. 5:59 is before 6:00. 6:00 is not. A blank
// clock (a typed distance, the demo log) is not an early run.
export function startedBeforeHour(startLocal, hour) {
  const match = /T(\d{2}):(\d{2})/.exec(String(startLocal || ""));
  if (!match) return false;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return false;
  return hh * 60 + mm < hour * 60;
}

function parseTime(t) {
  const p = String(t || "0:00").split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

// FNV-1a then mulberry32. Same string always yields the same sequence.
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(weights, r) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [k, w] of entries) {
    if ((x -= w) < 0) return k;
  }
  return entries[entries.length - 1][0];
}

// activities.txt is newest-first. Reverse it so a same-day pair keeps
// morning-then-evening order, and stamp `seq` so a later stable sort by
// date does not scramble that pair. Strava rows should pass their own seq
// (start time) instead of going through this parser.
export function parseActivityFile(text) {
  const raw = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return [...raw].reverse().map((line, seq) => {
    const [type, date, miles, moving, ...title] = line.split("|").map((s) => s.trim());
    return {
      type,
      date,
      miles: parseFloat(miles),
      seconds: parseTime(moving),
      title: title.join("|"),
      seq,
      stravaId: `demo-${seq}`,
    };
  });
}

function orderActivities(input, typeOf) {
  const acts = input.map((a, i) => ({
    type: a.type,
    kind: typeOf(a.type),
    date: a.date,
    miles: Number(a.miles),
    h: hund(Number(a.miles)),
    seconds: Number(a.seconds) || 0,
    title: a.title || "",
    stravaId: a.stravaId || `row-${i}`,
    seq: a.seq ?? i,
    // Kept as text. The bakery compares these digits to beforeHour.
    startLocal: a.startLocal || a.start_date_local || "",
  }));
  acts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
  acts.forEach((a, i) => {
    a.index = i + 1;
  });
  return acts;
}

export function simulate(input, rules = rulesDefault) {
  const R = rules;
  const typeOf = (t) => {
    for (const [k, names] of Object.entries(R.types)) if (names.includes(t)) return k;
    return "other";
  };
  const weekStart = (s) => {
    const d = toDate(s);
    const dow = d.getUTCDay();
    const back = (dow - R.parks.weekStartsOn + 7) % 7;
    return addDays(s, -back);
  };

  const acts = orderActivities(input, typeOf);
  const M = R.map;
  const period = M.blockLots + 1;
  const tiles = M.blocks * period + 1;
  const center = tiles / 2;
  const reservedBlocks = new Map();
  for (const [name, [bx, by]] of Object.entries(M.sideQuestBlocks)) {
    reservedBlocks.set(`${bx},${by}`, name);
  }
  const civic = M.civicCenter || null;
  const civicKey = civic ? `${civic.block[0]},${civic.block[1]}` : null;
  const lots = [];
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      if (x % period === 0 || y % period === 0) continue;
      const bx = Math.floor(x / period);
      const by = Math.floor(y / period);
      if (reservedBlocks.has(`${bx},${by}`) || `${bx},${by}` === civicKey) continue;
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      lots.push({
        x,
        y,
        d: Math.hypot(dx, dy),
        a: (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI),
      });
    }
  }
  lots.sort((p, q) => p.d - q.d || p.a - q.a);
  lots.forEach((l, i) => {
    l.ring = i < M.coreLots ? "core" : i < M.coreLots + M.innerLots ? "inner" : "outer";
  });
  let nextLot = 0;

  // Buildings take the nearest empty lot. Parks and landmarks skip downtown
  // so the core stays a skyline. frontBias picks a visible lot facing the
  // camera (large x+y) instead of one hidden behind a tower.
  function takeLot(isBuilding = true, frontBias = 0) {
    const skip = isBuilding ? [] : M.reserveRingsForBuildings || [];
    // held is a lot set aside for an Austin landmark that has not unlocked
    // yet. Denver never sets it, so a Denver lot is chosen exactly as before.
    const open = (l) => !l.used && !l.held && !skip.includes(l.ring);
    let lot;
    if (frontBias > 1) {
      const cand = lots.filter(open).slice(0, frontBias);
      lot = cand.sort((a, b) => b.x + b.y - (a.x + a.y) || a.d - b.d)[0];
    } else lot = lots.find(open);
    if (!lot) throw new Error("Out of lots: enlarge map.blocks in src/lib/rules.js");
    lot.used = true;
    nextLot++;
    return { x: lot.x, y: lot.y, ring: lot.ring, lotRef: lot };
  }

  const buildings = [];
  const landmarks = [];
  const parks = [];
  const sideQuests = [];
  const log = [];
  let current = null;
  let paused = null;
  let serial = 0;
  let cumRun = 0;
  let runCount = 0;
  const runDates = [];
  let bestPace = Infinity;
  // Separate from bestPace. The gallery's line can move without changing
  // when the art museum (the Blanton, in Austin) decides a run is a PR.
  let austinBestPace = Infinity;
  let earlyRuns = 0;
  const L = R.landmarks;
  const earned = new Set();
  const cityLandmarks = R.city === "Austin" ? R.cities?.Austin?.landmarks || null : null;

  function civicLot(key) {
    if (!civic || !civic.slots[key]) return null;
    const [ox, oy] = civic.slots[key];
    const x = civic.block[0] * period + 1 + ox;
    const y = civic.block[1] * period + 1 + oy;
    return { x, y, ring: "civic" };
  }

  function countType(type) {
    return buildings.filter((b) => b.type === type).length;
  }

  // Drop any type that has already hit perCity, then roll. While a type is
  // under its cap the weight table is unchanged, so the roll matches a city
  // with no caps. Past the cap, that type is simply not in the table.
  function chooseType(ring, rand) {
    const source = R.ringWeights[ring] || {};
    const weights = {};
    for (const [key, weight] of Object.entries(source)) {
      const limit = R.buildingTypes[key]?.perCity;
      if (limit != null && countType(key) >= limit) continue;
      weights[key] = weight;
    }
    if (!Object.keys(weights).length) return "rowhouse";
    return weighted(weights, rand());
  }

  function startBuilding(act) {
    serial++;
    const lot = takeLot();
    const seedStr = `${act.date}|${act.index}|${serial}`;
    const rand = rng(hashStr(seedStr));
    const type = chooseType(lot.ring, rand);
    const bt = R.buildingTypes[type];
    const target = bt.min + Math.floor(rand() * (bt.max - bt.min + 1));
    const b = {
      id: serial,
      type,
      label: bt.label,
      ring: lot.ring,
      x: lot.x,
      y: lot.y,
      targetStories: target,
      needH: (target * 100) / R.storiesPerMile,
      builtH: 0,
      startDate: act.date,
      startActivity: act.index,
      seed: seedStr,
      variant: Math.floor(rand() * 1e6),
      status: "in_progress",
      completeDate: null,
      lotRef: lot.lotRef,
    };
    buildings.push(b);
    return b;
  }

  function startCapitol(act) {
    serial++;
    const lot = civicLot("capitol") || takeLot();
    const b = {
      id: serial,
      type: "capitol",
      label: L.capitol.name,
      ring: lot.ring,
      x: lot.x,
      y: lot.y,
      targetStories: L.capitol.milesToBuild,
      needH: hund(L.capitol.milesToBuild),
      builtH: 0,
      startDate: act.date,
      startActivity: act.index,
      seed: null,
      variant: 0,
      status: "in_progress",
      completeDate: null,
    };
    buildings.push(b);
    log.push(
      `${act.date}  State Capitol unlocked at ${mi(cumRun)} cumulative run mi; construction begins`,
    );
    return b;
  }

  function placeLandmark(key, date, note) {
    const max = L[key].max ?? 1;
    if (landmarks.filter((l) => l.key === key).length >= max) return;
    earned.add(key);
    const lot = civicLot(key) || takeLot(false, M.landmarkFrontBias || 0);
    landmarks.push({
      key,
      name: L[key].name,
      date,
      note,
      x: lot.x,
      y: lot.y,
      ring: lot.ring,
    });
    log.push(`${date}  Landmark: ${L[key].name} (${note})`);
  }

  // [blockX, blockY, lotX, lotY] → the same tile the map builder uses.
  // A coordinate that lands on a road is refused so a bad edit does not
  // paint a building on the asphalt.
  function slotPosition(at) {
    if (!Array.isArray(at) || at.length < 4) return null;
    const [bx, by, ox, oy] = at;
    const x = bx * period + 1 + ox;
    const y = by * period + 1 + oy;
    if (x % period === 0 || y % period === 0) return null;
    return { x, y };
  }

  if (cityLandmarks) {
    for (const spec of Object.values(cityLandmarks)) {
      const pos = slotPosition(spec.at);
      const lot = pos && lots.find((l) => l.x === pos.x && l.y === pos.y);
      if (lot) lot.held = true;
    }
  }

  function placeCityLandmark(key, spec, date, note) {
    if (!spec) return;
    const max = spec.max ?? 1;
    if (landmarks.filter((l) => l.key === key).length >= max) return;
    const pos = slotPosition(spec.at);
    const lot = pos && lots.find((l) => l.x === pos.x && l.y === pos.y && !l.used);
    let placed;
    if (lot) {
      lot.used = true;
      lot.held = false;
      nextLot++;
      placed = { x: lot.x, y: lot.y, ring: lot.ring };
    } else {
      placed = takeLot(false, M.landmarkFrontBias || 0);
    }
    landmarks.push({
      key,
      name: spec.name,
      date,
      note,
      x: placed.x,
      y: placed.y,
      ring: placed.ring,
    });
    log.push(`${date}  Landmark: ${spec.name} (${note})`);
  }

  const runs = acts.filter((a) => a.kind === "run");
  const weekCounts = new Map();
  for (const r of runs) {
    const w = weekStart(r.date);
    weekCounts.set(w, (weekCounts.get(w) || 0) + 1);
  }
  const activeWeeks = new Set();
  for (let i = 0; i + 1 < runs.length; i++) {
    const a = runs[i].date;
    const b = runs[i + 1].date;
    if (daysBetween(a, b) > R.parks.maxGapDays) continue;
    for (let w = weekStart(a); w <= b; w = addDays(w, 7)) activeWeeks.add(w);
  }
  const parkWeeks = [...activeWeeks]
    .sort()
    .filter((w) => addDays(w, 6) < R.asOfDate)
    .filter((w) => (weekCounts.get(w) || 0) <= R.parks.maxRunsInWeek)
    .map((w) => ({ week: w, end: addDays(w, 6), runs: weekCounts.get(w) || 0 }));
  let parkPtr = 0;
  function awardParksThrough(dateExclusive) {
    while (parkPtr < parkWeeks.length && parkWeeks[parkPtr].end < dateExclusive) {
      const pw = parkWeeks[parkPtr++];
      const n = parks.length;
      const name =
        n < R.parks.namedParks.length
          ? R.parks.namedParks[n]
          : `${R.parks.genericName} #${n - R.parks.namedParks.length + 1}`;
      const lot = takeLot(false);
      parks.push({
        name,
        week: pw.week,
        date: pw.end,
        runsThatWeek: pw.runs,
        x: lot.x,
        y: lot.y,
        ring: lot.ring,
        named: n < R.parks.namedParks.length,
      });
      log.push(
        `${pw.end}  Park: ${name} (week of ${pw.week} had ${pw.runs} run${pw.runs === 1 ? "" : "s"})`,
      );
    }
  }

  const ytd = {};
  const sqEarned = new Set();
  const transit = [];

  // Walks and rides are year-to-date, and each calendar year starts at
  // zero. A name that is already earned is skipped, so next year's miles
  // can unlock the next stadium without earning the first one again.
  // Weight sessions and anything else return without a block.
  function checkSideQuests(act) {
    if (act.kind !== "walk" && act.kind !== "ride") return;
    const y = act.date.slice(0, 4);
    ytd[y] = ytd[y] || { walk: 0, ride: 0 };
    ytd[y][act.kind] += act.h;
    const list = R.sideQuests[act.kind] || [];
    for (const q of list) {
      if (sqEarned.has(q.name)) continue;
      if (q.miles == null || ytd[y][act.kind] < hund(q.miles)) continue;
      sqEarned.add(q.name);
      const [bx, by] = M.sideQuestBlocks[q.name];
      const val = `${mi(ytd[y][act.kind])} ${act.kind} mi`;
      sideQuests.push({
        name: q.name,
        kind: act.kind,
        threshold: q.miles,
        date: act.date,
        ytdAtEarn: val,
        year: +y,
        block: [bx, by],
        x: bx * period + 1,
        y: by * period + 1,
      });
      log.push(`${act.date}  Side quest: ${q.name} (${y} YTD ${val} >= ${q.miles})`);
    }
  }

  // One qualifying effort unlocks the next name in the list. A 26.2 mile
  // run can earn the next half and the next full, because it clears both
  // thresholds, and it still earns only one of each.
  function awardOrderedQuest(quest, act, kind) {
    if (!quest?.names?.length || act.h < hund(quest.miles)) return;
    const have = sideQuests.filter((q) => q.kind === kind).length;
    if (have >= quest.names.length) return;
    const name = quest.names[have];
    const [bx, by] = M.sideQuestBlocks[name];
    sideQuests.push({
      name,
      kind,
      threshold: quest.miles,
      date: act.date,
      ytdAtEarn: `${mi(act.h)} mi run`,
      year: +act.date.slice(0, 4),
      block: [bx, by],
      x: bx * period + 1,
      y: by * period + 1,
    });
    log.push(`${act.date}  Side quest: ${name} (${mi(act.h)} mi run >= ${quest.miles})`);
  }

  // Ultras are strictly longer than the marathon line. Equality stays on
  // the full-marathon list and does not lay track. The mode list wraps,
  // and there is no maximum number of segments.
  function awardTransit(act) {
    const cfg = R.transit;
    if (!cfg?.types?.length) return;
    const limit = cfg.overMiles ?? 26.2;
    if (act.h <= hund(limit)) return;
    const index = transit.length;
    const mode = cfg.types[index % cfg.types.length];
    transit.push({
      id: index + 1,
      mode,
      date: act.date,
      miles: mi(act.h),
      index,
    });
    log.push(`${act.date}  Transit: ${mode} (${mi(act.h)} mi run > ${limit})`);
  }

  for (const act of acts) {
    awardParksThrough(act.date);
    if (act.kind !== "run") {
      checkSideQuests(act);
      continue;
    }

    runCount++;
    act.runNumber = runCount;
    let rem = act.h * R.storiesPerMile;
    if (!current) current = startBuilding(act);
    while (rem > 0) {
      let chunk = Math.min(rem, current.needH - current.builtH);
      const capUnlockH = hund(L.capitol.unlockCumulativeRunMiles);
      const capMax = L.capitol.max ?? 1;
      const capitolsSoFar = () => buildings.filter((b) => b.type === "capitol").length;
      if (capitolsSoFar() < capMax && cumRun < capUnlockH) chunk = Math.min(chunk, capUnlockH - cumRun);
      current.builtH += chunk;
      cumRun += chunk;
      rem -= chunk;
      if (current.builtH >= current.needH) {
        current.status = "complete";
        current.completeDate = act.date;
        log.push(
          `${act.date}  Completed #${current.id} ${current.label} (${current.targetStories} st) on ${current.ring} lot ${current.x},${current.y}`,
        );
        if (current.type === "capitol") {
          landmarks.push({
            key: "capitol",
            name: L.capitol.name,
            date: act.date,
            note: `finished after ${L.capitol.milesToBuild} run mi`,
            x: current.x,
            y: current.y,
            ring: current.ring,
            buildingId: current.id,
          });
        }
        current = paused || startBuilding(act);
        paused = null;
      }
      if (capitolsSoFar() < capMax && cumRun >= capUnlockH) {
        earned.add("capitol");
        if (L.capitol.pauseCurrentBuilding && current.builtH > 0) {
          paused = current;
          current = startCapitol(act);
        } else if (current.builtH === 0) {
          const b0 = buildings.pop();
          serial--;
          b0.lotRef.used = false;
          nextLot--;
          current = startCapitol(act);
        } else {
          paused = current;
          current = startCapitol(act);
        }
      }
    }

    if (cumRun >= hund(L.unionStation.cumulativeRunMiles)) {
      placeLandmark("unionStation", act.date, `cumulative ${mi(cumRun)} run mi`);
    }
    runDates.push(act.date);
    const inWin = runDates.filter((d) => daysBetween(d, act.date) < L.courthouse.windowDays).length;
    if (inWin >= L.courthouse.runsInWindow) {
      placeLandmark(
        "courthouse",
        act.date,
        `${inWin} runs in ${L.courthouse.windowDays} days ending ${act.date}`,
      );
    }
    if (act.miles >= L.artMuseum.minDistance) {
      const pace = act.seconds / act.miles;
      if (runCount > L.artMuseum.afterRuns && bestPace < Infinity && pace < bestPace) {
        const fmtPace = (p) =>
          `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, "0")}`;
        placeLandmark(
          "artMuseum",
          act.date,
          `pace PR ${fmtPace(pace)}/mi on ${act.miles} mi (prev best ${fmtPace(bestPace)}/mi)`,
        );
      }
      bestPace = Math.min(bestPace, pace);
    }
    // Austin-only. The checks above are the shared milestones and are left
    // alone, including the Capitol at 250. These three read cities.Austin.
    if (cityLandmarks?.lbjLibrary && cumRun >= hund(cityLandmarks.lbjLibrary.cumulativeRunMiles)) {
      placeCityLandmark(
        "lbjLibrary",
        cityLandmarks.lbjLibrary,
        act.date,
        `cumulative ${mi(cumRun)} run mi`,
      );
    }
    if (cityLandmarks?.marthasGallery) {
      const spec = cityLandmarks.marthasGallery;
      const minDistance = spec.minDistance ?? 0;
      if (act.miles >= minDistance && act.miles > 0) {
        const pace = act.seconds / act.miles;
        const after = spec.afterRuns ?? 0;
        if (runCount > after && austinBestPace < Infinity && pace < austinBestPace) {
          placeCityLandmark("marthasGallery", spec, act.date, `pace PR on ${act.miles} mi`);
        }
        austinBestPace = Math.min(austinBestPace, pace);
      }
    }
    if (
      cityLandmarks?.rockmansBakery &&
      startedBeforeHour(act.startLocal, cityLandmarks.rockmansBakery.beforeHour ?? 6)
    ) {
      earlyRuns += 1;
      const need = cityLandmarks.rockmansBakery.earlyRuns ?? 10;
      if (earlyRuns >= need) {
        const hour = cityLandmarks.rockmansBakery.beforeHour ?? 6;
        placeCityLandmark(
          "rockmansBakery",
          cityLandmarks.rockmansBakery,
          act.date,
          `${earlyRuns} runs starting before ${hour}:00`,
        );
      }
    }
    // Cathedrals follow banked run miles, not a single long run. floor(miles /
    // milesPer) is how many exist. max null means that number has no ceiling.
    // A 13.1 mile run used to unlock one immediately; that fought this rule
    // (0–199 miles must stay at zero), so the mileage bank is the only trigger.
    const cathedral = L.cathedral;
    if (cathedral?.milesPer) {
      let want = Math.floor(cumRun / hund(cathedral.milesPer));
      if (cathedral.max != null) want = Math.min(want, cathedral.max);
      let have = landmarks.filter((l) => l.key === "cathedral").length;
      while (have < want) {
        have += 1;
        const lot = takeLot(false, M.landmarkFrontBias || 0);
        const name = have === 1 ? cathedral.name : `${cathedral.name} #${have}`;
        landmarks.push({
          key: "cathedral",
          name,
          date: act.date,
          note: `${have} per ${cathedral.milesPer} banked run mi (${mi(cumRun)} so far)`,
          x: lot.x,
          y: lot.y,
          ring: lot.ring,
        });
        log.push(
          `${act.date}  Landmark: ${name} (${mi(cumRun)} banked run mi, 1 per ${cathedral.milesPer})`,
        );
      }
    }
    awardOrderedQuest(R.sideQuests.halfMarathon, act, "half");
    awardOrderedQuest(R.sideQuests.fullMarathon, act, "full");
    awardTransit(act);
  }
  awardParksThrough(addDays(R.asOfDate, 1));

  // Streak weeks use the same Monday (parks.weekStartsOn) and the same
  // "the Sunday is over" test as parks: weekEnd < asOfDate. A week counts
  // once, no matter how many runs landed in it. Weeks that are not exactly
  // 7 days apart are a new streak. The first afterWeeks weeks of each
  // streak add nothing. Vehicles already pushed stay in the array.
  const vehicleCfg = R.vehicles || {};
  const vehicleTypes = vehicleCfg.types || [];
  const afterWeeks = vehicleCfg.afterWeeks ?? 2;
  const finishedWeeks = [];
  const seenWeeks = new Set();
  for (const run of runs) {
    const week = weekStart(run.date);
    if (seenWeeks.has(week)) continue;
    seenWeeks.add(week);
    if (addDays(week, 6) < R.asOfDate) finishedWeeks.push(week);
  }
  finishedWeeks.sort();
  const vehicles = [];
  let streak = [];
  const flushStreak = () => {
    if (vehicleTypes.length) {
      const earned = Math.max(0, streak.length - afterWeeks);
      for (let i = 0; i < earned; i++) {
        const index = vehicles.length;
        const week = streak[afterWeeks + i];
        const type = vehicleTypes[index % vehicleTypes.length];
        vehicles.push({
          id: index + 1,
          type,
          index,
          week,
          date: addDays(week, 6),
        });
        log.push(`${addDays(week, 6)}  Vehicle: ${type} (streak week of ${week})`);
      }
    }
    streak = [];
  };
  for (const week of finishedWeeks) {
    if (streak.length && daysBetween(streak[streak.length - 1], week) !== 7) flushStreak();
    streak.push(week);
  }
  flushStreak();

  // People come from every walk mile ever logged, summed in hundredths so
  // 0.1 + 0.1 + 0.1 stays 0.30. Year-to-date landmarks above do not reset
  // this total. The seed is the walk rows themselves, so the overlay can
  // place walkers without rolling a new random set on each visit.
  let lifetimeWalkH = 0;
  const walkRows = [];
  for (const act of acts) {
    if (act.kind !== "walk") continue;
    lifetimeWalkH += act.h;
    walkRows.push(`${act.stravaId}|${act.date}|${act.h}`);
  }
  const perPerson = hund(R.pedestrians?.milesPerPerson ?? 0.25);
  const pedestrianCount = perPerson > 0 ? Math.floor(lifetimeWalkH / perPerson) : 0;
  const pedestrians = {
    count: pedestrianCount,
    miles: mi(lifetimeWalkH),
    seed: hashStr(walkRows.join(";") || "no-walks"),
  };

  const done = buildings.filter((b) => b.status === "complete");
  const byType = {};
  for (const b of done) {
    if (b.type === "capitol") continue;
    byType[b.type] = (byType[b.type] || 0) + 1;
  }
  const inProg = buildings.filter((b) => b.status === "in_progress");
  const completedStories = done
    .filter((b) => b.type !== "capitol")
    .reduce((s, b) => s + b.targetStories, 0);

  const publicBuildings = buildings.map((b) => ({
    id: b.id,
    type: b.type,
    label: b.label,
    ring: b.ring,
    x: b.x,
    y: b.y,
    targetStories: b.targetStories,
    startDate: b.startDate,
    startActivity: b.startActivity,
    seed: b.seed,
    variant: b.variant,
    status: b.status,
    completeDate: b.completeDate,
    storiesBuilt: mi(b.builtH * R.storiesPerMile),
    progress: +((b.builtH / b.needH).toFixed(4)),
  }));

  return {
    map: {
      tiles,
      period,
      blockLots: M.blockLots,
      center,
      blocks: M.blocks,
    },
    buildings: publicBuildings,
    landmarks,
    parks,
    sideQuests,
    transit,
    vehicles,
    pedestrians,
    log,
    summary: {
      asOf: R.asOfDate,
      totalRunMiles: mi(cumRun),
      vehicles: vehicles.length,
      pedestrians: pedestrianCount,
      lifetimeWalkMiles: mi(lifetimeWalkH),
      buildingsCompleted: done.length,
      completedByType: byType,
      storiesInCompletedRegularBuildings: completedStories,
      inProgress: inProg.map((b) => ({
        id: b.id,
        type: b.type,
        label: b.label,
        storiesBuilt: mi(b.builtH * R.storiesPerMile),
        targetStories: b.targetStories,
        x: b.x,
        y: b.y,
      })),
      lotsUsed: nextLot,
    },
  };
}
