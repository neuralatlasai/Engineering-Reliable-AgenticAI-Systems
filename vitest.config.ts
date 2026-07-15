import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/compiler/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        // Enforce the complete compiler baseline rather than publishing an
        // aspirational threshold that CI never executes. Raise these floors
        // only with focused fixtures for the uncovered error branches.
        branches: 40,
        functions: 70,
        lines: 60,
        statements: 60,
      },
    },
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    passWithNoTests: false,
    setupFiles: ["./tests/setup.ts"],
  },
});
