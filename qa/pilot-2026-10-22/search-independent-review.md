# Independent search-continuation review — 2026-10-22

Reviewer: `workflow_backend`, independently requested by the resumed root task. Read-only product review; this evidence file is the only edit from this review. No populated environment files, live model/provider calls, real accounts, deployments, or browser checks were used.

## Conclusion

**No actionable findings in the bounded server-search continuation changes.** Reviewed `task-intent-parser.ts`, `task-intent-parser.search.test.ts`, and `search-continuation.md`, then their direct pricing/metering and authorization/account-scope boundaries.

## Protocol and behavior checked

- The parser preserves the original assistant content and tool definitions for a paused or unresolved mixed server/client turn. Mixed continuation adds only the client tool-result blocks. This matches the current [Anthropic server-tool continuation contract](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools) and [mixed stop-reason guidance](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons). Client parallel tool use is explicitly disabled in the request; the parser's single client-result handling is consistent with that offered contract.
- A single-search request allowance is retained while pending. Before another attempt, the unchanged offered allowance must fit the remaining two-use turn allowance. Unique announced IDs, unresolved calls, and cumulative reported usage are all considered. Repeated pending IDs cannot reset the usage counter. The application loop is capped at six attempts. Because the provider limit is per physical request, these checks are necessary in addition to `max_uses`; [Anthropic's search documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) describes the per-request cap and separate reported search usage.
- Exhausted or repeatedly paused search stops before another paid invocation and reports the incomplete search. Search capacity is removed for ordinary synthesis only after no pending server call remains. A pending-tool validation failure does not trigger a second malformed request with its tool removed.
- Completed action results and verified capability/history notices survive subsequent budget/provider failure or search-loop exhaustion. The newly added scenarios exercise a completed grocery write followed by denied or incomplete search. The one-write limit, semantic write authorization, current-message source quote, fresh lookup requirements and deterministic orchestration ownership gates remain on the execution path.
- Each continuation passes through `invokePaidMessage`, preserving the trusted account/execution/cancellation scope established by the orchestrator. Those identifiers remain out-of-band rather than being added to model input. Enforced sends receive separate attempt IDs, reservation/claim/settlement, and SDK retry zero. The six-physical-send statement is correctly limited to this enforced path; off mode retains its legacy SDK retry behavior.
- The metered boundary validates response model and authoritative usage before returning a response to the parser. Unknown/missing/negative/noninteger/mismatched usage and unpriced features retain uncertain debt and fail closed; priceable envelope overruns reach settlement with a halt flag rather than being clamped. The parser's completed-write fallback also covers a metered invocation rejection. No change in this patch bypasses the pricing boundary.

## Fresh executed validation

```powershell
npm run test -- src/server/adapters/llm/task-intent-parser.test.ts src/server/adapters/llm/task-intent-parser.search.test.ts src/server/adapters/llm/paid-invocation.test.ts src/server/adapters/llm/ai-pricing.test.ts src/server/observability/ai-budget-attestation.test.ts
```

Result: **5 files / 185 tests passed**, exit 0. Budget/billing/configuration/transient failure logs in this run were expected mocked failure paths; no paid provider calls occurred. The search tests mock SDK sends and repository methods while exercising the real pricing/metered boundary. The included attestation tests also reran the latest malformed/oversized cap-string regression.

## Limits

This review does not prove live provider availability, real search quality/citation accuracy, real PostgreSQL admission concurrency, or a production inventory. Continuation-specific malformed-usage behavior was checked by tracing the shared boundary and rerunning its focused usage tests; the new search file itself does not exhaust every malformed response-content/usage combination. The two-use policy intentionally may stop a deferred search before completion. Final combined lint/typecheck/build/repository validation remains root-owned; this reviewer did not rerun those broad checks.
