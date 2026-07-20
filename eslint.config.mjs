import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".next-dev/**",
    ".book-build-staging/**",
    ".book-cache/**",
    "build/**",
    "build.staging/**",
    "coverage/**",
    "out/**",
    "playwright-report/**",
    "public/_book/**",
    "public/_book.staging/**",
    "test-results/**",
  ]),
]);
