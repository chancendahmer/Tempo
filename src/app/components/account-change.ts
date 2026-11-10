export const ACCOUNT_EVENT = "tempo-account-change";
export const ACCOUNT_CHANGE_PARAM = "tempo-session-changed";

/** Notify other tabs without sharing account or session information. */
export function publishAccountChange() {
  window.dispatchEvent(new Event(ACCOUNT_EVENT));
  try {
    window.localStorage.setItem(ACCOUNT_EVENT, `${Date.now()}-${Math.random()}`);
  } catch {
    // Browsers without shared storage can still revalidate through polling.
  }
}
