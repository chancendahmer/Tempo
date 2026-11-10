select json_build_object(
  'ledgerRows', (select count(*) from drizzle.__drizzle_migrations),
  'ledgerSha256', (select encode(sha256(convert_to(coalesce(
    string_agg(created_at::text || ':' || hash, E'\n' order by created_at, id), ''
  ), 'UTF8')), 'hex') from drizzle.__drizzle_migrations),
  'users', (select count(*) from public.users),
  'consentRecords', (select count(*) from public.consent_records),
  'conversationMessages', (select count(*) from public.conversation_messages),
  'providerMessageBindings', (select count(*) from public.provider_message_bindings),
  'goals', (select count(*) from public.goals),
  'tasks', (select count(*) from public.tasks),
  'reminders', (select count(*) from public.reminders),
  'scheduledActions', (select count(*) from public.scheduled_actions),
  'queueJobs', (select count(*) from pgboss.job)
);
