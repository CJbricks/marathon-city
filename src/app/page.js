// Home page. The App Router maps a folder to a URL: src/app/page.js is "/".
// A file named page.js is the only file in a route folder that becomes a page.
// layout.js in the same folder wraps it; it does not have its own URL.
//
// This file is a Server Component. The Chakra components below are Client
// Components inside the library (each file there starts with "use client").
// A Server Component is allowed to render those. The browser hydrates the
// Chakra pieces; this file itself adds no client JavaScript.

import { Box, Heading, Text } from "@chakra-ui/react";

export default function Home() {
  return (
    <Box
      as="main"
      // dvh counts the height the phone actually shows. 100vh includes the
      // area behind the mobile URL bar, so the navy would stop short or jump.
      minH="100dvh"
      bg="#0D2A6B"
      color="#FDD835"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px="4"
      py="8"
      textAlign="center"
      // Chakra's reset sets a system font on the body. Inherit would pick
      // that up. The variable is the Press Start 2P face from layout.js.
      fontFamily="var(--font-pixel), monospace"
    >
      <Box
        borderWidth="4px"
        borderStyle="solid"
        borderColor="#FDD835"
        px="4"
        py="6"
        maxW="100%"
      >
        {/* 16×8 drawing, displayed at 96×48 by .pixel-mark. next/image would
            resample it for performance, which softens pixel art, so this is
            a plain img. Empty alt: the picture repeats the title, it is not
            extra information for a screen reader. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="pixel-mark"
          src="/pixel-mark.png"
          alt=""
          width={96}
          height={48}
        />
        <Heading
          as="h1"
          m="0"
          fontWeight="normal"
          fontSize="clamp(0.7rem, 3.4vw, 1.15rem)"
          lineHeight="1.7"
          // Heading's recipe sets its own font inside a CSS layer. An
          // unlayered inherit beats that layer, so the title keeps the
          // pixel face from the parent instead of Chakra's default heading font.
          fontFamily="inherit"
        >
          MARATHON CITY
        </Heading>
        <Text
          mt="4"
          mb="0"
          color="#FFFFFF"
          fontSize="clamp(0.55rem, 2.4vw, 0.75rem)"
          lineHeight="1.7"
        >
          Coming soon - Denver
        </Text>
      </Box>
    </Box>
  );
}
