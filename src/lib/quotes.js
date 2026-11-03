// Loading-screen and airplane-banner lines.
// The words live in prototype/quotes.json, which is the list the README
// already points at. Importing it here means the loading screen and the
// plane banner cannot drift away from that file: add a line there and both
// places pick it up. This file stays free of Node APIs (no fs), so the
// browser bundle can include the same list the server would. A quote is
// chosen at random when the loading screen mounts, and again when a plane
// flyover starts. The same line is not "correct"; any line from this list is.

import quoteFile from "../../prototype/quotes.json" with { type: "json" };

export const QUOTES = quoteFile.quotes.map((quote) => quote.text);

export function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
