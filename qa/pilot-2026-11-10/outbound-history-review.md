# Historical outbound evidence

Root observed 35 legacy ambiguous rows across two accounts in the production read-only snapshot. All 35 matched the historical failure shape and had unverified stored error text. The database recorded 35 owned direct conversations, same-line historical Sendblue inbound and outbound traffic for all 35 rows, and a matching owned line by the attempt timestamp for 22. It found zero alternate-provider history, same-row bindings, or same-row sent or delivered bindings. Historical line evidence does not establish the outcome of an individual attempt.

Root made six read-only Sendblue GETs during this investigation. The initial history pass used two GETs and reported unverified timestamps for both account scopes. The diagnostic pass used two GETs and returned 35 scoped rows with valid ISO send and update timestamps. The final history pass used two GETs and completed both account scopes. It found 33 rows inside the requested interval, two later rows, and zero strict candidates. There were no creation-time anchors and no exact same-row provider handles. Among one-to-one unbound exact-content pairs, nine send times followed the original update by up to one second and six by over one to five seconds. These timing observations leave all 35 original outcomes unresolved.

The investigation performed no message sends, replays, ledger updates, account changes or production schema changes. All displayed evidence was aggregate. The developer's independent validation used local PostgreSQL and stubbed provider responses.

## Decision for owner review

The final read-only production preview on November 10 verified the exact 35-row,
two-account cohort. It found zero unverified targets, zero runnable linked work,
and zero prior dispositions. Seven related reminders are failed historical
records; their exact states and timestamps are included in the private manifest.
All seven use the occurrence-form key for their owned reminder. This is a key
shape check, not evidence of delivery or a match to a current occurrence.

Reviewed decision: `close_unresolved_without_replay`.

Reviewed SHA-256:
`aaddd2dd3a463820aec0af2dc25f0ac8b08b05dc75e787620fb2900e5fa98565`.

The proposed action appends audit acknowledgments and separates these unchanged
historical uncertainties from new pending delivery problems in readiness. It does
not mark them delivered, resend them, delete messages, or cancel the seven
reminders. New linked executable work or a reschedule restores the readiness
hold. An audited reopen reverses the acknowledgment. At the time of this preview,
production still used the earlier migration prefix.

After the exact private manifest is prepared and dry-run, review its displayed digest and row count. The proposed decision is to acknowledge the listed historical cases as unresolved without replay. Each original record keeps its current ledger state and any future authoritative evidence can trigger an audited reopen. Pending and newer uncertainty stays visible and continues to block readiness. This decision is separate from release approval.

## Founder approval received

On November 10 the founder replied, “Yes I approve everything,” to the pending
review. The lead explicitly confirmed the scope: acknowledge the exact 35 reviewed
historical messages as unknown without resending, retain the API cap, and keep
release checks. This authorizes the decision and full digest above. It does not
establish delivery, authorize replay, or waive the deployment gates.

## Hosted application and audit

The Railway worker at `c732093556f941fb9a4daae7c8ce137ba5851dc5` verified the exact
36-entry migration ledger through `0035`. The post-migration preview reproduced
the approved full digest across 35 rows and two accounts. It matched seven
failed historical reminder records and zero active linked work, prior
dispositions or unverified targets. The default dry run verified the private
manifest.

The lead applied `close_unresolved_without_replay` with approval reference
`nov10-history-review`. The apply returned `applied=true`,
`alreadyRecorded=false` and `deliveryStateUnchanged=true`. The read-only audit
of the same manifest returned `applied=false`, `alreadyRecorded=true` and
`deliveryStateUnchanged=true`. Private screenshots retain the aggregate proof.

Readiness then returned HTTP 200. It reported **35 total unresolved historical
outcomes**, **35 acknowledged**, and **0 pending** in that snapshot. There was
one fresh matching worker, zero stale workers and zero unknown workers. The
original outcome of every historical delivery remains unknown. The append-only
acknowledgment leaves new uncertainty and reactivated linked work visible.
The subsequent demo reminder arrived on the phone. Its separate owned ledger
showed Sendblue acceptance and Sent status. The phone arrival establishes that
new occurrence independently of the zero recorded Delivered/Read receipts in
the scoped snapshot. The 35 historical outcomes remain unresolved.
[Hosted release audit](release-audit-checklist.md)
