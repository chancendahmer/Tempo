# Tempo controlled private-pilot release

Observed November 10 New York / November 11 UTC, 2026.

## Deployed result

PR27 and PR28 are merged. Production web and worker both run
`2ca6fc0b1938fd01b9a9a7f82d7feb6e6577b79a` from `main`.
Web deployment: `03dd09aa-dd4f-4305-a274-e2e3d2f03d7f`.
Worker deployment: `cde7a6e3-5468-4334-8e33-7d192f4e2085`.
The source differs from checked/live-tested `36f7f27` only in evidence documents.
Both effective runtime probes verified the full build, exact 36-row migration
ledger through `0035`, matching budget policy, and normal provider credentials
by presence only. No secret values were read or included in evidence.

At 00:10:58 UTC health and readiness passed. The 00:12 UTC operations report
showed one fresh matching web and worker, zero stale/unknown workers, zero
pending inbound/outbound, failed jobs/actions, receipt overflow or new delivery
failures. Thirty-five approved historical ambiguous sends remain acknowledged
with original states unchanged and zero pending reconciliation. No resend.
The report retains two expected advisories because it cannot independently
inspect platform inventory or approved caps; the operator verified those in
Railway and both runtime probes separately. It exited 2, not a silent pass.

## Validation and review

- Full raw `npm run check`: 1,366 passing tests in 178 files, lint, typecheck,
  Next production build and operations build. No application changes afterward.
- Independent focused reminder review: 191 tests. Scripted assistant: 33 turns,
  no detected duplicate/isolation failures. These do not prove live AI or SMS.
- Local isolated concurrency: 100 synthetic accounts, 200 turns, 100 duplicate
  attempts and 10 retries recovered after scripted provider rejections, with no
  stranded work. This load test did not restart processes or test production capacity.
- Fourteen bounded customer workflows scored 9–9.5 in the independent
  [customer review](fresh-customer-review.md). The combined live-model rundown
  scored 9 separately. Known fixture/assertion limitations remain in that report.
- Hosted SMS → task/dashboard refresh/reload, actual scheduled SMS arrival,
  Google Calendar confirmed create/remove, confirmation after an intervening
  reminder, sign-out/sign-in and sourced web search passed their named scenarios.
- The initial final-main compound reminder was five hours late. It was cancelled,
  fixed at the receipt/atomic-persistence boundary, and remains in the incident
  record. The corrected candidate SMS produced one owned note/reminder/job and
  due = receipt + 120 seconds; actual SMS arrived at 6:47 PM New York. Independent
  bounded score: 9/10.
- Final main added the reverse channel check: a real dashboard request created
  **Tempo final main QA**. Receipt `00:06:55.379Z`; reminder/job due
  `00:08:55.379Z`; reminder marked Sent `00:08:57.951Z`; bound outbound marked
  Sent `00:09:01.095Z`. One completed job and one outbound, exact owned compound
  receipt. Thought persisted after reload; Reminders showed Sent at 7:08 PM;
  TextFree showed arrival at the displayed 7:09 PM minute. The outbound record
  changed to Sent 5.716 seconds after due, crossing the minute boundary. That
  database delta is not an exact measurement of carrier or inbox latency.
  No carrier Delivered/Read receipt was recorded. This last input used web chat;
  TextFree's accessibility interface timed out, so no second inbound SMS is claimed.
  The final test thought was then removed through the normal confirmation flow;
  the original demo thought remains and sent reminder history is retained.

Private screenshots, scoped read-only results and manifests remain under
`private/`; they are excluded from Git. The public evidence documents contain
no sign-in links, phone numbers, secrets or raw personal transcripts.

## Audited old-instance cleanup

Railway showed old deployments Removed before any heartbeat archival. Each
manifest passed mode-600 preparation, exact dry-run review, applied audit and
read-only already-recorded verification. Original metadata and timestamps remain.

| Build | Web / worker rows | Reviewed manifest SHA-256 |
| --- | --- | --- |
| c732093 | 1 / 1 | ca0b602b30151995856ad73e63855c6921e7d7d5cca687d18cf54a7403796788 |
| 2e62b62 | 1 / 1 | 159763def688f5ae73badc0ddc59114c03c6b788245b3c41233a976b703f63fa |
| 36f7f27 | 1 / 1 | 425c2987db16421451fb417d74141355b6db89daec49bfcc9564810b9be0d30e |
| a83e58e | 0 / 1 | eb280273993b6d3db3b1e244d09f70aed564d9f91820bf52aa8949cc1da10f80 |

## Costs and operating limits

The new $20 API-testing authorization retains $16.902717 of conservative
commitments: $3.881717 locally settled, $3.021 unresolved old-call hold, $1
carrier hold and $9 hosted hold. The hosted slice since November 10 22:30 UTC
settled 19 attempts for $0.567531, with zero outstanding in that slice. Thus
known new test usage through this observation is **$4.449248**, not $16.90 spent.
The 24-hour operations aggregate includes one older attempt and is a different
window. No hold was silently released and provider invoice reconciliation is
unverified. Later customer operating usage is separate from this bounded test run.

The founder separately approved **$10 total AI usage per UTC day across all
accounts**. Both roles enforce 10,000,000-microdollar global/account caps and
100 global/60 account daily physical-call caps. The global cap is shared,
not $10 for each user. Reservations include outstanding earlier-day liabilities.
Sonnet 4.6 primary calls conservatively need about $6.021 free headroom; this
can temporarily deny another request well before actual daily spend reaches $10.
Hosted search uses the separately metered Haiku 4.5 route. SMS, hosting and
subscriptions are not included in the AI allowance.

## Pilot boundaries and next work

1. The invite-only roster is empty. Existing verified accounts can continue;
   obtain the first named consenting cohort and add only those identifiers via
   the documented admission configuration. Users sign in and authorize Calendar
   themselves. Do not automate invitations without explicit recipient authorization.
2. Start with an attended five-person week using `docs/PRIVATE_BETA_PILOT.md`.
   Record failures and actual costs, then expand by measured gates. Synthetic
   100-account tests do not authorize a 100-person launch claim.
3. The encrypted snapshot and isolated restore verified one recovery point.
   Scheduled backups, retention/PITR and automatic external alerts remain absent.
   Keep a responsible operator and current recovery point; implement ongoing
   backup/alert operations before expansion, without purchasing a plan implicitly.
4. Proactive and cleanup outreach remain off, shadow mode on, canary roster empty.
   Activate a small explicitly opted-in cohort only after its dedicated live
   consent/quiet-hours/caps checks. Requested reminders already work.
5. Revalidate provider pricing **before November 22, 00:00 UTC**; the dated
   enforcement snapshot stops new paid requests on expiry. Railway also displayed
   a December 1 legacy configuration notice; verify and plan that migration.
6. Complete remaining phone-width control and assistive-technology coverage in
   the review. Physical alarm wake, background delivery, brightness, wearables and
   camera barcode behavior are not verified hardware capabilities.

## Safe continuation and demo

Continue in the adaptive-home worktree, not the dirty original checkout. The
documentation-only handoff branch is `codex/pilot-nov10-handoff`; production code
is already merged. Read `AGENTS.md`, this checkpoint and the relevant subsystem
tests. Do not rerun completed paid tests without accounting for their prior holds.

For a short demo: sign in with the dedicated account; show Home and current
To-do; text a uniquely named task and observe it in the workspace; start/pause
its timer; show a meal plan and its derived grocery quantities; save a thought
and schedule a near-future reminder; show the actual reminder arriving. Clearly
label fictional examples. Remove only demo records created for that walkthrough.

Rollback preserves the additive migration/accounting/history records. Pause new
AI by keeping enforcement active and setting all four caps to zero on both roles.
Revert compatible web/worker code together; the previous main has the known
relative-time defect, so rollback is containment. Do not replay ambiguous sends.
See `docs/OPERATIONS.md` and the tested recovery record.
