-- Run once in the Supabase SQL editor as postgres after enabling Cron.
-- Purge expired applications and their audit records daily; no student names in job logs.
create extension if not exists pg_cron;
select cron.schedule('tb-registration-retention', '15 18 * * *', 'select public.tb_registration_purge()');
