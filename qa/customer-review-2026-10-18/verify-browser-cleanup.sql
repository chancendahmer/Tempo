-- Read only: exact isolated synthetic account phones and exact root test titles.
WITH browser_phones AS (
  SELECT id, right(phone_e164, 4) AS suffix
  FROM users WHERE phone_e164 IN ('+12025550181', '+12025550182')
), alex AS (
  SELECT id FROM users WHERE phone_e164 = '+12025550199'
)
SELECT json_build_object(
  'syntheticOnly', true,
  'browser0181Accounts', (SELECT count(*) FROM browser_phones WHERE suffix = '0181'),
  'browser0182Accounts', (SELECT count(*) FROM browser_phones WHERE suffix = '0182'),
  'browser0181ScheduledActions', (SELECT count(*) FROM scheduled_actions WHERE user_id IN (SELECT id FROM browser_phones WHERE suffix = '0181')),
  'browser0182ScheduledActions', (SELECT count(*) FROM scheduled_actions WHERE user_id IN (SELECT id FROM browser_phones WHERE suffix = '0182')),
  'alexAccounts', (SELECT count(*) FROM alex),
  'oct18Oatmeal', (SELECT count(*) FROM life_items WHERE user_id IN (SELECT id FROM alex) AND data->>'title' = 'QA Oct18 oatmeal'),
  'oct18BreakfastRecap', (SELECT count(*) FROM life_items WHERE user_id IN (SELECT id FROM alex) AND data->>'title' = 'QA Oct18 breakfast recap'),
  'oct18EveningWalk', (SELECT count(*) FROM life_items WHERE user_id IN (SELECT id FROM alex) AND data->>'title' = 'QA Oct18 evening walk')
);
