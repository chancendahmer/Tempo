# Five-person pilot, then twenty

## Before inviting people

Record the deployed web and worker commit, verify /api/health and /api/ready, and resolve any queue degradation with provider evidence. Confirm a restorable database backup and a responsible operator. Perform one real demo-account SMS reminder and one confirmed Google Calendar edit, checking both the phone and dashboard. These are release gates, not accomplished by synthetic tests.

Choose five consenting testers with their own phone numbers and Tempo accounts. No shared demo login. Do not publish participant phone numbers or raw conversations in tickets. Google OAuth External Testing may require each tester's Google account in the test audience. Users complete sign-in and approve permissions themselves.

Keep global autonomous sending off initially. If testing optional proactive support, use only the identified, opted-in pilot account IDs in PROACTIVE_CANARY_USER_IDS. Operator allowlisting does not replace consent, opt-out, quiet hours, caps, cooldowns or Calendar safety checks. Confirm the requested reminder channel and optional check-ins separately. Do not send invitations from automation without explicit authorization.

## First-session guide (10–15 minutes)

1. Open Tempo, verify your own phone and sign in. Confirm that the dashboard is yours; connect Calendar from Extensions if desired.
2. Text “Add a task to water the plants.” Check Tasks in the dashboard. Complete it there, then ask Tempo what remains.
3. Save a recipe, change only its servings, and verify the ingredients remain. Plan it for dinner, then move it to tomorrow.
4. Ask “What should I do first? Advice only.” Confirm your plan did not change.
5. Request two reminders, then move both. Check the dates, times and timezone in the response and dashboard.
6. Ask for tomorrow's morning briefing. Answer the time question briefly. Change a task before delivery and check that the briefing reflects the latest plan.
7. Try a Calendar change. It must request confirmation; NO must leave Google unchanged, YES must change only the intended event.
8. Try the focus timer on mobile and touchscreen. Foreground sunrise/sunset is a visual preview; do not rely on it to wake you from sleep.

Use an ordinary week: changing plans, interruptions, vague wording, corrections, late replies and dashboard-to-text questions. You should not need internal IDs or carefully written commands. When something fails, report it rather than repeatedly creating replacements.

## Feedback card

- Date/time and channel (SMS, dashboard, touchscreen).
- What I wanted; what I typed; what Tempo replied (redact private details).
- What changed in the dashboard/Calendar; was anything unexpected?
- Did I need to repeat myself or switch apps to finish?
- Ease and usefulness, each 1–10; most confusing moment; one improvement.

Operator: classify authorization/privacy, missed/duplicate action, delivery, context, UI or availability. Track attempts and successes, not just successful transcripts. Preserve minimal event IDs in private diagnostics. Never paste secrets into feedback.

## Expansion gate

Run five people for seven days, with at least 100 ordinary requests and 30 scheduled deliveries total. Require zero wrong-account reads/writes, unauthorized changes, consent/quiet-hour violations or duplicate Calendar/SMS actions. Target at least 95% verified task completion, 95% scheduled deliveries within two minutes when providers are available, and fewer than 10% of requests needing an avoidable restatement. Record provider outages separately, without hiding them from total reliability. Target median ease/usefulness of 8 or above; a 9/10 claim needs actual user evidence.

Check queue readiness and masked reports daily; investigate every failed/held job. Expand five additional people at a time up to twenty only while gates remain met. A twenty-account local concurrency pass is not a capacity promise for twenty active humans or an arbitrary larger audience. Measure actual latency, cost, queue age and provider throttling at each step.

## Stop and recover

Pause expansion for any privacy/unauthorized action, repeated wrong-date edits, growing backlog or unknown provider submissions. Disable autonomous sending, enable shadow mode and clear the canary allowlist on the worker. Preserve evidence. Fix and replay the exact failure before resuming. Use the operations runbook for audited per-account retry; never bulk resend uncertain submissions.
