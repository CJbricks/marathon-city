// Editable rules for Marathon City.
// The simulator in simulate.js reads only this object, so changing a number
// here changes the city. The prototype's rules.js is the source of these
// values; this file is the copy the app actually runs.
//
// asOfDate is the fixture date used by the golden test. A live replay passes
// today's date instead, so a finished quiet week can still earn a park.

const rules = {
  asOfDate: "2026-10-29",

  // Activity type names as they appear in Strava and in activities.txt.
  types: {
    run: ["Run"],
    ride: ["Ride"],
    walk: ["Walk"],
    weights: ["WeightTraining", "Weight Training", "Workout"],
  },

  map: {
    blocks: 7,
    blockLots: 2,
    coreLots: 16,
    innerLots: 44,
    reserveRingsForBuildings: ["core"],
    landmarkFrontBias: 8,
    civicCenter: {
      block: [4, 4],
      slots: {
        capitol: [0, 0],
        artMuseum: [1, 0],
        courthouse: [0, 1],
        unionStation: [1, 1],
      },
    },
    sideQuestBlocks: {
      "Coors Field": [6, 1],
      "Ball Arena": [6, 3],
      "16th Street Mall": [6, 5],
      "Empower Field at Mile High": [1, 6],
      "Confluence Park bridge": [3, 6],
      "Big Blue Bear": [5, 6],
      "Denver Athletic Club": [6, 6],
      "Red Rocks Amphitheatre": [0, 0],
    },
  },

  // One run mile builds one story. A leftover fraction stays on the lot.
  storiesPerMile: 1,

  buildingTypes: {
    skyscraper: { label: "Skyscraper", min: 20, max: 30 },
    office: { label: "Mid-rise office", min: 8, max: 12 },
    mixeduse: { label: "Mixed-use apartments", min: 4, max: 6 },
    rowhouse: { label: "Rowhouse / Victorian", min: 2, max: 3 },
    state: { label: "State building", min: 8, max: 12 },
    museum: { label: "Museum", min: 10, max: 15 },
  },

  // Key order matters: weighted() walks the keys in insertion order.
  ringWeights: {
    core: { office: 58, skyscraper: 30, state: 7, museum: 5 },
    inner: { mixeduse: 82, office: 6, state: 7, museum: 5 },
    outer: { rowhouse: 86, mixeduse: 6, state: 4, museum: 4 },
  },

  landmarks: {
    unionStation: { name: "Union Station", cumulativeRunMiles: 100 },
    courthouse: { name: "Courthouse", runsInWindow: 12, windowDays: 30 },
    artMuseum: {
      name: "Denver Art Museum",
      minDistance: 5,
      afterRuns: 20,
    },
    cathedral: {
      name: "Cathedral Basilica",
      singleRunMiles: 13.1,
      longRunMiles: 10,
      cumulativeLongRunMiles: 26.2,
    },
    capitol: {
      name: "State Capitol",
      unlockCumulativeRunMiles: 250,
      milesToBuild: 13.1,
      pauseCurrentBuilding: true,
    },
  },

  parks: {
    maxRunsInWeek: 1,
    maxGapDays: 21,
    weekStartsOn: 1,
    namedParks: ["Cheesman Park", "Washington Park", "City Park"],
    genericName: "Neighborhood Park",
  },

  sideQuests: {
    ride: [
      { name: "Coors Field", miles: 10 },
      { name: "Ball Arena", miles: 25 },
      { name: "Empower Field at Mile High", miles: 50 },
    ],
    walk: [
      { name: "Confluence Park bridge", miles: 10 },
      { name: "16th Street Mall", miles: 25 },
      { name: "Red Rocks Amphitheatre", miles: 50 },
    ],
    weights: [
      { name: "Big Blue Bear", sessions: 1 },
      { name: "Denver Athletic Club", sessions: 10 },
    ],
  },
};

export default rules;
