export interface AccountControlRepository {
  disconnectCalendar(userId: string, now: Date): Promise<boolean>;
  deleteAccount(userId: string): Promise<boolean>;
}

export function disconnectCalendar(repository: AccountControlRepository, userId: string, now = new Date()) {
  return repository.disconnectCalendar(userId, now);
}

export async function deleteAccount(
  repository: AccountControlRepository,
  input: { userId: string; confirmation: string },
) {
  if (input.confirmation !== "DELETE") throw new Error("Type DELETE to permanently delete the account.");
  return repository.deleteAccount(input.userId);
}
