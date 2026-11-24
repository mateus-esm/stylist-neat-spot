import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // Clinic suites reuse the disposable database, resetting fixtures per test.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});