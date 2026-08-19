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
