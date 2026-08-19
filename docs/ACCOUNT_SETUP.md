# Tempo V1 account setup

This checklist separates founder-owned account work from implementation work. Never paste credentials into chat, source files, or screenshots. Store local secrets in `.env.local` and hosted secrets in the deployment provider's environment-variable manager.

## Required now

The accounts below are the founder-owned critical path for live acceptance. Local development, migrations, policy tests, and the provider-free end-to-end journey do not require their secrets. Create development/staging credentials first; production credentials and approvals stay separate until the launch checklist is signed.

### 1. Sendblue

Create a free Sendblue API account for the controlled 10-contact demo. The sandbox uses a shared Sendblue number and requires every recipient to be a verified account contact. Tempo creates or updates the contact during web signup and requests Sendblue's one-time verification message. The recipient replies to verify the phone; Tempo then sends its welcome and an embedded-photo contact card. A manual **Text START** action remains available if the verification message is delayed.

Record these values privately:

- `SENDBLUE_API_KEY`
- `SENDBLUE_API_SECRET`
- `SENDBLUE_PHONE_NUMBER`

Create strong per-webhook or global signing secret and store it as `SENDBLUE_WEBHOOK_SECRET`. Configure both `receive` and `outbound` webhook types to point at `/api/sendblue/webhook`.

Tempo exposes the same open signup flow intended for production. For the free ten-contact test, control access by sharing the site URL only with trusted testers. The free sandbox is sufficient for a controlled product demonstration, not the 100-person beta.

Linq and Twilio remain optional provider adapters. Linq production access can be revisited after waitlist approval; Twilio can provide an independently registered SMS/RCS route if required. Do not enable either without current credentials and provider-specific end-to-end testing.

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
- Legal business or sole-proprietor registration details requested by the selected provider or downstream carriers
- A final public opt-in flow
- Reviewed Terms of Service and Privacy Policy
- Any carrier registration required for the selected provider's SMS fallback or a separately enabled Twilio route
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
