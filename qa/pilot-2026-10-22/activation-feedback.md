# A2: confirmed time zone and private product feedback

Implemented after checkpoint `4400de5`. No paid API/model call, external message, production database write, production setting change or commit was performed by this package. Root owns current browser/HTTP and integrated release evidence.

## Time zone

Settings → Make Tempo yours shows the account's actual time zone with readable city/region choices. Select **London · Europe**, use **Another city or time zone…** for a custom IANA zone, or choose **Use this device’s zone**, then **Confirm time zone**. The browser button only changes the field and says confirmation is still required; it does not issue a request. Saved server confirmation displays persistently after reload; an unchanged confirmed choice disables duplicate saving, and a changed draft is labelled unsaved. The first optional personalization step exposes the same control. Skipping personalization does not silently accept a browser suggestion. Preview saves only fictional local state and clearly labels that it resets on reload.

`POST /api/account/setup` accepts the strict action `{ "action": "timezone", "timezone": "Europe/London" }`. Validation permits supported named IANA paths or UTC, canonicalizes them through `Intl.DateTimeFormat`, and rejects raw numeric offsets, ambiguous abbreviations and unknown zones. Ownership comes from the verified session; extra account or proactive-opt-in fields are rejected.

The existing `users.timezone` is the sole account time source. Confirmation records a server timestamp in `workspace_preferences.timezoneConfirmedAt` while preserving other preferences and optional setup status. Name/tone/streak setup, quiet hours, consent, onboarding state and proactive opt-in remain unchanged. Existing reminder timestamps and their stored time zones are unchanged; this is a preference for subsequent local-time interpretation, not a reschedule operation. Web data refresh and SMS orchestration read the same account field.

## Feedback

Settings → Feedback & privacy offers **Report a problem** and **Suggest an improvement**. The short modal records a fixed report type, a selected workspace section, an impact category, optional detail (at most 1,000 characters) and an initially unchecked follow-up-consent choice. The optional note is user-authored; users are asked to omit sensitive information. No chat, task body, phone number, screenshot, URL query or Calendar content is automatically attached. Submitting does not call a model or send a follow-up message.

An additive `0032_pilot_feedback` migration creates one dedicated table rather than putting support content into `life_items` or conversation history. Reports do not become assistant memory or tasks. The table stores an account FK with `ON DELETE CASCADE`, a client request UUID unique within that account, fixed metadata, encrypted optional detail, the follow-up flag, a keyed payload fingerprint and creation time. The migration journal and snapshot were updated; existing snapshot tables are unchanged.

`POST /api/account/feedback` requires a verified activated account session and trusted mutation origin, bounds the HTTP body to 4 KiB, validates a strict schema and returns only `{ receipt: { id, createdAt } }` with private/no-store caching. There is no customer list/detail endpoint. Requests cannot select another account. Repository receipt lookup additionally scopes both account and report ID.

Per-account transactions lock the account row, reject deleted/unverified owners and check an existing request UUID before consuming a durable limit of five new reports per fixed hour. Exact retries (including simultaneous retries) return the same receipt without consuming another slot. Reusing a UUID with different report content returns conflict rather than pretending the new version was saved. Optional detail uses the existing AES-GCM field encryption; the fingerprint uses keyed HMAC rather than a public text hash. Unexpected HTTP error logging excludes exception objects, input, SQL parameters and report detail.

The dialog traps Tab, restores focus to the opener, retains form values and request UUID on retryable failure, shows a durable reference only after a successful server receipt, and disables submission entirely in preview. A changed form becomes a deliberately new request; cancelling closes the unsent draft.

## Read-only operator retrieval

```text
npx tsx scripts/pilot-feedback-report.ts --limit 25
npx tsx scripts/pilot-feedback-report.ts --report <report-uuid>
npx tsx scripts/pilot-feedback-report.ts --report <report-uuid> --details
```

The default output contains report ID, a keyed account pseudonym, timestamp, type, section, impact, presence of optional detail and follow-up consent. It does not join phone numbers or conversations and does not decrypt detail. `--details` requires one explicit report UUID and reveals only the optional note the participant submitted. Neither mode mutates state or sends a message. These CLI commands were not run against a configured real database in this pass; repository behavior was exercised against isolated synthetic PGlite records. Consent to follow-up is stored for human triage; this package does not establish a support response SLA or contact a participant.

## Validation

- Seven nearest test files, **42 tests passed**, exit 0: timezone validation, feedback input validation, feedback PGlite integration, setup PGlite integration, feedback HTTP, setup HTTP and existing Journey/setup rendering.
- Fresh **`npm run lint` passed** and **`npm run typecheck` passed**, each exit 0.
- A further setup assertion was added and its five-test file rerun successfully: actual inbound orchestration context reads the newly confirmed account zone. The same test proves the existing reminder row is unchanged and setup adds no consent records or scheduled jobs.
- Feedback tests cover account isolation, strict input/no attachments, bounded detail, encryption/no stored plaintext, simultaneous idempotent submissions, changed-payload conflict, cap/retry/reset behavior, masked operator output, explicit single-report detail and ordinary account-deletion cascade.
- HTTP tests cover foreign origin, missing/unverified session, server-derived ownership, body limits, caps, conflicts and error-log privacy. Providers are not used.

These are isolated code-path and database checks. Actual browser focus, mobile layout, unfamiliar-person completion and any eventual live provider journey must remain attributed to root's separate acceptance run.

## Synthetic acceptance checklist

Use root's isolated localhost candidate and synthetic account. No new provider configuration is needed.

1. In Settings, record the current zone. Click the device suggestion and reload without confirming: the durable zone must remain unchanged. Confirm **London · Europe**, reload and verify the same zone in Settings and the workspace response, the persistent Confirmed status and disabled duplicate-save button. Choosing another city must show an unsaved draft without overwriting the confirmed account zone.
2. Submit a problem with synthetic detail and follow-up unchecked. Save the displayed receipt. Repeat its exact HTTP body/request UUID: expect the same receipt. Change its detail under that UUID: expect 409. A foreign account's repository receipt lookup must return null; there is no customer report list route.
3. Verify optional detail is ciphertext in SQL and absent from default operator output. No conversation message or scheduled action should be created by reporting. Test one explicit single-report operator read with synthetic content only.
4. At desktop and mobile widths, test Tab/Shift-Tab/Escape and opener focus, failure retention, successful receipt and preview-disabled submission. The time-zone suggestion and report form must never create outbound messages.
5. Delete a separate synthetic account through the ordinary account-control repository and verify its report/receipt disappear while other accounts remain. Keep the main browser fixture intact for the rest of release QA.
