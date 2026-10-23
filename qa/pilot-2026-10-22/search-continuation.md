# Bounded server-search continuation — 2026-10-22

Implemented only in the adaptive worktree's task-intent parser and nearest tests. No provider/model calls, secret reads, deployments or commits were performed.

## Verified protocol and decision

Current primary Anthropic documentation was opened on October 22:

- [Server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools): replay paused assistant content unchanged and retain the same tools. A deferred server call may still need execution; removing its tool can make the continuation invalid.
- [Stop reasons and fallback](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons): a response mixing client and deferred server tools resumes with only the client tool-result blocks and the same tools array. Cap continuation loops.
- [Web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool): `max_uses` is a per-request limit, and returned usage separately reports search consumption. Visible call blocks alone do not establish billable work.

Preserving `max_uses: 2` on every physical request would not itself prove a two-search aggregate bound. The root approved conservative stopping rather than relaxing the turn allowance or omitting a waiting tool. Each request now offers at most one search, leaving room for a deferred search to resume with an unchanged definition under the existing two-use aggregate allowance. This can conservatively stop a search before completion; it does not promise the provider will complete every long-running search.

## Resulting behavior

- Paused and mixed turns keep their exact tool array and original assistant content, including server-result content. The parser resolves server calls by matching their IDs with result blocks, including across responses.
- The turn allowance conservatively accounts for unique announced search IDs, including pending calls, and cumulative authoritative usage. Repeated presentation of the same pending ID does not manufacture a new logical call; repeated nonzero billed usage cannot grant fresh capacity.
- Before another request, the complete unchanged offered allowance must fit within the remaining two-use turn limit. Otherwise the parser stops before another reservation/network attempt and says the live search could not finish. Completed write confirmations and verified reports remain included.
- Ordinary synthesis after fully completed searches can remove exhausted search capacity because no deferred tool remains. The six-application-attempt ceiling remains. With C1 enforcement, SDK retry zero makes those at most six physical sends, each independently reserved, claimed and settled.
- A validation failure while a server search is pending is reported through the existing safe provider-failure path; the parser does not strip the required tool and send a second invalid continuation. The existing one-time search-unavailable fallback remains available before any pending server turn, with a fresh metered attempt.
- Pricing, admission, ledger, trusted out-of-band scope, write authorization and deterministic SMS controls are unchanged. No account/execution metadata was added to prompts. Legacy off-mode SDK retry behavior remains unchanged; the six-physical-send claim above is scoped to enforced retry-zero operation.

## Executed regressions

`npm run test -- src/server/adapters/llm/task-intent-parser.test.ts src/server/adapters/llm/task-intent-parser.search.test.ts`

Passed **2 files / 141 tests**, including 11 new enforced-path cases using mocked SDK sends and accounting repository methods with the real pricing/metered boundary. They cover successful deferred completion with citations, mixed local/deferred tools, exact tool/content preservation, per-attempt reservation/claim/settlement, cumulative usage and repeated IDs, two-use and six-attempt stopping, cap denial after a settled request, completed-write confirmation, initial unavailable-search fallback and no malformed pending-tool fallback. No real PostgreSQL or provider request is used by these 11 cases.

The first new-fixture attempts correctly failed until their mocked environment exposed the logger configuration and their mocked usage included the cache fields required by C1. A list-tasks expectation was corrected to include its existing default `status: open`; production behavior was not changed for those fixture issues.

## Concurrent validation checkpoint

Raw `npm run lint` and `npm run typecheck` were run after the implementation. At that checkpoint they failed only in concurrently authored files outside this task:

- Lint: `src/server/testing/first-week-acceptance.integration.test.ts:201`, `prefer-const` for `current`.
- Typecheck: `src/server/observability/ai-budget-attestation.ts:30/31/32/41`, spread-object literal types widened to `string` where the contract requires fixed mode/expiry values.

The broader adapter plus four reminder-integration command ran **217 tests: 216 passed, one failed**. Its source-bypass guard flagged the new attestation file's provider-host configuration literal, rather than an observed network call. The root was notified to refine that concurrently owned guard. All parser/search cases passed in that run. These results are not presented as a full lint/typecheck/broad-suite pass; final integrated validation remains root-owned.

After the concurrent type/lint repairs, both raw `npm run lint` and `npm run typecheck` were rerun and **passed**. The same broader 217-test command was rerun: **216 passed / one failed**, still the attestation host-literal source-guard false positive described above. No parser/search regression failed. The earlier type/lint failures above are historical checkpoints, superseded by these two passes.
