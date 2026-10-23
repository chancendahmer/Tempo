-- Review only; not executed by agent. Exact main predicate, aggregate metadata only.
SELECT
  current_setting($v$transaction_read_only$v$) AS transaction_read_only,
  current_setting($v$statement_timeout$v$) AS statement_timeout,
  to_char(transaction_timestamp() AT TIME ZONE $v$UTC$v$, $v$YYYY-MM-DD"T"HH24:MI:SS"Z"$v$) AS observed_at_utc,
  count(*) AS condition_rows,
  count(*) FILTER (WHERE outbound_state = $v$ambiguous$v$) AS ambiguous_rows,
  count(*) FILTER (WHERE outbound_state = $v$submitting$v$) AS stale_submitting_rows,
  count(*) FILTER (WHERE provider_message_sid IS NOT NULL AND length(provider_message_sid) > 0) AS receipt_reference_rows,
  count(*) FILTER (WHERE created_at < transaction_timestamp() - $v$1 day$v$::interval) AS created_over_1d_ago,
  count(*) FILTER (WHERE created_at < transaction_timestamp() - $v$7 days$v$::interval) AS created_over_7d_ago,
  to_char(date_trunc($v$hour$v$, min(created_at) AT TIME ZONE $v$UTC$v$), $v$YYYY-MM-DD"T"HH24:MI"Z"$v$) AS oldest_created_hour_utc,
  to_char(date_trunc($v$hour$v$, max(updated_at) AT TIME ZONE $v$UTC$v$), $v$YYYY-MM-DD"T"HH24:MI"Z"$v$) AS latest_updated_hour_utc
FROM public.conversation_messages
WHERE direction = $v$outbound$v$ AND (outbound_state = $v$ambiguous$v$
  OR (outbound_state = $v$submitting$v$ AND submission_started_at < transaction_timestamp() - $v$120 seconds$v$::interval));
