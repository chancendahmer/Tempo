-- Prepared only; NOT executed by the agent.
-- Schema/predicate source: main 86ae01023abcf24bcc8da9ed9d367192e14a29ae.
-- Current deployed SHA/schema remain unverified. Stop on missing columns; do not migrate.
-- Aggregate metadata only: no account/message/receipt IDs, bodies, addresses or error text.
-- If the approved UI accepts SELECT only, run the SELECT/CTE queries individually;
-- do not substitute a privileged shell or credential export to bypass its restrictions.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

-- 1. Exact ALL-TIME readiness condition. Counts are current snapshot state,
-- not proof of rejection, duplicate delivery, customer impact or provider acceptance.
SELECT
  to_char(transaction_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS observed_at_utc,
  count(*) FILTER (WHERE outbound_state = 'ambiguous'
    OR (outbound_state = 'submitting' AND submission_started_at < transaction_timestamp() - interval '120 seconds')) AS readiness_condition_count,
  count(*) FILTER (WHERE outbound_state = 'ambiguous') AS ambiguous_count,
  count(*) FILTER (WHERE outbound_state = 'submitting'
    AND submission_started_at < transaction_timestamp() - interval '120 seconds') AS stale_submitting_count,
  count(*) FILTER (WHERE outbound_state = 'submitting' AND submission_started_at IS NULL) AS submitting_missing_start_not_in_predicate,
  count(*) FILTER (WHERE (outbound_state = 'ambiguous'
    OR (outbound_state = 'submitting' AND submission_started_at < transaction_timestamp() - interval '120 seconds'))
    AND provider_message_sid IS NOT NULL AND length(provider_message_sid) > 0) AS condition_rows_with_receipt_reference,
  to_char(date_trunc('hour', min(created_at) FILTER (WHERE outbound_state = 'ambiguous'
    OR (outbound_state = 'submitting' AND submission_started_at < transaction_timestamp() - interval '120 seconds')) AT TIME ZONE 'UTC'),
    'YYYY-MM-DD"T"HH24:MI"Z"') AS condition_oldest_created_hour_utc,
  to_char(date_trunc('hour', max(updated_at) FILTER (WHERE outbound_state = 'ambiguous'
    OR (outbound_state = 'submitting' AND submission_started_at < transaction_timestamp() - interval '120 seconds')) AT TIME ZONE 'UTC'),
    'YYYY-MM-DD"T"HH24:MI"Z"') AS condition_latest_updated_hour_utc
FROM public.conversation_messages
WHERE direction = 'outbound';

-- 2. Sanitized grouping of only the exact condition rows. Age is submission
-- start age, not delivery age. Missing start still qualifies if state=ambiguous.
-- total_groups reveals whether the maximum100 returned groups truncate output.
WITH classified AS (
  SELECT
    CASE WHEN outbound_state IN ('reserved','submitting','accepted','ambiguous','suppressed')
      THEN outbound_state ELSE 'other' END AS state_bucket,
    CASE WHEN provider IS NULL THEN 'unrecorded'
      WHEN provider::text IN ('sendblue','linq','twilio','test') THEN provider::text ELSE 'other' END AS provider_bucket,
    CASE WHEN status::text IN ('received','queued','processing','processed','sent','delivered','cancelled','failed','undelivered')
      THEN status::text ELSE 'other' END AS status_bucket,
    CASE WHEN submission_started_at IS NULL THEN 'missing_start'
      WHEN submission_started_at > transaction_timestamp() THEN 'future_start'
      WHEN submission_started_at >= transaction_timestamp() - interval '1 hour' THEN 'under_1h'
      WHEN submission_started_at >= transaction_timestamp() - interval '1 day' THEN '1h_to_1d'
      WHEN submission_started_at >= transaction_timestamp() - interval '7 days' THEN '1d_to_7d'
      WHEN submission_started_at >= transaction_timestamp() - interval '30 days' THEN '7d_to_30d'
      ELSE 'over_30d' END AS submission_age_bucket,
    provider_message_sid IS NOT NULL AND length(provider_message_sid) > 0 AS has_receipt_reference
  FROM public.conversation_messages
  WHERE direction = 'outbound' AND (outbound_state = 'ambiguous'
    OR (outbound_state = 'submitting' AND submission_started_at < transaction_timestamp() - interval '120 seconds'))
), grouped AS (
  SELECT state_bucket, provider_bucket, status_bucket, submission_age_bucket,
    count(*) AS condition_rows, count(*) FILTER (WHERE has_receipt_reference) AS receipt_reference_rows
  FROM classified
  GROUP BY state_bucket, provider_bucket, status_bucket, submission_age_bucket
)
SELECT *, count(*) OVER () AS total_groups
FROM grouped
ORDER BY condition_rows DESC, state_bucket, provider_bucket, status_bucket, submission_age_bucket
LIMIT 100;

-- 3. Fixed UTC creation window ending at the observed public readiness failure.
-- This is CURRENT row state for rows created in that window, not historical
-- state reconstruction. Query1 must remain all-time; this window cannot clear it.
WITH selected_window AS (
  SELECT timestamptz '2026-10-22 17:18:30+00' AS window_start,
    timestamptz '2026-10-23 17:18:30+00' AS window_end
)
SELECT
  to_char(w.window_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS creation_window_start_utc,
  to_char(w.window_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS creation_window_end_exclusive_utc,
  count(m.id) AS outbound_created_in_window,
  count(m.id) FILTER (WHERE m.outbound_state = 'ambiguous'
    OR (m.outbound_state = 'submitting' AND m.submission_started_at < transaction_timestamp() - interval '120 seconds')) AS current_condition_rows_in_window,
  count(m.id) FILTER (WHERE m.status IN ('failed','undelivered')) AS current_failed_or_undelivered_in_window,
  count(m.id) FILTER (WHERE m.status = 'delivered') AS current_delivered_in_window,
  to_char(date_trunc('hour', max(m.updated_at) AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI"Z"') AS latest_updated_hour_utc
FROM selected_window w
LEFT JOIN public.conversation_messages m ON m.direction = 'outbound'
  AND m.created_at >= w.window_start AND m.created_at < w.window_end
GROUP BY w.window_start, w.window_end;

COMMIT;
