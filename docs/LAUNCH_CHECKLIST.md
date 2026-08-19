# Tempo staging and beta launch checklist

Production autonomous sending stays disabled until every required item is checked and the founder explicitly signs off.

## Accounts and public identity

- [ ] Private GitHub repository connected to Railway
- [ ] Separate Railway staging environment with web, worker, and PostgreSQL
- [ ] Public HTTPS domain, support email, Terms URL, and Privacy URL
- [ ] Founder supplies the operating legal entity and jurisdiction; qualified counsel reviews the drafted Terms, Privacy Policy, SMS consent language, and data-retention commitments
- [ ] The selected production messaging provider has a dedicated line, API credentials, authenticated webhooks, and enough healthy capacity
- [ ] The provider confirms production access and capacity for at least 100 beta users; free sandboxes are used only for controlled demos
- [ ] Commercial pricing, capacity, support escalation, Apple dependency, data processing, and required carrier registration are confirmed in writing
- [ ] Launch countries match provider protocol/line availability and legal requirements; disable unsupported countries before inviting users
- [ ] Google Calendar API enabled; OAuth app has correct home, privacy, and terms information
- [ ] Staging users allowlisted while Google OAuth remains in Testing
- [ ] Before more than 100 users can connect Calendar, the production OAuth app is published and any required brand/scope verification is complete; Calendar remains optional until that gate passes
- [ ] Anthropic billing and staging API key configured with a spend limit

## Automated gates

- [ ] `npm run check`
- [ ] `npm audit --omit=dev` reports zero production vulnerabilities
- [ ] `npm run smoke:staging`
- [ ] `/api/ready` reports database and worker ready
- [ ] Health response reports `shadowMode=true` and `autonomousSendingEnabled=false`
- [ ] Restored-backup drill completed

## Messaging end-to-end matrix

- [ ] Signup prepares the provider contact/line and exposes a working `START` deep link
- [ ] First user message is inbound; no welcome is queued before `START`
- [ ] A valid authenticated provider webhook is acknowledged quickly and processed once
- [ ] Duplicate webhook creates one message/action
- [ ] Invalid signature receives 403
- [ ] Default service selection delivers through iMessage, RCS, or SMS and records the actual service
- [ ] Outbound statuses reach sent/delivered/read where supported or a recorded failure
- [ ] STOP revokes consent and cancels queued application work
- [ ] START records renewed consent
- [ ] HELP returns the configured help response
- [ ] Paused and opted-out users receive no application-originated message
- [ ] Line status/reputation alerts and provider outage escalation are monitored
- [ ] Optional Twilio fallback is tested separately before it is enabled

## Google end-to-end matrix

- [ ] Connect link opens the expected Google consent screen and minimal free/busy scope
- [ ] Callback succeeds once; replay fails
- [ ] Refresh survives access-token expiry
- [ ] Busy windows contain only times and hashes, never event titles
- [ ] Revocation degrades without blocking SMS
- [ ] Disconnect erases tokens and cached windows

## Intervention experiment

- [ ] At least 48 hours of real staging context snapshots reviewed in shadow mode
- [ ] Quiet-hours, calendar-busy, cooldown, daily-cap, pending-response, pause, and consent blocks observed
- [ ] Holdout bucket replay verified
- [ ] Five intervention styles reviewed for tone and specificity
- [ ] Feedback start/helpfulness questions arrive separately
- [ ] Task start/complete attribution and timeout outcome verified
- [ ] `npm run beta:report` reviewed with no raw phone numbers
- [ ] Founder can review beta signups, activation, onboarding completion, calendar connections, task completion, seven-day retention, delivery failures, opt-outs, and feedback without accessing raw provider logs

## Founder sign-off

- [ ] Founder approves the current policy version and message examples
- [ ] Founder approves staged cohorts of 5, 25, 75, then at least 125 invited users, with a 48-hour reliability and feedback review before each expansion
- [ ] Founder confirms on-call contact and incident response ownership
- [ ] Only then: set `INTERVENTION_SHADOW_MODE=false`
- [ ] Only then: set `AUTONOMOUS_SENDING_ENABLED=true`
- [ ] Enroll one internal canary first; wait 24 hours before broader beta invites
