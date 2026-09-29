import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarAssistantIntegrations, CALENDAR_EVENTS_SCOPE } from "./calendar-assistant";
import { encryptField } from "../../security/field-encryption";
import { TempoDatabase } from "../../db/client";

const mocks = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), insert: vi.fn(), patch: vi.fn(), remove: vi.fn(), connection: vi.fn() }));
const key = Buffer.alloc(32, 7).toString("base64");
vi.mock("googleapis", () => ({ google: {
  auth: { OAuth2: class { setCredentials() {} } },
  calendar: () => ({ events: { get: mocks.get, list: mocks.list, insert: mocks.insert, patch: mocks.patch, delete: mocks.remove } }),
} }));
vi.mock("../../config/env", () => ({ requireEnv: () => ({ FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", GOOGLE_REDIRECT_URI: "https://example.test/callback" }) }));
vi.mock("../../db/repositories/calendar-sync-repository", () => ({ DrizzleCalendarSyncRepository: class { getActiveConnection = mocks.connection; } }));

describe("confirmation-gated Google Calendar", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const source = "00000000-0000-4000-8000-000000000002";
  const now = new Date("2026-09-15T12:00:00Z");
  const event = { id: "dentist", etag: "v1", summary: "Dentist", organizer: { self: true }, start: { dateTime: "2026-09-16T14:00:00Z" }, end: { dateTime: "2026-09-16T15:00:00Z" } };
  const assistant = () => new CalendarAssistantIntegrations({} as TempoDatabase);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue({ scopes: [CALENDAR_EVENTS_SCOPE], encryptedRefreshToken: encryptField("test-refresh", key) });
    mocks.get.mockResolvedValue({ data: event });
    mocks.patch.mockResolvedValue({ data: { ...event, etag: "v2" } });
    mocks.insert.mockResolvedValue({ data: { id: "created" } });
    mocks.remove.mockResolvedValue({ status: 204 });
  });
  it("proposes without writing, then uses the exact confirmed event and ETag", async () => {
    const service = assistant();
    const proposal = await service.proposeCalendarChange(userId, source, { operation: "update", eventId: "dentist", start: "2026-09-16T19:00:00Z", end: "2026-09-16T20:00:00Z" }, "America/New_York", now);
    expect(proposal.summary).toContain("3:00 PM");
    expect(proposal.summary).toContain("Reply YES");
    expect(mocks.patch).not.toHaveBeenCalled();
    await expect(service.confirmCalendarChange(userId, proposal.token, now)).resolves.toContain("Updated");
    expect(mocks.patch).toHaveBeenCalledWith(expect.objectContaining({ eventId: "dentist", sendUpdates: "none" }), expect.objectContaining({ headers: { "If-Match": "v1" } }));
  });
  it.each([
    { attendees: [{ email: "guest@example.test" }] }, { recurrence: ["RRULE:FREQ=WEEKLY"] },
    { recurringEventId: "series" }, { start: { date: "2026-09-16" } }, { organizer: { self: false } },
  ])("rejects unsupported event shape %j", async (patch) => {
    mocks.get.mockResolvedValue({ data: { ...event, ...patch } });
    await expect(assistant().proposeCalendarChange(userId, source, { operation: "delete", eventId: "dentist" }, "UTC", now)).rejects.toThrow("individual");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects expired and cross-user confirmations", async () => {
    const service = assistant();
    const proposal = await service.proposeCalendarChange(userId, source, { operation: "delete", eventId: "dentist" }, "UTC", now);
    await expect(service.confirmCalendarChange(source, proposal.token, now)).rejects.toThrow("expired");
    await expect(service.confirmCalendarChange(userId, proposal.token, new Date(now.getTime() + 900_000))).rejects.toThrow("expired");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not overwrite a concurrently edited event or claim provider failure succeeded", async () => {
    const service = assistant();
    const proposal = await service.proposeCalendarChange(userId, source, { operation: "delete", eventId: "dentist" }, "UTC", now);
    mocks.get.mockResolvedValue({ data: { ...event, etag: "v2" } });
    await expect(service.confirmCalendarChange(userId, proposal.token, now)).rejects.toThrow("changed");
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue({ data: event });
    mocks.remove.mockRejectedValue(new Error("provider unavailable"));
    await expect(service.confirmCalendarChange(userId, proposal.token, now)).rejects.toThrow("provider unavailable");
  });
  it("reports disconnected calendars truthfully", async () => {
    mocks.connection.mockResolvedValue(null);
    await expect(assistant().agenda(userId, "2026-09-16T00:00:00Z", "2026-09-17T00:00:00Z")).rejects.toThrow("reconnect");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("rejects a create retry whose provider event was moved after creation", async () => {
    const service = assistant();
    const proposal = await service.proposeCalendarChange(userId, source, {
      operation: "create", title: "Dentist", start: "2026-09-16T19:00:00Z", end: "2026-09-16T20:00:00Z",
    }, "UTC", now);
    mocks.insert.mockRejectedValue({ response: { status: 409 } });
    // Same title, different times: this is not the exact confirmed proposal.
    await expect(service.confirmCalendarChange(userId, proposal.token, now)).rejects.toThrow("changed later");
  });
});
