// Root layout. In the App Router, this file wraps every route: a request for
// "/" renders page.js inside this component, and a future "/log" page would
// too. There is one root layout, and it must render <html> and <body>.
//
// This file is a Server Component. It has no "use client", so it runs on the
// server and does not ship its own JavaScript to the browser. That is the
// right place to load a font and set the document title and the share-card
// tags. The Chakra wrapper it renders is a Client Component; see providers.js.

import { Press_Start_2P } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

// next/font downloads Press Start 2P when the app is built and serves it
// from our own origin. The page does not call Google Fonts at runtime, so
// the face shows up without a late swap, and it works if the browser is offline
// after the first load. `variable` publishes the family as --font-pixel for CSS.
const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel",
});

// These exports become tags in <head>. Next writes them; we do not add a
// <head> element ourselves. `viewport` is what makes the layout scale on a phone
// (width=device-width, initial-scale=1) instead of rendering as a desktop page.
//
// The icons and the share pictures are files beside this one, not fields
// in this object: favicon.ico, icon.png, apple-icon.png, opengraph-image.png,
// and twitter-image.png. Next adds the <link> and <meta> tags from those
// names. See docs/NOTES.md.
//
// One name, used everywhere a tab or a link preview asks for it. Typing it
// four times is how the tab and og:title drift apart. The description is
// the sentence under that name. The lowercase "strava" and the period are
// part of the sentence.
const siteName = "Miles and Miles";
const description = "A dynamic city built on your strava stats.";

export const metadata = {
  // The deployed origin. Next turns /opengraph-image.png into an absolute
  // URL with this. A relative og:image is dropped by iMessage, Slack, and
  // Facebook, so the card would show words and no picture.
  metadataBase: new URL("https://marathon-city.vercel.app"),
  title: siteName,
  description,
  openGraph: {
    title: siteName,
    description,
    siteName,
    // A link to the site, not an article. og:url is the home page. "/" is
    // resolved against metadataBase, so the tag is the absolute origin.
    type: "website",
    url: "/",
  },
  twitter: {
    // The wide card. "summary" would shrink the city to a small square.
    card: "summary_large_image",
    title: siteName,
    description,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    // className sets the pixel font on the document. The variable class
    // defines --font-pixel, which page.js points at. Both are needed:
    // the class applies the face, the variable lets other CSS name it.
    <html lang="en" className={`${pixel.className} ${pixel.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
