import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", maxWorkers: 1, include: ["qa/pilot-2026-10-22/independent-platform-probe.test.ts"] } });
