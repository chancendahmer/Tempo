import { AssistantProviderFailure, type AssistantProviderFailureCategory } from "../../domain/assistant-provider-failure";

type ProviderErrorShape = {
  status?: unknown;
  type?: unknown;
  code?: unknown;
  message?: unknown;
  error?: { type?: unknown; code?: unknown; message?: unknown };
};

/** Convert SDK-shaped errors into a safe domain signal; never retain provider text. */
export function normalizeProviderFailure(error: unknown): AssistantProviderFailure {
  if (error instanceof AssistantProviderFailure) return error;
  const value = error && typeof error === "object" ? error as ProviderErrorShape : {};
  const status = typeof value.status === "number" ? value.status : undefined;
  const code = [value.code, value.error?.code, value.type, value.error?.type]
    .filter((part): part is string => typeof part === "string").join(" ").toLowerCase();
  const message = [value.message, value.error?.message]
    .filter((part): part is string => typeof part === "string").join(" ").toLowerCase();

  let category: AssistantProviderFailureCategory = "transient";
  if (status === 402 || /billing|credit.?balance|insufficient.?credit|payment.?required|purchase.?credits|insufficient_quota/.test(`${code} ${message}`)) {
    category = "billing";
  } else if (status === 401 || status === 403 || /authentication_error|invalid_api_key|permission_error/.test(code)) {
    category = "configuration";
  }
  return new AssistantProviderFailure(category, status);
}
