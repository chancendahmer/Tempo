# Today, setup and activity progress — October 19, 2026

Candidate: `codex/tempo-calm-ui`, PR 26, changes following `6d45d53`.
This is a scoped refinement, not whole-product release approval. Production
and external provider routing were not changed. API spend this pass: **$0**.

## What changed

- Preserved the next-action timeline; added restrained event borders/color,
  directional feedback, a Tempo companion invitation and an optional streak.
- Added a skippable three-step introduction: optional name, coaching tone and
  progress display. Settings can reopen it. It does not enable proactive texts.
- Persisted setup preferences per account and routine completion history in
  PostgreSQL. Real streaks use recorded task completions and routine checkoffs,
  with local-day calculations. Preview activity is explicitly fictional.
- Added task completion Undo. Fixed routine Undo when the prior checkoff was
  on another day. Prior historical activity is preserved.
- Repaired mobile banner wrapping, setup dialog focus restoration and truthful
  Skip messaging following independent review.

## Evidence and limits

Research: [signed-in observations](RESEARCH.md),
[official comparison sources](public-references.md).
Tiimo desktop Day, routine editor and Agenda were inspected without saving
changes. The supplied mobile images were visual references, not a hands-on
mobile evaluation. No copied competitor imagery or clinical efficacy claims.

Local account checks used the isolated `tempo_ui_release` PostgreSQL database
on loopback port 55437, synthetic accounts and the normal authenticated routes:

1. Saved direct coaching tone and hidden streak; reloaded and reopened Settings:
   choices retained. Proactive consent remained unchecked.
2. Setup Escape closed the dialog and restored focus to Personalize Tempo.
3. Routine checkoff changed 0/4 to 1/4 and streak 0 to 1; Undo restored both to
   zero. Recheck and reload retained the checkoff and one-day streak.
4. Preview task completion removed the task; Undo restored its list entry.
5. A fresh empty fixture (ending 0196) automatically opened setup. Skip survived
   reload; the account had no inherited tasks or preview streak. An older
   fixture named Empty already contained two life items and was not suitable
   for this first-visit assertion. The scheduled setup callback now marks the
   offer as shown only when it executes, avoiding effect-cleanup cancellation.
6. Desktop and mobile captures, including 390×844 viewport testing, show the
   repaired banner and visible Start action. The reviewer recorded actual
   content width separately; scrollbar space is not horizontal overflow.

Evidence artifacts remain local: `16-mobile-repaired.jpg`,
`17-mobile-returning.jpg`, `18-compiled-desktop.jpg`,
`19-new-account-setup.jpg`, `task-undo-browser.txt`,
`persisted-account-after-reload.txt`, `new-account-after-skip.txt`, `check.log`.
Account screenshots and generated sign-in artifacts are excluded from Git.

The compiled preview rendered successfully. Authenticated browser persistence
was exercised under the isolated development runtime. The local production
launcher rejects its HTTP localhost APP_BASE_URL, as production requires public
HTTPS; production security validation was not weakened. This is not evidence
of a deployed authenticated journey.

## Automated validation

Final `npm run check` completed with exit 0 after the first-visit callback fix:
lint and typecheck passed; **110 test files passed, 2 skipped; 834 tests passed,
3 skipped**; Next.js production build and the operations TypeScript build
passed. Test duration: 177.03 seconds. `git diff --check` also passed.
The provider billing/auth/transient errors in the test log are deliberate
mock failure cases, not new paid API calls or live billing diagnoses.

Nearest coverage includes setup validation/auth/origin checks, account isolation,
saved preference preservation, duplicate routine saves, routine Undo across
days, timestamp/timezone boundaries and streak calculations. Browser checks
complement these tests; screenshots alone do not establish durable state.

## Independent review

[Full review](customer-review/review.md): first hands-on pass **7.5/10**.
After the named repairs, a secondary review of fresh screenshots, interaction
records and focused source inspection scored **8.2/10**. Its browser became
unavailable, so the second pass was not independent hands-on testing.

| Reviewed area | Repaired score |
|---|---:|
| Today / next action | 8.5 |
| Setup | 8.5 |
| Optional streak | 8.5 |
| Routine/checkoff feedback | 8.5 |
| Navigation | 8 |
| Mobile clarity | 8 |
| Keyboard behavior | 8 |

Minor limits: some secondary text remains small; task Undo preserves historical
completion credit, while routine Undo clears today's checkoff. Screen-reader,
physical-device and instrumented contrast evaluation remain unperformed.

## Database and release handoff

Migrations 0029 (workspace preferences) and 0030 (routine completion ledger)
were applied only to the isolated database. The latter backfills only existing
valid saved checkoff dates; missing older history cannot be reconstructed.
Unique account/routine/step/date keys make repeated saves idempotent. Saved
task timestamps follow the current timezone; routine dates preserve the local
day recorded at completion.

Apply additive migrations before releasing this candidate. If reverting the
application, retain the additive columns/table and their history; do not drop
them as an automatic rollback. Reverting to older routine writers would stop
new ledger capture until the candidate is restored.

Outstanding release gates remain in `docs/UI_RELEASE_CHECKPOINT.md`: candidate
real SMS and Google Calendar verification, complete connected customer journey,
and compatible web/worker deployment. No staging purchase or production merge
was performed in this pass.
