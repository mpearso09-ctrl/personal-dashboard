-- v14: Google Health API (Fitbit) daily sync
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- Tokens are readable only with the service role key (no policies for
-- anon or authenticated). The fitness page can read fitness_sync_state
-- for the signed-in user, but cannot write it.

alter table public.fitness_daily
  add column if not exists resting_heart_rate int;

comment on column public.fitness_daily.resting_heart_rate is
  'Daily resting heart rate in bpm, filled by the Google Health sync. Manual saves do not write this column.';

alter table public.training_sessions
  add column if not exists source text,
  add column if not exists source_id text;

-- Multiple manual rows keep source_id NULL. Postgres treats those NULLs as
-- distinct, so this unique index only dedupes imported sessions.
create unique index if not exists training_sessions_user_source_id
  on public.training_sessions (user_id, source_id);

create table if not exists public.google_health_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text,
  health_user_id text,
  legacy_user_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_health_tokens enable row level security;
-- Intentionally no policies. The service role bypasses RLS. Everyone else
-- is denied, including the signed-in owner using the anon key.

create table if not exists public.fitness_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connected boolean not null default false,
  last_synced_at timestamptz,
  last_sync_error text,
  last_email_error text,
  updated_at timestamptz not null default now()
);

alter table public.fitness_sync_state enable row level security;

drop policy if exists "read own fitness sync state" on public.fitness_sync_state;
create policy "read own fitness sync state" on public.fitness_sync_state
  for select using (auth.uid() = user_id);
