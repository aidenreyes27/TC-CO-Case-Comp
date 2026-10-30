-- Ripeline: scheduled jobs. Run once in the SQL editor AFTER deploying the
-- notify function. Replace the two placeholders first.
--   <PROJECT_REF>  from your Supabase URL: https://<PROJECT_REF>.supabase.co
--   <CRON_SECRET>  the same value you set with `supabase secrets set CRON_SECRET=...`
-- Needs the pg_cron and pg_net extensions (Database > Extensions, turn both on).

-- Every 15 minutes: send "use these soon" alerts to people whose chosen time has come.
select cron.schedule('ripeline-daily-alerts', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
    body := '{"mode": "daily"}'::jsonb
  )
$$);

-- Every day at 3:00 AM UTC: delete meal photos older than 30 days.
select cron.schedule('ripeline-photo-cleanup', '0 3 * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
    body := '{"mode": "cleanup"}'::jsonb
  )
$$);
