import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Each integration file owns a WASM PostgreSQL instance. Bound memory use.
    maxWorkers: 1,
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
