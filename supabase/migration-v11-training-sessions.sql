-- v11: training session logger (runs, CrossFit, gym, HYROX)
-- Applied to production 2026-09-06 via Supabase MCP.

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('run','crossfit','gym','hyrox')),
  subtype text,                       -- run: sprints | vo2 | distance ; crossfit: class | hyrox_class
  duration_min numeric(6,1),
  distance_km numeric(6,2),
  avg_hr int,
  max_hr int,
  rpe int check (rpe between 1 and 10),
  rounds int,                         -- intervals / sprints count
  work_sec int,                       -- interval work seconds (vo2: 240)
  rest_sec int,                       -- interval rest seconds (vo2: 180)
  exercises jsonb,                    -- gym: [{name, target_sets, target_reps, weight, done:[bool]}]
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists training_sessions_user_date on public.training_sessions(user_id, date desc);

alter table public.training_sessions enable row level security;
drop policy if exists "own training sessions" on public.training_sessions;
create policy "own training sessions" on public.training_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
