# Tempo V1 account setup

This checklist separates founder-owned account work from implementation work. Never paste credentials into chat, source files, or screenshots. Store local secrets in `.env.local` and hosted secrets in the deployment provider's environment-variable manager.

## Required now

The accounts below are the founder-owned critical path for live acceptance. Local development, migrations, policy tests, and the provider-free end-to-end journey do not require their secrets. Create development/staging credentials first; production credentials and approvals stay separate until the launch checklist is signed.

### 1. Linq

Create a Linq sandbox account and a Tempo partner workspace. Use separate development/staging and production API tokens. The sandbox is sufficient to validate the API and signed-webhook contract; production traffic requires Linq onboarding, provisioned lines, and a commercial agreement.

Create these resources:

- A partner workspace dedicated to Tempo.
- At least one development line and contact card.
- A V3 API token.
- A webhook subscription for `message.received`, `message.sent`, `message.delivered`, `message.read`, and `message.failed` pointed at `/api/linq/webhook`.

Record these values privately:

- `LINQ_API_KEY`
- `LINQ_WEBHOOK_SECRET`

Tempo uses Linq's default protocol selection (`iMessage → RCS → SMS`) and managed line selection. Signup calls `GET /v3/available_number` once to show a new user the best line and contact card; the user sends `START` first. Normal outbound messages use `POST /v3/messages` without a fixed `from`, allowing Linq to balance and fail over lines.

Before production, obtain written confirmation from Linq about commercial pricing, line capacity, supported launch countries, required business verification/registration, support escalation, data processing terms, and Apple-platform suspension/failover procedures. Do not assume sandbox deliverability represents production capacity.

Twilio is optional fallback infrastructure. Only create/configure it if Tempo decides it needs an independent RCS/SMS route; it is not required for the Linq-first beta.

### 2. Google Cloud

Create a Google Cloud project named `Tempo Development` and:

- Enable the Google Calendar API.
- Configure the OAuth consent screen as External and Testing.
- Add founder/test Google accounts as test users.
- Create a Web application OAuth client.
- Add `http://localhost:3000/api/auth/google/callback` as a development redirect URI.

Record the OAuth Client ID and Client Secret privately. Staging and production redirect URIs will be added after deployment.

Tempo will initially request only free/busy calendar access. Event titles are intentionally excluded from V1 unless beta evidence shows they are necessary.

Google's Testing state is appropriate for staging, but external test users are allowlisted and refresh tokens can be short-lived. Public production OAuth requires a public home page, secure HTTPS redirect URI, and production-readiness/verification work appropriate to the requested scope.

### 3. Anthropic Console

Create an Anthropic Console organization, enable billing or prepaid usage credits, and create a development API key. Store the key privately.

The code will use a provider interface so the model can be changed later without rewriting task, intervention, or conversation logic.

### 4. Railway

Create a Railway account and an empty project named `Tempo`. Do not configure services until the repository is connected.

The planned staging environment contains:

- One web service from this repository
- One worker service from the same repository
- One PostgreSQL service

Production will be a separate Railway environment with separate credentials and data.

### 5. GitHub

Create or select a private GitHub repository for Tempo. Enable two-factor authentication. The repository should be connected to Railway only after the local foundation passes its checks.

## Required before production SMS

- A public domain for Tempo
- A monitored support email
- Legal business or sole-proprietor registration details requested by Linq or downstream carriers
- A final public opt-in flow
- Reviewed Terms of Service and Privacy Policy
- Any carrier registration required for Linq's SMS fallback or a separately enabled Twilio route
- Production Google OAuth consent configuration and any required verification

## Not required for V1

- Stripe or another billing provider
- Redis
- A vector database
- A mobile application account
- Fitbit, Apple, Gmail, or screen-time integrations
- Analytics or error-reporting vendor accounts before staging

## Local programs

Node.js, npm, and Git are sufficient for current development. GitHub CLI is recommended for authentication and pull requests. Docker and ngrok are optional. A hosted staging URL is preferred for provider webhook testing because it is stable and does not expose a developer machine.
