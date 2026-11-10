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
hold. An audited reopen reverses the acknowledgment. No production application
or migration has been performed as of this preview; founder acknowledgment and
the remaining release gates are pending.

After the exact private manifest is prepared and dry-run, review its displayed digest and row count. The proposed decision is to acknowledge the listed historical cases as unresolved without replay. Each original record keeps its current ledger state and any future authoritative evidence can trigger an audited reopen. Pending and newer uncertainty stays visible and continues to block readiness. This decision is separate from release approval.

## Founder approval received

On November 10 the founder replied, “Yes I approve everything,” to the pending
review. The lead explicitly confirmed the scope: acknowledge the exact 35 reviewed
historical messages as unknown without resending, retain the API cap, and keep
release checks. This authorizes the decision and full digest above. It does not
establish delivery, authorize replay, or waive the deployment gates.

Application is still pending the normal candidate migration and a fresh matching
dry-run. Use the existing preparation and disposition commands with
`nov10-history-review`. Stop if the digest, ownership, historical states or linked
work differ. The subsequent read-only result must show the acknowledgment recorded
while the original delivery states remain unchanged.
