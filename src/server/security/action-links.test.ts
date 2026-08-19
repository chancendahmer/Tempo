import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSecureActionLinks } from "./action-links";
import { verifyActionToken } from "./action-token";

describe("secure SMS action links", () => {
  it("issues action-scoped links without placing user identity in the URL", () => {
    const key = randomBytes(32).toString("base64");
    const userId = randomUUID();
    const links = createSecureActionLinks("https://tempo.example", key);
    const connect = new URL(links.calendarConnect(userId));
    expect(connect.pathname).toBe("/api/auth/google/start");
    expect(connect.toString()).not.toContain(userId);
    expect(verifyActionToken(connect.searchParams.get("token")!, "calendar:connect", key)).toMatchObject({ userId });
    expect(new URL(links.calendarDisconnect(userId)).pathname).toBe("/api/account/calendar/disconnect");
    expect(new URL(links.accountDelete(userId)).pathname).toBe("/api/account/delete");
  });
});
