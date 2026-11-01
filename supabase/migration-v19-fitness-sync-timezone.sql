-- v19: per-user timezone override for the Google Health / Fitbit sync.
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- When fitness_sync_state.timezone is a valid IANA zone, the sync uses it
-- instead of the zone reported by Google (/users/me/settings). Null leaves
-- the account zone, then FITBIT_TIMEZONE, in place.
--
-- Mike is the auth.users row with email mpearso09@gmail.com
-- (id ef7d8079-ded2-486a-b0c8-d0812f890c07). Other users stay null.
-- This does not change household RLS.

alter table public.fitness_sync_state
  add column if not exists timezone text;

comment on column public.fitness_sync_state.timezone is
  'Optional IANA timezone for the Google Health sync. Null uses the Google account timezone, then FITBIT_TIMEZONE.';

update public.fitness_sync_state as state
set timezone = 'America/Halifax'
where state.user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07'
  and state.user_id = (
    select id from auth.users where email = 'mpearso09@gmail.com'
  )
  and state.timezone is distinct from 'America/Halifax';
