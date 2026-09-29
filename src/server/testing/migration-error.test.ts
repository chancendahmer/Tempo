import { describe, expect, it } from "vitest";
import { migrationFailureSummary } from "../../../scripts/lib/migration-error";

describe("safe migration diagnostics", () => {
  it("unwraps Drizzle causes without disclosing SQL, connection strings or parameters", () => {
    const error = new Error("Failed query: private SQL; params: private-value", {
      cause: Object.assign(new Error("postgres://admin:fake-password@private-host/db"), { code: "28P01" }),
    });
    const result = migrationFailureSummary(error);
    expect(result).toContain("[28P01]");
    expect(result).toContain("rejected the password");
    expect(result).not.toMatch(/fake-password|private-host|private-value|private SQL/);
  });
  it("handles aggregate network errors and cyclic causes", () => {
    const error = new AggregateError([{ code: "ECONNREFUSED" }, { code: "ENOTFOUND" }]);
    error.cause = error;
    expect(migrationFailureSummary(error)).toContain("[ECONNREFUSED]");
    expect(migrationFailureSummary(error)).toContain("[ENOTFOUND]");
  });
  it("recognizes node-postgres timeouts without a code", () => {
    expect(migrationFailureSummary(new Error("outer", { cause: new Error("Connection terminated due to connection timeout") }))).toContain("[ETIMEDOUT]");
  });
  it("omits unknown error values and distinguishes permissions from downtime", () => {
    expect(migrationFailureSummary({ code: "42501" })).toContain("lacks permission");
    expect(migrationFailureSummary({ code: "secret-value", message: "private data" })).not.toMatch(/secret-value|private data/);
  });
});
