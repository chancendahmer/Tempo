import { describe, expect, it } from "vitest";
import { assertPilotOwnedDatabase, latencySummary, pilotLoadConfig, PILOT_ADMIN_URL, PILOT_RUNTIME_MS, PILOT_TURNS_PER_ACCOUNT } from "../../../scripts/pilot-load-config";

describe("isolated pilot drill boundaries", () => {
  it("defaults to twenty accounts and limits account, turn and runtime work", () => {
    expect(pilotLoadConfig([])).toEqual({ accounts: 20, adminUrl: PILOT_ADMIN_URL });
    expect(pilotLoadConfig(["--accounts", "100"]).accounts).toBe(100);
    expect(PILOT_TURNS_PER_ACCOUNT).toBe(2);
    expect(PILOT_RUNTIME_MS).toBe(120_000);
  });
  it.each(["0", "101", "-1", "1.5", "NaN", "1e2", "10000"])("rejects unbounded account count %s", value => {
    expect(() => pilotLoadConfig(["--accounts", value])).toThrow();
  });
  it.each([
    "postgresql://postgres@example.com:55437/tempo_ui_release",
    "postgresql://postgres@127.0.0.1:5432/tempo_ui_release",
    "postgresql://postgres@localhost:55437/tempo_ui_release",
    "postgresql://postgres@127.0.0.1:55437/production",
    "postgresql://postgres@127.0.0.1:55437/tempo_ui_release?host=example.com",
    "postgresql://postgres:secret@127.0.0.1:55437/tempo_ui_release",
    "postgresql://other@127.0.0.1:55437/tempo_ui_release",
  ])("rejects alternate and overridden database targets before connecting", value => {
    expect(() => pilotLoadConfig(["--database", value])).toThrow();
  });
  it("refuses unknown/missing/duplicate flags and other fixture database names", () => {
    for (const args of [["--keep"], ["--accounts"], ["--accounts", "2", "--accounts", "3"]]) expect(() => pilotLoadConfig(args)).toThrow();
    const run = "1234567890abcdef";
    expect(() => assertPilotOwnedDatabase(`tempo_pilot_${run}_test`, run)).not.toThrow();
    for (const name of ["tempo_ui_release", "tempo_ui_release_recovery_test", "tempo_pilot_0000000000000000_test", `tempo_pilot_${run}`]) {
      expect(() => assertPilotOwnedDatabase(name, run)).toThrow();
    }
    expect(() => assertPilotOwnedDatabase("tempo_pilot_unsafe_test", "unsafe")).toThrow();
  });
  it("reports nearest-rank latency without mutating samples or silently accepting invalid evidence", () => {
    const samples = [100, 2, 1, 4, 3];
    expect(latencySummary(samples)).toEqual({ samples: 5, p50Ms: 3, p95Ms: 100, maxMs: 100 });
    expect(samples).toEqual([100, 2, 1, 4, 3]);
    for (const values of [[], [-1], [NaN]]) expect(() => latencySummary(values)).toThrow();
  });
});
