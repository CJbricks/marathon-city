// Root layout. In the App Router, this file wraps every route: a request for
// "/" renders page.js inside this component, and a future "/log" page would
// too. There is one root layout, and it must render <html> and <body>.
//
// This file is a Server Component. It has no "use client", so it runs on the
// server and does not ship its own JavaScript to the browser. That is the
// right place to load a font and set the document title. The Chakra wrapper
// it renders is a Client Component; see providers.js.

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
export const metadata = {
  title: "Marathon City",
  description: "A Denver city that grows one story for every mile you run.",
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
