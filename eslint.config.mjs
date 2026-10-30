// ESLint setup. `npm run lint` loads this file.
// The rules come from eslint-config-next, which knows the App Router
// (for example, it warns when a Client Component hook is used in the wrong place).
// prototype/ is left out on purpose: those scripts are the pixel experiments,
// they are not part of the Next app, and they should stay unchanged.

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "prototype/**",
  ]),
]);

export default eslintConfig;
