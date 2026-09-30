import { randomUUID } from "node:crypto";
import type { CalendarChange } from "../../src/server/domain/assistant-commands";

type Event = { id: string; title: string; start: { dateTime: string }; end: { dateTime: string }; editable: boolean };

/** Isolated account-owned fixture, never a Google connection. */
export function createSimulatedCalendar() {
  const accounts = new Map<string, Event[]>();
  function events(userId: string) {
    let rows = accounts.get(userId);
    if (!rows) {
      rows = [{ id: "fixture-dentist", title: "Dentist", start: { dateTime: "2027-01-15T14:00:00-05:00" }, end: { dateTime: "2027-01-15T15:00:00-05:00" }, editable: true }];
      accounts.set(userId, rows);
    }
    return rows;
  }
  return {
    agenda(userId: string, start: string, end: string) {
      const from = Date.parse(start), to = Date.parse(end);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("Invalid simulated agenda range");
      return JSON.stringify({ simulated: true, events: events(userId).filter(row => Date.parse(row.start.dateTime) < to && Date.parse(row.end.dateTime) > from).sort((a, b) => Date.parse(a.start.dateTime) - Date.parse(b.start.dateTime)) });
    },
    apply(userId: string, change: CalendarChange) {
      const rows = events(userId);
      if (change.operation === "create") {
        rows.push({ id: `fixture-${randomUUID()}`, title: change.title, start: { dateTime: change.start }, end: { dateTime: change.end }, editable: true });
        return;
      }
      const index = rows.findIndex(row => row.id === change.eventId);
      if (index < 0) throw new Error("Simulated event not found in account");
      if (change.operation === "delete") { rows.splice(index, 1); return; }
      const row = rows[index];
      rows[index] = { ...row, title: change.title ?? row.title, start: { dateTime: change.start ?? row.start.dateTime }, end: { dateTime: change.end ?? row.end.dateTime } };
    },
  };
}
