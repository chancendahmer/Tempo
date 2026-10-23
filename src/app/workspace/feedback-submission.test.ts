import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FEEDBACK_RECOVERY_MESSAGE, FEEDBACK_TIMEOUT_MS, FeedbackSubmission } from "./feedback-submission";

const owner = "cache:session-owner";
const draft = { type: "problem" as const, section: "reminders" as const, impact: "slowed" as const, detail: "Keep this draft", followUpConsent: false };
const receipt = { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-10-22T20:00:00Z" };
const success = () => new Response(JSON.stringify({ receipt, cacheKey: owner }), { status: 201 });
const setup = () => {
  const fetcher = vi.fn<typeof fetch>();
  const newId = vi.fn().mockReturnValueOnce("00000000-0000-4000-8000-000000000011").mockReturnValueOnce("00000000-0000-4000-8000-000000000012");
  return { fetcher, newId, submission: new FeedbackSubmission(fetcher, newId) };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("calls the default browser fetch without binding the submission instance as its receiver", async () => {
  const browserFetch = vi.fn(function (this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    return Promise.resolve(success());
  });
  vi.stubGlobal("fetch", browserFetch);
  const submission = new FeedbackSubmission(undefined, () => "00000000-0000-4000-8000-000000000011");
  expect(await submission.submit(draft, owner)).toEqual(receipt);
  expect(browserFetch).toHaveBeenCalledOnce();
  expect(browserFetch.mock.contexts[0]).toBeUndefined();
});

it("turns a raw network failure into human recovery guidance and retries the same draft identity", async () => {
  const f = setup(); f.fetcher.mockRejectedValueOnce(new TypeError("Failed to fetch: synthetic internal detail")).mockResolvedValueOnce(success());
  await expect(f.submission.submit(draft, owner)).rejects.toThrow(FEEDBACK_RECOVERY_MESSAGE);
  expect(vi.getTimerCount()).toBe(0);
  expect(await f.submission.submit(draft, owner)).toEqual(receipt);
  expect(f.fetcher.mock.calls[1][1]?.body).toEqual(f.fetcher.mock.calls[0][1]?.body);
  expect(f.newId).toHaveBeenCalledOnce();
  expect(draft.detail).toBe("Keep this draft");
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds a hung request, aborts it, and preserves its identity for a manual retry", async () => {
  const f = setup(); f.fetcher.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(success());
  const attempt = f.submission.submit(draft, owner);
  const rejected = expect(attempt).rejects.toThrow(FEEDBACK_RECOVERY_MESSAGE);
  await vi.advanceTimersByTimeAsync(FEEDBACK_TIMEOUT_MS - 1);
  expect(f.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1); await rejected;
  expect(f.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  expect(await f.submission.submit(draft, owner)).toEqual(receipt);
  expect(f.fetcher.mock.calls[1][1]?.body).toEqual(f.fetcher.mock.calls[0][1]?.body);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it("bounds a hung response body as well as the initial fetch", async () => {
  const f = setup(); f.fetcher.mockResolvedValue({ ok: true, status: 201, json: () => new Promise(() => {}) } as unknown as Response);
  const rejected = expect(f.submission.submit(draft, owner)).rejects.toThrow(FEEDBACK_RECOVERY_MESSAGE);
  await vi.advanceTimersByTimeAsync(FEEDBACK_TIMEOUT_MS); await rejected;
  expect(f.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([400, 403, 409, 413, 429])("keeps a schema-validated actionable HTTP %s error", async status => {
  const f = setup(); f.fetcher.mockResolvedValue(new Response(JSON.stringify({ error: "Check these fields, then retry." }), { status }));
  await expect(f.submission.submit(draft, owner)).rejects.toThrow("Check these fields, then retry.");
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  { receipt: {} },
  { receipt: { ...receipt, id: "not-a-receipt" } },
  { receipt: { ...receipt, createdAt: "not-a-date" } },
  { receipt: { ...receipt, createdAt: true } },
  { receipt: { ...receipt, extra: "unrecognized" } },
  { error: "Unexpected success shape" },
])("does not claim success for malformed receipt %# and keeps retry identity", async payload => {
  const f = setup(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 201 })).mockResolvedValueOnce(success());
  await expect(f.submission.submit(draft, owner)).rejects.toThrow(FEEDBACK_RECOVERY_MESSAGE);
  expect(await f.submission.submit(draft, owner)).toEqual(receipt);
  expect(f.fetcher.mock.calls[1][1]?.body).toEqual(f.fetcher.mock.calls[0][1]?.body);
});

it.each([
  new Response("synthetic invalid JSON", { status: 201 }),
  new Response(JSON.stringify({ error: "Synthetic raw database details" }), { status: 503 }),
  new Response(JSON.stringify({ error: ["invalid server error shape"] }), { status: 400 }),
])("handles malformed/uncertain responses without exposing transport or server internals %#", async response => {
  const f = setup(); f.fetcher.mockResolvedValue(response);
  await expect(f.submission.submit(draft, owner)).rejects.toThrow(FEEDBACK_RECOVERY_MESSAGE);
  expect(vi.getTimerCount()).toBe(0);
});

it("uses a new identity only when the submitted draft content changes", async () => {
  const f = setup(); f.fetcher.mockRejectedValue(new TypeError("Synthetic offline"));
  for (const detail of ["Keep this draft", "  Keep this draft  ", "A changed draft"]) {
    await expect(f.submission.submit({ ...draft, detail }, owner)).rejects.toThrow(FEEDBACK_RECOVERY_MESSAGE);
  }
  const ids = f.fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).requestId);
  expect(ids[0]).toBe(ids[1]); expect(ids[2]).not.toBe(ids[0]);
  expect(f.newId).toHaveBeenCalledTimes(2);
});

it("ignores a late successful response after the attempt has timed out", async () => {
  const f = setup(); let complete!: (response: Response) => void;
  f.fetcher.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const attempt = f.submission.submit(draft, owner);
  const rejected = expect(attempt).rejects.toThrow(FEEDBACK_RECOVERY_MESSAGE);
  await vi.advanceTimersByTimeAsync(FEEDBACK_TIMEOUT_MS); await rejected;
  complete(success()); await Promise.resolve();
  await expect(attempt).rejects.toThrow(FEEDBACK_RECOVERY_MESSAGE);
  expect(vi.getTimerCount()).toBe(0);
});


it("binds requests and receipt ownership, and does not reuse retry identity across accounts", async () => {
  const f = setup(); f.fetcher.mockResolvedValueOnce(success()).mockResolvedValueOnce(new Response(JSON.stringify({ receipt, cacheKey: "cache:other" }), { status: 201 }));
  await f.submission.submit(draft, owner);
  expect(new Headers(f.fetcher.mock.calls[0][1]?.headers).get("x-tempo-account")).toBe(owner);
  await expect(f.submission.submit(draft, "cache:other")).resolves.toEqual(receipt);
  expect(f.newId).toHaveBeenCalledTimes(2);
  expect(f.fetcher.mock.calls[0][1]?.body).not.toEqual(f.fetcher.mock.calls[1][1]?.body);
});
it("rejects cross-owner receipts and explicit owner conflicts without claiming success", async () => {
  const f = setup();
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ receipt, cacheKey: "cache:other" }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Your account changed.", code: "account_changed" }), { status: 409 }));
  for (let i = 0; i < 2; i++) await expect(f.submission.submit(draft, owner)).rejects.toMatchObject({ accountChanged: true });
  expect(f.newId).toHaveBeenCalledOnce();
});
it("rejects an absent owner before sending a feedback draft", async () => {
  const f = setup(); await expect(f.submission.submit(draft, "")).rejects.toMatchObject({ accountChanged: true });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("clears authenticated feedback ownership before attempting to read a malformed 401 body", async () => {
  const f = setup(); const json = vi.fn().mockRejectedValue(new SyntaxError("Malformed body"));
  f.fetcher.mockResolvedValue({ status: 401, ok: false, json } as unknown as Response);
  await expect(f.submission.submit(draft, owner)).rejects.toMatchObject({ accountChanged: true });
  expect(json).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
