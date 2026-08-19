import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidActionTokenError, issueActionToken, verifyActionToken } from "./action-token";

describe("scoped action tokens", () => {
  const key = randomBytes(32).toString("base64");
  const userId = randomUUID();
  const now = new Date("2026-08-18T12:00:00Z");

  it("round-trips the expected user and scope", () => {
    const token = issueActionToken({ userId, scope: "calendar:connect" }, key, now);
    expect(verifyActionToken(token, "calendar:connect", key, now)).toMatchObject({ userId, scope: "calendar:connect" });
  });

  it("rejects a token used for a different action", () => {
    const token = issueActionToken({ userId, scope: "calendar:connect" }, key, now);
    expect(() => verifyActionToken(token, "account:delete", key, now)).toThrow(InvalidActionTokenError);
  });

  it("rejects tampering", () => {
    const token = issueActionToken({ userId, scope: "calendar:connect" }, key, now);
    const replacement = token.endsWith("x") ? "y" : "x";
    expect(() => verifyActionToken(`${token.slice(0, -1)}${replacement}`, "calendar:connect", key, now)).toThrow(
      InvalidActionTokenError,
    );
  });

  it("rejects expiration", () => {
    const token = issueActionToken({ userId, scope: "calendar:connect", ttlSeconds: 60 }, key, now);
    expect(() =>
      verifyActionToken(token, "calendar:connect", key, new Date("2026-08-18T12:01:01Z")),
    ).toThrow(InvalidActionTokenError);
  });
});
