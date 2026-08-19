import { issueActionToken } from "./action-token";

export type SecureActionLinks = {
  calendarConnect(userId: string): string;
  calendarDisconnect(userId: string): string;
  accountDelete(userId: string): string;
};

function link(baseUrl: string, path: string, token: string) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function createSecureActionLinks(baseUrl: string, encryptionKey: string): SecureActionLinks {
  return {
    calendarConnect: (userId) => link(baseUrl, "/api/auth/google/start", issueActionToken({ userId, scope: "calendar:connect", ttlSeconds: 24 * 3_600 }, encryptionKey)),
    calendarDisconnect: (userId) => link(baseUrl, "/api/account/calendar/disconnect", issueActionToken({ userId, scope: "calendar:disconnect", ttlSeconds: 24 * 3_600 }, encryptionKey)),
    accountDelete: (userId) => link(baseUrl, "/api/account/delete", issueActionToken({ userId, scope: "account:delete", ttlSeconds: 3_600 }, encryptionKey)),
  };
}
