// Next.js configuration, read by `next dev`, `next build`, and `next start`.
// This is not a page. Nothing in this file is rendered as a component.

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 writes an AGENTS.md on `next dev` aimed at coding agents.
  // This repo documents itself in docs/NOTES.md, so leave that file ungenerated.
  agentRules: false,
  // Chakra's styles are Emotion style tags. Next 16's default bundler, Turbopack,
  // inserts those tags in a different place on the server than in the browser,
  // so React reports a hydration mismatch. The npm scripts pass `--webpack`,
  // which keeps the tags in the same place. Remove the flags if a future Next
  // release fixes the Turbopack case.
  experimental: {
    // Chakra ships a lot of components from one package. This tells Next to
    // compile only the components a file actually imports, which keeps the
    // browser bundle smaller as the app grows.
    optimizePackageImports: ["@chakra-ui/react"],
  },
};

export default nextConfig;
