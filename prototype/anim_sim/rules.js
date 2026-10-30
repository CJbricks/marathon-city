// Marathon City — editable rules config (CommonJS).
// Everything the simulator does is driven by the values in this file.
// Edit numbers/weights here, then re-run:  node simulate.js
'use strict';

module.exports = {
  // ---- Input ---------------------------------------------------------------
  activitiesFile: 'activities.txt',
  // Date the replay is "as of". Calendar weeks that have not ended by this
  // date are not evaluated for parks yet.
  asOfDate: '2026-10-29',

  // Activity type names as they appear in the file.
  types: {
    run: ['Run'],
    ride: ['Ride'],
    walk: ['Walk'],
    weights: ['WeightTraining', 'Weight Training', 'Workout'],
  },

  // ---- Map / zoning --------------------------------------------------------
  map: {
    blocks: 7,        // city is blocks x blocks city blocks
    blockLots: 2,     // each block is blockLots x blockLots lots
    // (roads are 1 tile wide between blocks, so tiles = blocks*(blockLots+1)+1)
    // Lots are ranked by distance from downtown (center). The first N lots
    // are "core", the next M are "inner", everything else is "outer".
    coreLots: 16,
    innerLots: 44,
    // Parks and civic landmarks skip these rings (downtown is for buildings).
    reserveRingsForBuildings: ['core'],
    // Civic landmarks pick, among the N nearest eligible lots, the one facing
    // the camera (front of the map) so they stay visible. 0/1 = plain nearest.
    landmarkFrontBias: 8,
    // Civic Center block (like Denver's Civic Center Park): a reserved block
    // just in front of downtown where the civic landmarks are placed, each in
    // its own slot [lotX, lotY] within the block. Landmarks without a slot
    // (or if civicCenter is null) use the nearest non-core lot instead.
    // Unused slots render as Civic Center lawn.
    civicCenter: {
      block: [4, 4],
      slots: { capitol: [0, 0], artMuseum: [1, 0], courthouse: [0, 1], unionStation: [1, 1] },
    },
    // Blocks reserved for side-quest features (map edge). Block coords [bx,by]
    // where 0,0 is the back corner (mountain side). Not usable by buildings.
    sideQuestBlocks: {
      'Coors Field':                   [6, 1],
      'Ball Arena':                    [6, 3],
      '16th Street Mall':              [6, 5],
      'Empower Field at Mile High':    [1, 6],
      'Confluence Park bridge':        [3, 6],
      'Big Blue Bear':                 [5, 6],
      'Denver Athletic Club':          [6, 6],
      'Red Rocks Amphitheatre':        [0, 0],
    },
  },

  // ---- Building rules (Runs only) ------------------------------------------
  storiesPerMile: 1, // 1 run mile = 1 story; fractions carry over

  buildingTypes: {
    skyscraper: { label: 'Skyscraper',          min: 20, max: 30 },
    office:     { label: 'Mid-rise office',     min: 8,  max: 12 },
    mixeduse:   { label: 'Mixed-use apartments',min: 4,  max: 6 },
    rowhouse:   { label: 'Rowhouse / Victorian',min: 2,  max: 3 },
    state:      { label: 'State building',      min: 8,  max: 12 },
    museum:     { label: 'Museum',              min: 10, max: 15 },
  },

  // Weighted random type choice per ring ("mostly" X, plus occasional
  // state buildings and museums sprinkled in).
  ringWeights: {
    core:  { office: 58, skyscraper: 30, state: 7, museum: 5 },
    inner: { mixeduse: 82, office: 6, state: 7, museum: 5 },
    outer: { rowhouse: 86, mixeduse: 6, state: 4, museum: 4 },
  },
  ringNames: {
    core: 'Downtown core (17th St)',
    inner: 'Inner ring (LoHi / RiNo)',
    outer: 'Outer ring (Capitol Hill / Highlands)',
  },

  // ---- Civic landmarks (one each) ------------------------------------------
  landmarks: {
    unionStation: { name: 'Union Station', cumulativeRunMiles: 100 },
    courthouse:   { name: 'Courthouse', runsInWindow: 12, windowDays: 30 },
    artMuseum:    {
      name: 'Denver Art Museum',
      minDistance: 5,        // only runs >= 5 mi count for pace PRs
      afterRuns: 20,         // only runs after the first 20 runs can earn it
      // PR = faster average pace than every previous run >= minDistance.
    },
    cathedral:    {
      name: 'Cathedral Basilica',
      singleRunMiles: 13.1,          // first single run >= 13.1 mi, OR
      longRunMiles: 10,              // runs >= 10 mi count as "long runs"
      cumulativeLongRunMiles: 26.2,  // ... and their miles sum to >= 26.2
    },
    capitol:      {
      name: 'State Capitol',
      unlockCumulativeRunMiles: 250,
      milesToBuild: 13.1,            // consumes the next 13.1 run miles
      // The building under construction at unlock is paused and resumes
      // after the Capitol is finished.
      pauseCurrentBuilding: true,
    },
  },

  // ---- Parks ---------------------------------------------------------------
  parks: {
    maxRunsInWeek: 1,     // a calendar week (Mon-Sun) with <= 1 runs
    maxGapDays: 21,       // only weeks overlapping a gap of <= 21 days between
                          // two consecutive runs count (ignore long layoffs)
    weekStartsOn: 1,      // 1 = Monday
    namedParks: ['Cheesman Park', 'Washington Park', 'City Park'],
    genericName: 'Neighborhood Park',
  },

  // ---- Side quests (year-to-date per calendar year; once earned, kept) -----
  sideQuests: {
    ride: [
      { name: 'Coors Field', miles: 10 },
      { name: 'Ball Arena', miles: 25 },
      { name: 'Empower Field at Mile High', miles: 50 },
    ],
    walk: [
      { name: 'Confluence Park bridge', miles: 10 },
      { name: '16th Street Mall', miles: 25 },
      { name: 'Red Rocks Amphitheatre', miles: 50 },
    ],
    weights: [
      { name: 'Big Blue Bear', sessions: 1 },
      { name: 'Denver Athletic Club', sessions: 10 },
    ],
  },

  // The city never resets automatically.
  resetOnLongGap: false,
};
