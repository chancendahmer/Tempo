# Tempo Sendblue sandbox demo runbook

This runbook is for a controlled 10-person product demo on Sendblue's free shared-line plan. It is not a production launch. Sendblue publishes a limit of ten verified contacts for the free plan; the Sendblue dashboard is the authority for actual contact availability.

## Capacity and invitation plan

Use one founder canary and nine trusted testers. Tempo exposes the same open signup flow intended for production, so any valid mobile number can submit the form. Control sandbox usage only by sharing the URL privately; do not post it publicly while the Sendblue account is limited to ten verified contacts.

Tempo creates or updates a Sendblue contact after the person submits the landing-page consent form, then requests Sendblue's one-time verification message. The tester replies to that message, proving control of the phone and starting Tempo onboarding. Tempo responds with its welcome and a VCF contact card containing the Tempo number and robot photo. A manual **Text START** fallback remains on the page if Sendblue's verification message is delayed.

## Founder-owned Sendblue setup

1. Create the free Sendblue API account.
2. Record the API key, API secret, and shared Sendblue phone number privately.
3. In Sendblue API Settings, add both webhook types below using the same URL and a strong secret:
   - `receive`
   - `outbound`
4. Use this webhook URL:

```text
https://tempo-production-8e25.up.railway.app/api/sendblue/webhook
```

5. Confirm the webhook configuration sends the chosen secret in the `sb-signing-secret` header.
6. Store all values only in Railway variables. Never send them in chat or commit them.

## Anthropic and Google

### Anthropic

- Enable API billing or prepaid credits.
- Create a project-scoped API key for this demo.
- Select a current Claude model available to the account and copy its exact API model ID.
- Set a conservative account spend limit and usage alert.

### Google Cloud

- Keep the OAuth app External and in Testing.
- Add every tester who will connect Calendar to the Google Auth Platform test-user list.
- Keep the exact redirect URI `https://tempo-production-8e25.up.railway.app/api/auth/google/callback` on the Web application OAuth client.
- Plan Calendar testing inside the seven-day testing authorization window, or have testers reconnect.

## Railway topology

Tempo needs three running services in the same Railway environment:

1. `tempo-web` using `/railway.web.toml`
2. `tempo-worker` using `/railway.worker.toml`
3. PostgreSQL

Reference the same PostgreSQL `DATABASE_URL` into the web and worker services. Use the same `FIELD_ENCRYPTION_KEY`, Google credentials, and public application URLs in both services.

Required demo variables:

```text
APP_BASE_URL=https://tempo-production-8e25.up.railway.app
DATABASE_URL=${{Postgres.DATABASE_URL}}
FIELD_ENCRYPTION_KEY=<32-byte base64 value>
MESSAGING_PROVIDER=sendblue
SENDBLUE_API_KEY=<Sendblue API key>
SENDBLUE_API_SECRET=<Sendblue API secret>
SENDBLUE_WEBHOOK_SECRET=<the secret configured on both webhooks>
SENDBLUE_PHONE_NUMBER=<shared Sendblue number in E.164 format>
SENDBLUE_API_BASE_URL=https://api.sendblue.com
GOOGLE_CLIENT_ID=<Google Web OAuth client ID>
GOOGLE_CLIENT_SECRET=<Google Web OAuth client secret>
GOOGLE_REDIRECT_URI=https://tempo-production-8e25.up.railway.app/api/auth/google/callback
ANTHROPIC_API_KEY=<Anthropic project API key>
ANTHROPIC_MODEL=<exact model ID available in Anthropic Console>
INTERVENTION_SHADOW_MODE=true
AUTONOMOUS_SENDING_ENABLED=false
```

Do not put `=` in a Railway variable name. The left side is the variable name and the right side is its value. Do not include quotation marks around values.

## Acceptance gate before inviting anyone

1. Deploy both web and worker. The web pre-deploy step applies the Sendblue database migration.
2. Confirm `/api/health` returns HTTP 200 with shadow mode on and autonomous sending off.
3. Confirm `/api/ready` returns HTTP 200 with database and worker both `ready`.
4. Run `npm run smoke:staging` against the public URL.
5. Complete one founder canary:
   - submit the landing-page consent form with the founder's mobile number;
   - reply to Sendblue's one-time verification message, or use **Text START to Tempo** if it does not arrive;
   - receive Tempo's welcome and add the attached contact card;
   - receive the welcome reply;
   - finish onboarding;
   - connect Google Calendar or explicitly skip it;
   - create, list, start, and complete one task;
   - send `HELP` and confirm the expected response;
   - test `STOP` only after the rest of the canary, then confirm no further application-originated message is sent.
6. Verify a duplicate Sendblue webhook does not create a duplicate conversation message.
7. Review Railway logs for webhook-secret failures, job failures, Anthropic errors, and delivery failures.

Do not invite anyone if the canary fails or `/api/ready` is not HTTP 200.

## Demo rollout

Invite in three small waves so failures are caught before all contact slots are occupied:

1. Founder canary
2. Three testers
3. Six testers

Wait at least 30 minutes and review delivery, latency, and onboarding after each wave.

Before each wave:

```powershell
$env:STAGING_BASE_URL = "https://tempo-production-8e25.up.railway.app"
npm run smoke:staging
railway run npm run demo:report
```

The report estimates remaining contact slots from Tempo's consent records. Confirm the count with `sendblue contacts` or the Sendblue dashboard because manually created or partially failed contacts may differ.

## Tester instructions

1. Use the private Tempo link at the assigned start time.
2. Enter the same mobile number they will text from and accept the disclosure.
3. Reply to Sendblue's one-time verification message. If it does not arrive, tap **Text START to Tempo** and send the prefilled message.
4. Add the Tempo contact card from the welcome reply so the name and robot photo stay with the conversation.
5. Complete onboarding naturally. Do not deliberately spam or repeat messages.
6. Report missing replies or replies taking longer than two minutes; do not resend more than once.
7. Use `HELP` for help and `STOP` to opt out.

## Demo deliverables

The demo is complete when:

- all 10 trusted testers can submit consent and text Tempo;
- at least 9 receive and complete initial messaging onboarding;
- at least 8 create a real task;
- at least 6 connect Calendar or intentionally choose to skip it;
- no duplicate webhook causes a duplicate task or reply;
- STOP is honored in every test;
- delivery failures, Anthropic failures, and tester feedback are recorded;
- the founder runs `npm run beta:report` and records the cohort results.

Keep autonomous interventions disabled throughout this sandbox demo. Test the conversational product first; evaluate proactive interventions later in a smaller, explicitly reviewed canary.
