import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".next-dev/**",
    ".book-cache/**",
    "build/**",
    "coverage/**",
    "out/**",
    "playwright-report/**",
    "public/_book/**",
    "test-results/**",
  ]),
]);
