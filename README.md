# Tempo

Tempo is a consent-first messaging executive-function coach. Linq is the primary transport, using iMessage when available with RCS/SMS fallback; Twilio is an optional secondary adapter. Tempo combines natural-language task and goal management, privacy-minimized Google Calendar free/busy awareness, confirmed rescheduling, deterministic intervention policy, randomized holdouts, feedback attribution, and structured user-correctable memory.

The marketing site and HTTP endpoints run in Next.js. Durable work runs in a separate TypeScript worker backed by PostgreSQL and pg-boss. PostgreSQL is the only durable infrastructure dependency.

## Local setup

1. Install Node.js 20+ and PostgreSQL.
2. Copy `.env.example` to `.env.local` and fill development credentials. Never commit it.
3. Run `npm install`.
4. Run `npm run db:migrate`.
5. In separate terminals, run `npm run dev` and `npm run worker:dev`. Railway uses `npm run worker:start` for the persistent worker service.

Useful commands:

```text
npm run check             lint, types, all tests, production build
npm run db:generate       generate a migration from schema changes
npm run db:migrate        apply pending migrations
npm run context:report    inspect recent context decisions
npm run beta:report       inspect masked beta outcome metrics
npm run smoke:staging     verify a configured staging deployment
```

Autonomous sending requires both `INTERVENTION_SHADOW_MODE=false` and `AUTONOMOUS_SENDING_ENABLED=true`. Both remain safe by default.

## Documentation

- `docs/ARCHITECTURE.md` — runtime, boundaries, privacy, reliability, and experiment rules
- `docs/ROADMAP.md` — staged implementation contract and checkpoint
- `docs/ACCOUNT_SETUP.md` — founder-owned accounts and credentials
- `docs/DEPLOYMENT.md` — Railway staging setup
- `docs/OPERATIONS.md` — incidents, provider failure, backups, and data requests
- `docs/LAUNCH_CHECKLIST.md` — live provider and beta gates
