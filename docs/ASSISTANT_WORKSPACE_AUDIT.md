# Assistant and workspace audit — September 28, 2026

## Scope and evidence

Reviewed web ingress, durable inbound worker wiring, shared conversation history,
model/tool boundaries, structured workspace mutations, calendar capability
reporting and the frontend refresh contract. Tests use a temporary migrated
PGlite database and controlled model responses. They do not run production
pg-boss, send carrier messages, or change a real Google calendar.

Live simulation was attempted and stopped before any model calls because
ANTHROPIC_API_KEY and ANTHROPIC_MODEL were unavailable in the process environment.
No secret files were read. Live conversational quality is therefore unverified.

## Fixed findings

- Follow-up edits such as “make it three servings” were rejected because the
  title-word check applied to existing records. The check now applies to creation;
  edits still require a current-turn lookup with the exact ID and version.
- A replayed create with a different payload could receive an “already saved”
  reply before receipt validation. All writes now reach the transactional receipt
  check, which rejects a changed payload without changing the saved record.
- Dinner/lunch/breakfast requests could reach generic task shortcuts. These
  entity references now route to the assistant's structured workspace tools.
- Connection status now explicitly describes workspace records and the alarm
  placeholder, preventing capability guidance from implying hardware support.

## Conversation contract

Tempo's instructions now emphasize direct answers, natural warmth, concise
explanations, one necessary clarification, and specific outcomes. Corrections
should fix the named detail without repeated apologies or pep talks. Existing
fields and routine completion history should survive edits. Suggestions are
separate from saved plans and consumed-food logs. Missing nutrients remain unknown.

This is a prompt improvement, not proof of live model behavior. Tool schemas,
ownership checks, optimistic versions, source quotes, mutation limits and calendar
confirmation gates remain the enforcement layer. The assistant does not become
ChatGPT or switch model providers through these changes.

## What is connected

| Surface | Data and mutation path | Important limit |
| --- | --- | --- |
| Web chat / SMS | Shared conversation, orchestrator and account database | Web replies do not additionally send SMS |
| Tasks / goals | Audited domain commands | Goals and tasks remain distinct entities |
| Routines / meals / recipes / food / workouts / notes / groceries | life_list, life_save, life_remove; account-owned versioned records | Read before edit; one mutation per message |
| Calendar | Google primary calendar lookup and proposal | Explicit confirmation; restricted event types |
| Whiteboard | Workspace reads every 15 seconds; calendar every 60 seconds | Not instantaneous push synchronization |
| Wake & Wind Down | Visual placeholder | No reliable alarm or light control |

## Remaining limitations

- The composer does not transmit the current tab or selected record. “Change this”
  needs a clear conversational reference; the assistant cannot see the screen.
- One state-changing action per message means compound requests cannot all be
  applied in one turn. Remaining actions must be stated honestly.
- Structured life_list is capped at 100 records; workspace/history reads are also
  bounded. Comprehensive long-term history search and pagination are not present.
- Proactive coaching primarily follows task state; saving a routine does not
  automatically create reminders or spoken announcements.
- Prompt instructions cannot alone guarantee graceful language or prevent every
  unsupported success claim. Live multi-turn evaluation is a release gate.
- Real provider delivery, OAuth read/edit, worker crash/recovery, concurrent live
  conversations and hardware behavior still need a configured canary.

## Verification

New checks cover pronoun-based edits through the actual parser tool loop,
unread-ID rejection, changed-payload replay rejection, structured CRUD across
six additional item kinds, owner isolation, app readback and dinner rescheduling.
The 33-turn scripted assistant simulation reported zero state-check issues;
its transcript is qa/assistant-scripted-latest.md and is explicitly synthetic.

Final automated suite: 258 tests passed across 49 files. Lint and typecheck passed. The initial broad routing regression was corrected and its existing regression test passes again.
Production Next.js build and operations compilation also passed. No production deployment or provider configuration was changed.
