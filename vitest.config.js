// Vitest config. Tests run in Node, not in a browser: the simulator has
// no DOM, and the golden fixture is a JSON file on disk.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
