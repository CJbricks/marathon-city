// Loading-screen and airplane-banner lines.
// Copied from prototype/quotes.json so the app owns the list. A quote is
// chosen at random when the loading screen mounts, and again when a plane
// flyover starts. The same line is not "correct"; any line from this list is.

export const QUOTES = [
  "Listening to Free Trial",
  "Waiting on a Norda contract",
  "Refreshing the Bandit webpage",
  "Checking Max Joliffe Unsolicited Memes",
  "Flat white at Novo",
  "S#*% posting in Strava",
  "Death to going Strava dark",
  "Becoming younger and fitter",
  "DNF'ing at mile 28",
  "Munching quesadilla",
  "Pulling up to the loop",
  "Loitering in front of Fleet Feet",
  "Mark Dowdle, still on course.",
  "Stopping at mile 13 to watch Dylisms",
];

export function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
