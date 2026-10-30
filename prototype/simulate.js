#!/usr/bin/env node
// Marathon City simulator: replays activities oldest-first using rules.js
// and writes city.json + summary.txt.   Usage: node simulate.js [rules.js]
'use strict';
const fs = require('fs');
const path = require('path');

const rulesPath = path.resolve(process.argv[2] || path.join(__dirname, 'rules.js'));
const R = require(rulesPath);
const DIR = path.dirname(rulesPath);

// ---------- helpers ----------
const DAY = 86400000;
const toDate = (s) => new Date(s + 'T00:00:00Z');
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * DAY));
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const hund = (x) => Math.round(x * 100);          // miles -> integer hundredths
const mi = (h) => +(h / 100).toFixed(2);
function parseTime(t) {
  const p = t.split(':').map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}
function weekStart(s) {             // Monday (or configured day) of the week
  const d = toDate(s);
  const dow = d.getUTCDay();
  const back = (dow - R.parks.weekStartsOn + 7) % 7;
  return addDays(s, -back);
}
// FNV-1a + mulberry32: deterministic seeded RNG
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
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
  for (const [k, w] of entries) { if ((x -= w) < 0) return k; }
  return entries[entries.length - 1][0];
}
const typeOf = (t) => {
  for (const [k, names] of Object.entries(R.types)) if (names.includes(t)) return k;
  return 'other';
};

// ---------- load activities (oldest first) ----------
const raw = fs.readFileSync(path.join(DIR, R.activitiesFile), 'utf8')
  .split('\n').map((l) => l.trim()).filter(Boolean);
let acts = raw.map((line, fileIdx) => {
  const [type, date, miles, moving, ...title] = line.split('|').map((s) => s.trim());
  return { type, kind: typeOf(type), date, miles: parseFloat(miles), h: hund(parseFloat(miles)),
    seconds: parseTime(moving), title: title.join('|'), fileIdx };
});
// File is newest-first; reverse so same-day entries are in chronological
// order, then stable-sort by date.
acts.reverse();
acts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
acts.forEach((a, i) => (a.index = i + 1));

// ---------- map / lots ----------
const M = R.map;
const period = M.blockLots + 1;
const tiles = M.blocks * period + 1;
const center = tiles / 2;
const reservedBlocks = new Map();
for (const [name, [bx, by]] of Object.entries(M.sideQuestBlocks)) reservedBlocks.set(`${bx},${by}`, name);
const civic = M.civicCenter || null;
const civicKey = civic ? `${civic.block[0]},${civic.block[1]}` : null;
const lots = [];
for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) {
  if (x % period === 0 || y % period === 0) continue;
  const bx = Math.floor(x / period), by = Math.floor(y / period);
  if (reservedBlocks.has(`${bx},${by}`) || `${bx},${by}` === civicKey) continue;
  const dx = x + 0.5 - center, dy = y + 0.5 - center;
  lots.push({ x, y, d: Math.hypot(dx, dy), a: (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI) });
}
lots.sort((p, q) => p.d - q.d || p.a - q.a);
lots.forEach((l, i) => (l.ring = i < M.coreLots ? 'core' : i < M.coreLots + M.innerLots ? 'inner' : 'outer'));
let nextLot = 0; // number of lots used
// Buildings take the nearest empty lot. Parks and civic landmarks take the
// nearest empty lot outside the rings listed in rules.map.reserveRingsForBuildings.
function takeLot(isBuilding = true, frontBias = 0) {
  const skip = isBuilding ? [] : (M.reserveRingsForBuildings || []);
  let l;
  if (frontBias > 1) {
    // among the frontBias nearest eligible lots, take the one closest to the
    // camera (largest x+y) so low landmarks are not hidden behind towers
    const cand = lots.filter((l) => !l.used && !skip.includes(l.ring)).slice(0, frontBias);
    l = cand.sort((a, b) => (b.x + b.y) - (a.x + a.y) || a.d - b.d)[0];
  } else l = lots.find((l) => !l.used && !skip.includes(l.ring));
  if (!l) throw new Error('Out of lots: enlarge map.blocks in rules.js');
  l.used = true; nextLot++;
  return { x: l.x, y: l.y, ring: l.ring, lotRef: l };
}

// ---------- state ----------
const buildings = [];
const landmarks = [];
const parks = [];
const sideQuests = [];
const log = [];
let current = null, paused = null, serial = 0;
let cumRun = 0;  // hundredths
let runCount = 0;
const runDates = [];
let bestPace = Infinity, prAwarded = false;
let longRunSum = 0;
const L = R.landmarks;
const earned = new Set();

// Civic landmarks go to their slot on the Civic Center block if configured.
function civicLot(key) {
  if (!civic || !civic.slots[key]) return null;
  const [ox, oy] = civic.slots[key];
  const x = civic.block[0] * period + 1 + ox, y = civic.block[1] * period + 1 + oy;
  return { x, y, ring: 'civic' };
}
function startBuilding(act) {
  serial++;
  const lot = takeLot();
  const seedStr = `${act.date}|${act.index}|${serial}`;
  const rand = rng(hashStr(seedStr));
  const type = weighted(R.ringWeights[lot.ring], rand());
  const bt = R.buildingTypes[type];
  const target = bt.min + Math.floor(rand() * (bt.max - bt.min + 1));
  const b = { id: serial, type, label: bt.label, ring: lot.ring, x: lot.x, y: lot.y,
    targetStories: target, needH: target * 100 / R.storiesPerMile, builtH: 0,
    startDate: act.date, startActivity: act.index, seed: seedStr, variant: Math.floor(rand() * 1e6),
    status: 'in_progress', completeDate: null, lotRef: lot.lotRef };
  buildings.push(b);
  return b;
}
function startCapitol(act) {
  serial++;
  const lot = civicLot('capitol') || takeLot();
  const b = { id: serial, type: 'capitol', label: L.capitol.name, ring: lot.ring, x: lot.x, y: lot.y,
    targetStories: L.capitol.milesToBuild, needH: hund(L.capitol.milesToBuild), builtH: 0,
    startDate: act.date, startActivity: act.index, seed: null, variant: 0,
    status: 'in_progress', completeDate: null };
  buildings.push(b);
  log.push(`${act.date}  State Capitol unlocked at ${mi(cumRun)} cumulative run mi; construction begins`);
  return b;
}
function placeLandmark(key, date, note) {
  if (earned.has(key)) return;
  earned.add(key);
  const lot = civicLot(key) || takeLot(false, M.landmarkFrontBias || 0);
  landmarks.push({ key, name: L[key].name, date, note, x: lot.x, y: lot.y, ring: lot.ring });
  log.push(`${date}  Landmark: ${L[key].name} (${note})`);
}

// ---------- parks (precomputed by calendar week) ----------
const runs = acts.filter((a) => a.kind === 'run');
const weekCounts = new Map();
for (const r of runs) { const w = weekStart(r.date); weekCounts.set(w, (weekCounts.get(w) || 0) + 1); }
const activeWeeks = new Set();
for (let i = 0; i + 1 < runs.length; i++) {
  const a = runs[i].date, b = runs[i + 1].date;
  if (daysBetween(a, b) > R.parks.maxGapDays) continue;
  for (let w = weekStart(a); w <= b; w = addDays(w, 7)) activeWeeks.add(w);
}
const parkWeeks = [...activeWeeks].sort()
  .filter((w) => addDays(w, 6) < R.asOfDate)                // week fully ended
  .filter((w) => (weekCounts.get(w) || 0) <= R.parks.maxRunsInWeek)
  .map((w) => ({ week: w, end: addDays(w, 6), runs: weekCounts.get(w) || 0 }));
let parkPtr = 0;
function awardParksThrough(dateExclusive) {
  while (parkPtr < parkWeeks.length && parkWeeks[parkPtr].end < dateExclusive) {
    const pw = parkWeeks[parkPtr++];
    const n = parks.length;
    const name = n < R.parks.namedParks.length ? R.parks.namedParks[n]
      : `${R.parks.genericName} #${n - R.parks.namedParks.length + 1}`;
    const lot = takeLot(false);
    parks.push({ name, week: pw.week, date: pw.end, runsThatWeek: pw.runs, x: lot.x, y: lot.y, ring: lot.ring,
      named: n < R.parks.namedParks.length });
    log.push(`${pw.end}  Park: ${name} (week of ${pw.week} had ${pw.runs} run${pw.runs === 1 ? '' : 's'})`);
  }
}

// ---------- side quests ----------
const ytd = {}; // year -> {ride, walk, weights}
const sqEarned = new Set();
function checkSideQuests(act) {
  const y = act.date.slice(0, 4);
  ytd[y] = ytd[y] || { ride: 0, walk: 0, weights: 0 };
  if (act.kind === 'ride') ytd[y].ride += act.h;
  else if (act.kind === 'walk') ytd[y].walk += act.h;
  else if (act.kind === 'weights') ytd[y].weights += 1;
  else return;
  const list = R.sideQuests[act.kind] || [];
  for (const q of list) {
    if (sqEarned.has(q.name)) continue;
    const ok = q.miles != null ? ytd[y][act.kind] >= hund(q.miles) : ytd[y][act.kind] >= q.sessions;
    if (ok) {
      sqEarned.add(q.name);
      const [bx, by] = M.sideQuestBlocks[q.name];
      const val = act.kind === 'weights' ? `${ytd[y].weights} sessions` : `${mi(ytd[y][act.kind])} ${act.kind} mi`;
      sideQuests.push({ name: q.name, kind: act.kind, threshold: q.miles ?? q.sessions, date: act.date,
        ytdAtEarn: val, year: +y, block: [bx, by], x: bx * period + 1, y: by * period + 1, w: M.blockLots, h: M.blockLots });
      log.push(`${act.date}  Side quest: ${q.name} (${y} YTD ${val} >= ${q.miles ?? q.sessions})`);
    }
  }
}

// ---------- replay ----------
for (const act of acts) {
  awardParksThrough(act.date);
  if (act.kind !== 'run') { checkSideQuests(act); continue; }

  runCount++;
  act.runNumber = runCount;
  let rem = act.h * R.storiesPerMile;
  if (!current) current = startBuilding(act);
  while (rem > 0) {
    let chunk = Math.min(rem, current.needH - current.builtH);
    const capUnlockH = hund(L.capitol.unlockCumulativeRunMiles);
    if (!earned.has('capitol') && cumRun < capUnlockH) chunk = Math.min(chunk, capUnlockH - cumRun);
    current.builtH += chunk; cumRun += chunk; rem -= chunk;
    if (current.builtH >= current.needH) {
      current.status = 'complete'; current.completeDate = act.date;
      log.push(`${act.date}  Completed #${current.id} ${current.label} (${current.targetStories} st) on ${current.ring} lot ${current.x},${current.y}`);
      if (current.type === 'capitol') landmarks.push({ key: 'capitol', name: L.capitol.name, date: act.date,
        note: `finished after ${L.capitol.milesToBuild} run mi`, x: current.x, y: current.y, ring: current.ring, buildingId: current.id });
      current = paused || startBuilding(act); paused = null;
    }
    if (!earned.has('capitol') && cumRun >= capUnlockH) {
      earned.add('capitol');
      if (L.capitol.pauseCurrentBuilding && current.builtH > 0) { paused = current; current = startCapitol(act); }
      else if (current.builtH === 0) { // nothing built on it yet: give its lot to Capitol
        const b0 = buildings.pop(); serial--; b0.lotRef.used = false; nextLot--; current = startCapitol(act); // reuse untouched start
      } else { paused = current; current = startCapitol(act); }
    }
  }

  // milestone checks after the run
  if (cumRun >= hund(L.unionStation.cumulativeRunMiles)) placeLandmark('unionStation', act.date, `cumulative ${mi(cumRun)} run mi`);
  runDates.push(act.date);
  const inWin = runDates.filter((d) => daysBetween(d, act.date) < L.courthouse.windowDays).length;
  if (inWin >= L.courthouse.runsInWindow) placeLandmark('courthouse', act.date, `${inWin} runs in ${L.courthouse.windowDays} days ending ${act.date}`);
  if (act.miles >= L.artMuseum.minDistance) {
    const pace = act.seconds / act.miles;
    if (runCount > L.artMuseum.afterRuns && bestPace < Infinity && pace < bestPace)
      placeLandmark('artMuseum', act.date, `pace PR ${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, '0')}/mi on ${act.miles} mi (prev best ${Math.floor(bestPace / 60)}:${String(Math.round(bestPace % 60)).padStart(2, '0')}/mi)`);
    bestPace = Math.min(bestPace, pace);
  }
  if (act.miles >= L.cathedral.longRunMiles) longRunSum += act.h;
  if (act.miles >= L.cathedral.singleRunMiles) placeLandmark('cathedral', act.date, `single run of ${act.miles} mi`);
  else if (longRunSum >= hund(L.cathedral.cumulativeLongRunMiles)) placeLandmark('cathedral', act.date, `cumulative long-run miles ${mi(longRunSum)}`);
}
awardParksThrough(addDays(R.asOfDate, 1));

// ---------- summary ----------
const done = buildings.filter((b) => b.status === 'complete');
const regular = buildings.filter((b) => b.type !== 'capitol');
const byType = {};
for (const b of regular.filter((b) => b.status === 'complete')) byType[b.type] = (byType[b.type] || 0) + 1;
const inProg = buildings.filter((b) => b.status === 'in_progress');
const completedStories = done.filter((b) => b.type !== 'capitol').reduce((s, b) => s + b.targetStories, 0);
const maxRun = Math.max(...runs.map((r) => r.miles));
const locked = [];
for (const [k, v] of Object.entries(L)) if (!landmarks.find((l) => l.key === k)) {
  let need = '';
  if (k === 'cathedral') need = `needs a single run >= ${v.singleRunMiles} mi (longest so far ${maxRun} mi) or ${v.cumulativeLongRunMiles} cumulative mi from runs >= ${v.longRunMiles} mi (have ${mi(longRunSum)})`;
  if (k === 'artMuseum') need = `needs a pace PR on a run >= ${v.minDistance} mi after run #${v.afterRuns}`;
  if (k === 'courthouse') need = `needs ${v.runsInWindow} runs within ${v.windowDays} days`;
  if (k === 'unionStation') need = `needs ${v.cumulativeRunMiles} cumulative run mi`;
  if (k === 'capitol') need = `needs ${v.unlockCumulativeRunMiles} cumulative run mi then ${v.milesToBuild} more`;
  locked.push({ key: k, name: v.name, need });
}
const curYear = R.asOfDate.slice(0, 4);
const lockedSQ = [];
for (const [kind, list] of Object.entries(R.sideQuests)) for (const q of list) if (!sqEarned.has(q.name)) {
  const have = kind === 'weights' ? (ytd[curYear]?.weights || 0) : mi(ytd[curYear]?.[kind] || 0);
  lockedSQ.push({ name: q.name, kind, need: `${q.miles ?? q.sessions} ${kind === "weights" ? (q.sessions === 1 ? "session" : "sessions") : kind + " mi"} in one calendar year (${curYear} YTD: ${have})` });
}
const totals = {};
for (const a of acts) { totals[a.kind] = totals[a.kind] || { count: 0, miles: 0 }; totals[a.kind].count++; totals[a.kind].miles += a.h; }
for (const k in totals) totals[k].miles = mi(totals[k].miles);

const summary = {
  asOf: R.asOfDate,
  activities: totals,
  totalRunMiles: mi(cumRun),
  totalStoriesBuilt: mi(cumRun * R.storiesPerMile),
  storiesInCompletedRegularBuildings: completedStories,
  buildingsCompleted: done.length,
  completedByType: byType,
  capitol: buildings.find((b) => b.type === 'capitol') ? (() => { const c = buildings.find((b) => b.type === 'capitol'); return { status: c.status, startDate: c.startDate, completeDate: c.completeDate }; })() : null,
  inProgress: inProg.map((b) => ({ id: b.id, type: b.type, label: b.label, ring: b.ring, targetStories: b.targetStories,
    storiesBuilt: mi(b.builtH * R.storiesPerMile / 100 * 100) , progressPct: +(100 * b.builtH / b.needH).toFixed(1), startDate: b.startDate })),
  landmarksEarned: landmarks.map(({ name, date, note }) => ({ name, date, note })),
  landmarksLocked: locked,
  parks: parks.map(({ name, date, week, runsThatWeek }) => ({ name, week, date, runsThatWeek })),
  sideQuestsEarned: sideQuests.map(({ name, date, ytdAtEarn }) => ({ name, date, ytdAtEarn })),
  sideQuestsLocked: lockedSQ,
  ytd: Object.fromEntries(Object.entries(ytd).map(([y, v]) => [y, { ride: mi(v.ride), walk: mi(v.walk), weights: v.weights }])),
  lotsUsed: nextLot, lotsTotal: lots.length,
};
// fix storiesBuilt for in-progress (hundredths -> stories)
summary.inProgress.forEach((p, i) => { p.storiesBuilt = mi(inProg[i].builtH * R.storiesPerMile); });

const city = {
  generated: new Date().toISOString(),
  rules: path.basename(rulesPath),
  map: { tiles, period, blockLots: M.blockLots, center, coreLots: M.coreLots, innerLots: M.innerLots, civicBlock: civic ? civic.block : null },
  lots: lots.map(({ x, y, ring }) => ({ x, y, ring })),
  buildings: buildings.map((b) => ({ ...b, needH: undefined, builtH: undefined, lotRef: undefined,
    storiesBuilt: mi(b.builtH * R.storiesPerMile), progress: +(b.builtH / b.needH).toFixed(4) })),
  landmarks, parks, sideQuests, summary, log,
};
fs.writeFileSync(path.join(DIR, 'city.json'), JSON.stringify(city, null, 2));

const lines = [];
lines.push(`MARATHON CITY — as of ${R.asOfDate}`);
lines.push(`Run miles: ${summary.totalRunMiles}  (= ${summary.totalStoriesBuilt} stories of construction)`);
lines.push(`Buildings completed: ${done.length} (${Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(', ')}${summary.capitol?.status === 'complete' ? ', + State Capitol' : ''})`);
lines.push(`Stories in completed regular buildings: ${completedStories}`);
for (const p of summary.inProgress) lines.push(`In progress: #${p.id} ${p.label} (${p.ring}) ${p.storiesBuilt}/${p.targetStories} stories (${p.progressPct}%), started ${p.startDate}`);
lines.push('Landmarks earned:'); for (const l of summary.landmarksEarned) lines.push(`  ${l.date}  ${l.name} — ${l.note}`);
lines.push('Landmarks locked:'); for (const l of locked) lines.push(`  ${l.name} — ${l.need}`);
lines.push(`Parks (${parks.length}):`); for (const p of parks) lines.push(`  ${p.date}  ${p.name} (week of ${p.week}: ${p.runsThatWeek} run)`);
lines.push('Side quests earned:'); for (const s of sideQuests) lines.push(`  ${s.date}  ${s.name} — YTD ${s.ytdAtEarn}`);
lines.push('Side quests locked:'); for (const s of lockedSQ) lines.push(`  ${s.name} — ${s.need}`);
lines.push(`YTD totals: ${JSON.stringify(summary.ytd)}`);
lines.push(`Lots used: ${nextLot}/${lots.length}`);
const txt = lines.join('\n');
fs.writeFileSync(path.join(DIR, 'summary.txt'), txt + '\n\nEVENT LOG\n' + log.join('\n') + '\n');
console.log(txt);
