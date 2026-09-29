# Tempo staging deployment

Tempo deploys as three Railway services in one project environment: `tempo-web`, `tempo-worker`, and PostgreSQL. Staging and production must use separate Railway environments, provider credentials, phone numbers, OAuth clients, encryption keys, and databases.

## One-time Railway setup

1. Connect the private GitHub repository to a new Railway project.
2. Create a `staging` environment and add Railway PostgreSQL.
3. Create two services from the same GitHub repository.
4. Set the web service's config-file path to `/railway.web.toml`.
5. Set the worker service's config-file path to `/railway.worker.toml`.
6. Reference PostgreSQL's `DATABASE_URL` into both services.
7. Add all values from `.env.example` to both services. The web does not need the Anthropic API key, but using one shared environment-variable set initially is less error-prone.
8. Generate a staging-only encryption key with `openssl rand -base64 32`; store it only in Railway variables and the team's password manager.
9. Set `APP_BASE_URL` and `GOOGLE_REDIRECT_URI` to the public HTTPS web domain.
10. Keep `INTERVENTION_SHADOW_MODE=true` and `AUTONOMOUS_SENDING_ENABLED=false`.

The web pre-deploy command applies database migrations. The worker never migrates, which avoids two services racing on deploy.

## Migration startup failures

`Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"` identifies the first
migration bookkeeping query, not the underlying database failure. An empty
`params:` line is normal for this statement. Check PostgreSQL service health
and logs first, especially after an interrupted subscription or service restart.

Confirm that both Tempo services reference the existing PostgreSQL service's
`DATABASE_URL` in the same Railway environment. Do not replace or recreate the
database to address a connection failure. Once PostgreSQL is accepting
connections, retry the web deployment, then verify the worker and readiness.

The migration runner reports recognized nested error codes with safe guidance:
`ECONNREFUSED` (connection refused), `ENOTFOUND` (DNS), `ETIMEDOUT` (timeout),
`28P01` (password), `42501` (permissions), and `57P03` (database starting up).
It deliberately omits raw SQL, parameters, connection strings and provider
messages. The diagnostic change must be deployed before it appears in Railway
logs. An unknown cause still requires PostgreSQL logs to diagnose.

Railway variables belong to the deployed services. Restoring a Railway service
does not inject its credentials into a local shell or the local simulation.

## Provider endpoints

- Sendblue receive and outbound webhooks: `POST https://<staging-domain>/api/sendblue/webhook`
- Optional Linq webhook subscription: `POST https://<staging-domain>/api/linq/webhook`
- Optional Twilio inbound webhook: `POST https://<staging-domain>/api/twilio/inbound`
- Optional Twilio delivery callback: `POST https://<staging-domain>/api/twilio/status`
- Google redirect URI: `https://<staging-domain>/api/auth/google/callback`
- Web liveness: `GET /api/health`
- Full readiness: `GET /api/ready`

Sendblue must send webhook requests directly to the canonical public domain with the configured `sb-signing-secret`. The route compares that secret before parsing or storing an event. Linq Standard Webhooks and Twilio signature validation remain available when those optional providers are selected.

## Deployment verification

Run:

```powershell
$env:STAGING_BASE_URL = "https://<staging-domain>"
npm run smoke:staging
```

Then complete the manual provider matrix in `docs/LAUNCH_CHECKLIST.md`. Never enable autonomous sending merely to make a smoke check pass.

Railway config-as-code is service-specific. Railway's current documentation supports selecting a custom repository config path for each service and running migrations as a pre-deploy command.
