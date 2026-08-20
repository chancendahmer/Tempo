import { describe, expect, it } from "vitest";
import { CalendarAuthorizationError, CalendarDataProvider } from "../adapters/calendar/calendar-provider";
import { encryptField } from "../security/field-encryption";
import { CalendarSyncRepository, StoredCalendarConnection, busyWindowHash, syncCalendar } from "./calendar-sync";
import { ExtensionSignalRepository } from "./extension-signals";

const key = Buffer.alloc(32, 9).toString("base64");

class MemoryRepository implements CalendarSyncRepository {
  replacement?: Parameters<CalendarSyncRepository["replaceBusyWindows"]>[0];
  requiresReauth = false;
  constructor(public connection: StoredCalendarConnection | null) {}
  async getActiveConnection() { return this.connection; }
  async replaceBusyWindows(input: Parameters<CalendarSyncRepository["replaceBusyWindows"]>[0]) { this.replacement = input; }
  async markRequiresReauth() { this.requiresReauth = true; }
}

describe("calendar synchronization", () => {
  it("stores only opaque busy ranges and encrypted refreshed credentials", async () => {
    const connection: StoredCalendarConnection = {
      id: "connection-1",
      userId: "user-1",
      encryptedAccessToken: encryptField("old-access", key),
      encryptedRefreshToken: encryptField("old-refresh", key),
      scopes: ["freebusy"],
    };
    const repository = new MemoryRepository(connection);
    const provider: CalendarDataProvider = {
      async getBusyWindows(input) {
        expect(input.refreshToken).toBe("old-refresh");
        return {
          windows: [
            { start: new Date("2026-08-19T14:00:00Z"), end: new Date("2026-08-19T15:00:00Z") },
            { start: new Date("2026-08-18T09:00:00Z"), end: new Date("2026-08-18T10:00:00Z") },
          ],
          tokens: { accessToken: "new-access", refreshToken: null, expiresAt: null, scopes: [] },
        };
      },
    };
    let published: Parameters<ExtensionSignalRepository["publish"]> | undefined;
    const signalRepository: ExtensionSignalRepository = {
      publish: async (...input) => { published = input; },
      getActive: async () => [],
    };

    const result = await syncCalendar({
      userId: "user-1",
      repository,
      provider,
      signalRepository,
      encryptionKey: key,
      now: new Date("2026-08-18T12:00:00Z"),
    });

    expect(result).toMatchObject({ synced: true, windowCount: 1 });
    expect(repository.replacement?.windows).toEqual([{
      startsAt: new Date("2026-08-19T14:00:00Z"),
      endsAt: new Date("2026-08-19T15:00:00Z"),
      sourceHash: busyWindowHash(new Date("2026-08-19T14:00:00Z"), new Date("2026-08-19T15:00:00Z")),
    }]);
    expect(JSON.stringify(repository.replacement)).not.toContain("event");
    expect(repository.replacement?.encryptedAccessToken).not.toContain("new-access");
    expect(repository.replacement?.encryptedRefreshToken).not.toContain("old-refresh");
    expect(published?.[1]).toMatchObject({ extensionKey: "google_calendar", signalType: "availability", confidence: 1 });
    expect(published?.[1].payload).toEqual(expect.objectContaining({ available: true, windowCount: 1 }));
  });

  it("returns harmlessly when no calendar is connected", async () => {
    const repository = new MemoryRepository(null);
    const provider: CalendarDataProvider = { getBusyWindows: async () => { throw new Error("must not run"); } };
    await expect(syncCalendar({ userId: "user-1", repository, provider, encryptionKey: key }))
      .resolves.toEqual({ synced: false, reason: "not_connected" });
  });

  it("marks revoked credentials for reauthorization without touching SMS state", async () => {
    const repository = new MemoryRepository({
      id: "connection-1", userId: "user-1",
      encryptedRefreshToken: encryptField("refresh", key), scopes: ["freebusy"],
    });
    const provider: CalendarDataProvider = {
      getBusyWindows: async () => { throw new CalendarAuthorizationError(); },
    };
    await expect(syncCalendar({ userId: "user-1", repository, provider, encryptionKey: key }))
      .rejects.toBeInstanceOf(CalendarAuthorizationError);
    expect(repository.requiresReauth).toBe(true);
    expect(repository.replacement).toBeUndefined();
  });
});
