"use client";

// Chakra's theme wrapper. Every page is rendered inside this component
// because layout.js puts it around {children}.
//
// The "use client" line above is required. ChakraProvider keeps the theme
// in React context, and context only exists in Client Components. layout.js
// stays a Server Component and imports this file; the client boundary
// starts here, not in the layout.

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";

export default function Providers({ children }) {
  return (
    // Chakra v3 takes the theme on `value`, not the older `theme` prop.
    // defaultSystem is the stock theme. A Denver palette can replace this
    // object later without moving the wrapper.
    <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>
  );
}
