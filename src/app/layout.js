// Root layout. In the App Router, this file wraps every route: a request for
// "/" renders page.js inside this component, and a future "/log" page would
// too. There is one root layout, and it must render <html> and <body>.
//
// This file is a Server Component. It has no "use client", so it runs on the
// server and does not ship its own JavaScript to the browser. That is the
// right place to load a font, set the document title, and describe the link
// preview. The Chakra wrapper it renders is a Client Component; see providers.js.

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
// "Miles and Miles" is the browser tab and the title on a shared link.
// The one-line description is the sentence under that title in iMessage,
// Slack, and X. The same words are set on the Open Graph and Twitter
// fields so a crawler that reads only one of those sets still gets them.
//
// metadataBase is the production origin. The share image is a relative
// path (/opengraph-image.png). Without a base, that path can be resolved
// against localhost and the preview is a broken image. Preview deploys
// still advertise this origin, because this is the site people share.
//
// The pictures are files beside this one, the same way the icons are.
// opengraph-image.png and twitter-image.png are the 1200×630 card.
// The .alt.txt files are the sentence a screen reader speaks for it.
// Leave openGraph.images and twitter.images unset. Those fields replace
// the files. favicon.ico, icon.png, and apple-icon.png are still the tab
// and the home-screen icon. This object does not list them either.
// See docs/NOTES.md.
export const metadata = {
  metadataBase: new URL("https://marathon-city.vercel.app"),
  title: "Miles and Miles",
  description: "Every run builds the city.",
  openGraph: {
    title: "Miles and Miles",
    description: "Every run builds the city.",
    url: "https://marathon-city.vercel.app",
    siteName: "Miles and Miles",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Miles and Miles",
    description: "Every run builds the city.",
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
