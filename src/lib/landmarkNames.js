// Real-world names for the landmarks the city draws.
//
// rules.js still stores the short names the replay has always used
// ("State Capitol", "Courthouse", "Cathedral Basilica", "Martha's Art
// Gallery"). Those strings stay in the log and on the city object so an
// old save replays the same way. This file is the one place a person
// edits when the popup, or Austin's label map, should say something else.
//
// A name here is a real place, copied from that place's own public name.
// Nothing in this file is a nickname we made up for the game. `stored` is
// the string simulate() writes. `name` is what the popup shows. `popup`
// is false only if a tap on that building should do nothing.
//
// Parks, trails, and side quests are not in this list. A tap on Coors
// Field or Cheesman Park does not open this card. Those are a different
// set of sprites, and their names already live on the quest itself.

import { stravaActivityUrl } from "./records.js";

// Denver's courthouse sprite is a stone block with a pediment and columns,
// not a clock tower. The clock in this city is Union Station. The building
// that matches that drawing is the federal courthouse on Stout Street.
// The City and County Building faces the capitol and does have courtrooms,
// but its landmark feature is a clock tower this sprite does not draw.
const DENVER = {
  capitol: {
    stored: "State Capitol",
    name: "Colorado State Capitol",
    popup: true,
  },
  unionStation: {
    stored: "Union Station",
    name: "Union Station",
    popup: true,
  },
  courthouse: {
    stored: "Courthouse",
    name: "Byron R. White U.S. Courthouse",
    popup: true,
  },
  artMuseum: {
    stored: "Denver Art Museum",
    name: "Denver Art Museum",
    popup: true,
  },
  cathedral: {
    stored: "Cathedral Basilica",
    name: "Cathedral Basilica of the Immaculate Conception",
    popup: true,
  },
};

// Austin reuses Denver's slot keys. The stored name is still the Denver
// string. The name below is the Austin building that slot draws.
// Martha's and Rockman are real businesses. The rules file lengthened
// them into "Martha's Art Gallery" and "Rockman's Bakery". The popup uses
// the name on each place's own site.
const AUSTIN = {
  capitol: {
    stored: "State Capitol",
    name: "Texas State Capitol",
    popup: true,
  },
  unionStation: {
    stored: "Union Station",
    name: "Congress Avenue Bridge",
    popup: true,
  },
  courthouse: {
    stored: "Courthouse",
    name: "UT Tower",
    popup: true,
  },
  artMuseum: {
    stored: "Denver Art Museum",
    name: "Blanton Museum of Art",
    popup: true,
  },
  cathedral: {
    stored: "Cathedral Basilica",
    name: "Saint Mary Cathedral",
    popup: true,
  },
  lbjLibrary: {
    stored: "LBJ Presidential Library",
    name: "LBJ Presidential Library",
    popup: true,
  },
  marthasGallery: {
    stored: "Martha's Art Gallery",
    name: "Martha's",
    popup: true,
  },
  rockmansBakery: {
    stored: "Rockman's Bakery",
    name: "Rockman Coffee",
    popup: true,
  },
};

const BY_THEME = {
  Denver: DENVER,
  Austin: AUSTIN,
};

function tableFor(theme) {
  if (theme && BY_THEME[theme]) return BY_THEME[theme];
  // An unknown theme paints Denver. The popup follows that, so a typo
  // does not show a blank card or an Austin name on a Denver skyline.
  return DENVER;
}

export function landmarkEntry(theme, key) {
  return tableFor(theme)[key] || null;
}

export function landmarkName(theme, key) {
  return landmarkEntry(theme, key)?.name || null;
}

// True for a slot the popup may open. A rowhouse, a park, and a stadium
// are not in the tables, so they return false.
export function isPopupKey(key) {
  if (!key) return false;
  return Object.values(BY_THEME).some((table) => table[key]?.popup);
}

// Austin's theme.labels used to repeat these strings. It reads them from
// here so a rename cannot update the popup and leave the label map behind.
export function labelsFor(theme) {
  const out = {};
  for (const [key, entry] of Object.entries(tableFor(theme))) {
    out[key] = entry.name;
  }
  return out;
}

// One row per theme and slot, in the order the tables are written.
// The test locks this list. The PR description is the same list.
export function mappingList() {
  const rows = [];
  for (const theme of Object.keys(BY_THEME)) {
    for (const [key, entry] of Object.entries(BY_THEME[theme])) {
      rows.push({
        theme,
        key,
        stored: entry.stored,
        name: entry.name,
        popup: Boolean(entry.popup),
      });
    }
  }
  return rows;
}

export function formatMiles(miles) {
  const n = Number(miles);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toFixed(2)} MI`;
}

// Moving time divided by distance. The records panel formats a finish
// time. This is the pace of the whole activity, which is what the city
// already stored. A missing clock (0 seconds) is left blank rather than
// printed as 0:00.
export function formatPace(miles, seconds) {
  const distance = Number(miles);
  const time = Number(seconds);
  if (!Number.isFinite(distance) || distance <= 0) return null;
  if (!Number.isFinite(time) || time <= 0) return null;
  const perMile = time / distance;
  let sec = Math.round(perMile % 60);
  let min = Math.floor(perMile / 60);
  if (sec === 60) {
    sec = 0;
    min += 1;
  }
  return `${min}:${String(sec).padStart(2, "0")} /MI`;
}

// linked false means the landmark was drawn without an activity. A demo
// id or a typed distance is still linked: the date and the pace show,
// and url is null because those ids are not Strava activities.
export function describeRun(run) {
  if (!run || !run.date) return { linked: false };
  return {
    linked: true,
    date: String(run.date),
    distance: formatMiles(run.miles),
    pace: formatPace(run.miles, run.seconds),
    url: stravaActivityUrl(run.stravaId),
  };
}
