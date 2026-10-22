# C1 migration review

Verified 2026-10-22T22:04:16.440Z against an isolated run-owned PostgreSQL database at the explicit loopback fixture (127.0.0.1:55437). No populated environment files, paid provider calls, production changes or shared fixture mutations.

- Applied migrations through 0032 using the same advisory-lock wrapper and Drizzle migrator as scripts/migrate.ts.
- Seeded one synthetic account, task and pilot-feedback row; compared every column as row JSON before and after 0033. All three rows remained byte-for-byte unchanged.
- Upgraded from 33 to 34 migration records. Reran the same shared migration runner: migration IDs, hashes, timestamps and existing rows remained unchanged.
- Compared PostgreSQL catalog constraint and index names against drizzle/meta/0033_snapshot.json. ai_budget_states: 3 constraints, 2 indexes; ai_budget_attempts: 5 constraints, 4 indexes. Exact matches, including explicit foreign-key names; both account foreign keys use ON DELETE SET NULL.
- Both new accounting tables start empty; the additive migration does not invent spend or commitments.
- Removed the run-owned database and temporary trimmed-journal directory after verification.

Enforced wrapper review: invokePaidMessage requires client.baseURL to equal https://api.anthropic.com before constructing the accounting repository or requesting the network. Unpriced SDK endpoint overrides fail closed. Off mode preserves the existing path. The focused paid-invocation suite passed all 16 tests, including denial before messages.create for an unpriced baseURL. This guard constrains the configured SDK endpoint; it is not an environment-wide enforcement attestation.
