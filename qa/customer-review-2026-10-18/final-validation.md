# Final local validation and restored runtime

After root finished the browser walkthrough and requested the final check, the
verified candidate launcher PID 30364 and its descendants were stopped. The
existing synthetic PostgreSQL cluster was retained. No populated `.env`,
`.env.local`, `.env.production` or `.env.production.local` file existed in this
worktree; no secret file was read. Database/provider opt-in variables were
cleared in the check shell.

The repository's raw **`npm run check` passed, exit 0**:

- Lint: passed without diagnostics.
- Typecheck: passed without diagnostics.
- Vitest: **106 files passed, 2 skipped; 810 tests passed, 3 skipped**, 167.98s.
- Production Next.js build: passed, including TypeScript and 15 static pages.
- Operations TypeScript build: passed.

Evidence: `final-check.log`. Expected negative-case assistant-provider and
authorization warning/error logs appear in the passing test output. They do
not represent live calls or failed tests. The default suite skipped opt-in
PostgreSQL infrastructure cases; their separate fresh 2-file / 3-test pass is
recorded in `account-validation.md`. No skipped case is claimed as executed by
the full check.

Bounded read-only assertions against the exact local synthetic accounts also
passed. `verify-browser-cleanup.sql` and `browser-cleanup-counts.json` record:

- One account each for browser fixtures ending 0181 and 0182; **zero scheduled
  actions** for each.
- One existing Alex account ending 0199; **zero** remaining life items with the
  exact titles `QA Oct18 oatmeal`, `QA Oct18 breakfast recap` and
  `QA Oct18 evening walk`.

The normal allowlisted development candidate was then restarted **without**
`--signup-stub` at `http://localhost:3101`. The public local test key and existing
database/session records were preserved. New launcher PID **23572**, CLI child
**1960**, HTTP listener **16420**; PostgreSQL listener remains **34720** on
`127.0.0.1:55437`. The server is bound only to `127.0.0.1:3101`.

The exact known signup stub PID 31536 was stopped after capturing its final
aggregate counts: **5 accepted / 3 rejected** (`signup-stub-final-counts.json`).
Those comprise one accepted / three rejected containment probes, two contacts
from the HTTP reset suite and two contacts from root's browser signup flow.
No stub listener remains on 3199.

Post-restart checks: `/api/health` returned **200**, unauthenticated
`/api/account/workspace` returned **401**. Next dev's known two-import
`next-env.d.ts` regeneration was restored to its tracked contents after startup;
its diff is empty. `git diff --check` passed.

This leaves a healthy local development runtime and preserved synthetic data.
The build is local validation; no production deployment, merge, real signup
provider verification, carrier SMS receipt or Calendar write is established by
these checks.
