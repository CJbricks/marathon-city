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
  // Trail runs share the run kind, so their miles build stories, parks,
  // and the same milestones as a road run. Strava sends sport_type
  // "TrailRun"; a hand-written log may say "Trail Run".
  // Ride names are Strava sport_type values. A gravel ride and a virtual
  // ride count toward the same year-to-date stadium ladder as a road ride.
  types: {
    run: ["Run", "TrailRun", "Trail Run"],
    ride: ["Ride", "GravelRide", "MountainBikeRide", "EBikeRide", "VirtualRide"],
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
      // Half marathons. The front edge (large block y) faces the camera.
      "Cherry Creek Trail": [2, 6],
      "Denver Zoo": [0, 6],
      "Denver Botanic Gardens": [4, 6],
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
    // perCity caps how many of this type the weighted picker may start.
    // Story heights stay min/max. A null or missing perCity means no cap.
    museum: { label: "Museum", min: 10, max: 15, perCity: 10 },
  },

  // Key order matters: weighted() walks the keys in insertion order.
  ringWeights: {
    core: { office: 58, skyscraper: 30, state: 7, museum: 5 },
    inner: { mixeduse: 82, office: 6, state: 7, museum: 5 },
    outer: { rowhouse: 86, mixeduse: 6, state: 4, museum: 4 },
  },

  landmarks: {
    // max is how many of that landmark the city may hold. 1 is the default
    // for a milestone landmark. Cathedral is the exception: it is one
    // building per milesPer banked run miles, and max null means no ceiling.
    unionStation: { name: "Union Station", cumulativeRunMiles: 100, max: 1 },
    courthouse: { name: "Courthouse", runsInWindow: 12, windowDays: 30, max: 1 },
    artMuseum: {
      name: "Denver Art Museum",
      minDistance: 5,
      afterRuns: 20,
      max: 1,
    },
    cathedral: {
      name: "Cathedral Basilica",
      milesPer: 200,
      max: null,
    },
    capitol: {
      name: "State Capitol",
      unlockCumulativeRunMiles: 250,
      milesToBuild: 13.1,
      pauseCurrentBuilding: true,
      max: 1,
    },
  },

  parks: {
    maxRunsInWeek: 1,
    maxGapDays: 21,
    weekStartsOn: 1,
    namedParks: ["Cheesman Park", "Washington Park", "City Park"],
    genericName: "Neighborhood Park",
  },

  // halfMarathon and fullMarathon are lifetime ordered lists. One qualifying
  // run unlocks the next unused name and then stops, so a single long run
  // cannot skip ahead. Walks and rides are year-to-date miles inside one
  // calendar year: the list is checked in order, and a name stays earned.
  // Weight sessions do not consult these lists.
  sideQuests: {
    halfMarathon: {
      miles: 13.1,
      names: ["Cherry Creek Trail", "Denver Zoo", "Denver Botanic Gardens"],
    },
    fullMarathon: {
      miles: 26.2,
      names: ["Big Blue Bear", "Denver Athletic Club"],
    },
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
  },

  // A Monday-start week with at least one run is a streak week. The first
  // afterWeeks weeks of a streak earn nothing. Each finished week after
  // that adds one vehicle, cycling through types. A missed week starts the
  // count over and does not remove vehicles already earned. maxAnimated is
  // how many of those vehicles the overlay draws. The rest still exist.
  vehicles: {
    afterWeeks: 2,
    types: ["car", "truck", "bus", "police"],
    maxAnimated: 16,
  },

  // Lifetime walk miles, not the year-to-date landmark totals. The city
  // stores floor(miles / milesPerPerson) people. maxAnimated is the cap
  // on how many walkers the overlay draws.
  pedestrians: {
    milesPerPerson: 0.25,
    maxAnimated: 32,
  },

  // A single run strictly longer than overMiles unlocks the next transit
  // piece. types cycles forever: the fourth ultra is another bike route.
  // The city draws these on the overlay, so this list never repaints the
  // cached skyline texture.
  transit: {
    overMiles: 26.2,
    types: ["bike", "bus", "lightRail"],
  },

  // Race day is a local calendar date on the save, not a milestone.
  // The celebration lasts that whole local day. confetti and paradeMs
  // only change the overlay; they do not rebuild the city texture.
  raceDay: {
    confetti: 36,
    paradeMs: 9000,
  },
};

export default rules;
