export type ExtensionSignal = {
  extensionKey: string;
  signalType: string;
  payload: Record<string, unknown>;
  confidence?: number | null;
  observedAt: Date;
  validUntil: Date;
};

export interface ExtensionSignalRepository {
  publish(userId: string, signal: ExtensionSignal): Promise<void>;
  getActive(userId: string, now: Date): Promise<ExtensionSignal[]>;
}

export const GOOGLE_CALENDAR_EXTENSION_KEY = "google_calendar";
export const CALENDAR_AVAILABILITY_SIGNAL = "availability";
