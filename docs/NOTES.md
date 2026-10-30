# Notes for learning this codebase

This is a short map of the Next.js app. The game rules (one story per mile, landmarks, Strava sync) live in the [README](../README.md). The pixel experiments in `prototype/` are reference material. The app does not import them.

The home page is a placeholder. Real screens come later. The comments in the source are there so you can read a file and see why it is shaped that way.

## Folder structure

```
src/app/layout.js      Wraps every page. Font, title, viewport, Chakra provider.
src/app/page.js        The home page. Its URL is /.
src/app/providers.js   Client Component that mounts ChakraProvider.
src/app/globals.css    Document-level CSS, including pixel-art scaling.
src/app/favicon.ico    The browser-tab icon.
public/pixel-mark.png  Tiny skyline drawn at 16×8 and shown larger.
next.config.mjs        Build settings for the Next.js CLI.
eslint.config.mjs      Lint rules. `npm run lint` reads this.
jsconfig.json          Editor support for the @/ import alias.
.env.example           Empty names for secrets. Copy it to .env.local.
prototype/             Earlier simulator and pixel renders. Not part of the app.
```

A file in `src/app/` becomes a route only when it is named `page.js`. Other names (`layout.js`, `providers.js`, `globals.css`) are supporting files and have no URL of their own.

`public/` is served as static files. `public/pixel-mark.png` is available at `/pixel-mark.png`. Nothing in `public/` is compiled.

## How a request flows

Someone opens `http://localhost:3000/`.

1. Next matches the URL `/` to `src/app/page.js`.
2. It renders that page inside `src/app/layout.js`. The layout is the shell (html, body, font, provider). The page is the content.
3. `layout.js` is a Server Component. It runs on the server, including the `next/font` setup, and does not add its own JavaScript to the browser.
4. The layout renders `providers.js` around the page. That file is a Client Component, so this is where the browser JavaScript for the theme starts.
5. `page.js` is also a Server Component. The Chakra `Box`, `Heading`, and `Text` it uses are Client Components from the library. Next server-renders them to HTML, then the browser hydrates them so they can respond to interaction later.
6. The response includes the HTML, the font files, and the CSS. The viewport meta tag comes from the `viewport` export in the layout, not from a hand-written `<meta>` tag.

A future page at `src/app/log/page.js` would be visited at `/log` and would go through the same layout and provider automatically.

## Concepts used here

### Layout versus page

`layout.js` wraps routes and persists across navigations. `page.js` is the route itself. Putting the font and the Chakra provider in the layout means every new page gets them without copying that setup.

### Server versus client

Server Components are the default in the App Router. They can read server-only things (files, databases, secret env vars) and they do not ship their source to the browser.

A file that uses React state, effects, browser APIs, or a library that needs context has to start with `"use client"`. That directive marks the file and everything it imports as client code. `providers.js` has it because `ChakraProvider` uses context. `layout.js` and `page.js` do not, so they stay on the server.

Importing a Client Component from a Server Component is normal. The other direction is the one to avoid: a Client Component cannot import a Server Component. If a widget needs state, make that widget the client file and pass data in as props.

### next/font

`Press_Start_2P` in `layout.js` is loaded by `next/font/google`. Next downloads the font at build time and serves it from this app. The class name on `<html>` applies the face. The CSS variable `--font-pixel` is how the page refers to the same face after Chakra's own reset sets a different body font.

### Chakra provider

Chakra components read the theme from context. Without `ChakraProvider`, they throw. The provider has to be a Client Component, and it has to wrap the tree, so it lives in `providers.js` and the root layout renders it.

Chakra v3 passes the theme as `value={defaultSystem}`. Older examples online pass a `theme` prop. That prop is from v2 and is not this codebase.

The `dev` and `build` scripts pass `--webpack`. Next 16's default bundler is Turbopack, and with Chakra it currently puts Emotion's `<style>` tags in a different spot on the server than in the browser. React then logs a hydration error and redraws the page. Webpack keeps those tags aligned. If a later Next release fixes that, the flags can come off.

`@emotion/react` is the styling engine Chakra uses. `@emotion/styled` and `framer-motion` are installed for later screens. The placeholder does not import them.

### Environment variables

Copy `.env.example` to `.env.local` and fill in real values. Next loads `.env.local` automatically and does not commit it (see `.gitignore`). Restart `npm run dev` after changing it. Next reads env files at startup.

`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, and `DATABASE_URL` have no `NEXT_PUBLIC_` prefix. That means only server code can read them via `process.env`. A Client Component that logs `process.env.STRAVA_CLIENT_SECRET` will see `undefined`, which is what we want. The secret is never put in the browser bundle.

The app does not read these yet. The Strava route and the database come later. The names are reserved so the local file is ready.

### Pixel rendering

The skyline is a 16×8 PNG. CSS shows it at 96×48. `image-rendering: pixelated` in `globals.css` tells the browser to keep hard edges when it scales the image, and the same rule covers a future Pixi canvas. `next/image` is the usual way to show a picture in Next, but its optimizer resamples pixels, so this one mark is a plain `<img>`.

## Libraries, and one that is not installed

Installed, and what they are for:

| Package | Version role |
| --- | --- |
| `next`, `react`, `react-dom` | The app framework and the UI library it renders with. |
| `@chakra-ui/react`, `@emotion/react` | Components and the styling engine behind them. Used by the placeholder. |
| `@emotion/styled`, `framer-motion` | Installed for later screens. Not imported yet. |
| `axios` | HTTP client for the Strava API later. Not imported yet. |
| `pixi.js` | Canvas renderer for the city later. Not imported yet. |

`@pixi/react` is not installed. The current release, 8.0.5, depends on `react-reconciler` 0.31.0, which matches React 19.0. This app is on React 19.3, and that React version needs `react-reconciler` 0.34. The 8.1 alpha still pins 0.31.0, so there is no compatible release to add. The city can use `pixi.js` directly until the React bindings catch up.

## How to add a page

1. Create a folder under `src/app/` named for the URL. `src/app/log/page.js` becomes `/log`.
2. Export a default function from `page.js`. Start it as a Server Component.
3. Add a header comment saying what the page is and how it fits.
4. Do not copy the Chakra provider or the font. The root layout already wraps the new page.
5. Run the app and open the new path.

## How to add a component

1. Put it in `src/components/`, for example `src/components/LogRunButton.js`.
2. Header comment at the top: what it is, and which page uses it.
3. Add `"use client"` only if it needs state, effects, event handlers that touch the browser, or a client library. A component that just renders props can stay a Server Component.
4. Import it from a page or from another component.

## How we comment

Every source file starts with a short header: what the file is for, and how it fits into the app. A Client Component's header comes after the `"use client"` line, because that directive has to be the first statement in the file.

Comment the reason for a line when the line is a framework rule or a tradeoff: why a file is a client component, why a prop is named `value`, why an image is not using `next/image`. Do not comment what the next line already says in plain code.

## Commands

Requires Node.js 20.9 or newer.

```bash
cp .env.example .env.local
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
npm start        # serves the production build
```
