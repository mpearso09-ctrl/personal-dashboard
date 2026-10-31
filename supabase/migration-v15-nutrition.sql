-- v15: per-user food log and nutrition targets
-- Run this in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.nutrition_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tracked text[] not null default array['calories', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g'],
  targets jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  name text not null,
  quantity text,
  calories numeric(8,1),
  protein_g numeric(7,1),
  fat_g numeric(7,1),
  carbs_g numeric(7,1),
  fiber_g numeric(7,1),
  sugar_g numeric(7,1),
  sodium_mg numeric(8,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_items_user_date
  on public.nutrition_items (user_id, date);

create table if not exists public.nutrition_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_messages_user_date
  on public.nutrition_messages (user_id, date, created_at);

alter table public.nutrition_settings enable row level security;
alter table public.nutrition_items enable row level security;
alter table public.nutrition_messages enable row level security;

-- Household members can read each other's food and targets (same as fitness).
-- Only the owner can change their own rows. Chat text stays private.
drop policy if exists "nutrition settings select" on public.nutrition_settings;
create policy "nutrition settings select" on public.nutrition_settings
  for select using (
    user_id = auth.uid() or user_id in (
      select hm2.user_id from public.household_members hm1
      join public.household_members hm2 on hm1.household_id = hm2.household_id
      where hm1.user_id = auth.uid()
    )
  );

drop policy if exists "nutrition settings insert" on public.nutrition_settings;
create policy "nutrition settings insert" on public.nutrition_settings
  for insert with check (user_id = auth.uid());

drop policy if exists "nutrition settings update" on public.nutrition_settings;
create policy "nutrition settings update" on public.nutrition_settings
  for update using (user_id = auth.uid());

drop policy if exists "nutrition items select" on public.nutrition_items;
create policy "nutrition items select" on public.nutrition_items
  for select using (
    user_id = auth.uid() or user_id in (
      select hm2.user_id from public.household_members hm1
      join public.household_members hm2 on hm1.household_id = hm2.household_id
      where hm1.user_id = auth.uid()
    )
  );

drop policy if exists "nutrition items insert" on public.nutrition_items;
create policy "nutrition items insert" on public.nutrition_items
  for insert with check (user_id = auth.uid());

drop policy if exists "nutrition items update" on public.nutrition_items;
create policy "nutrition items update" on public.nutrition_items
  for update using (user_id = auth.uid());

drop policy if exists "nutrition items delete" on public.nutrition_items;
create policy "nutrition items delete" on public.nutrition_items
  for delete using (user_id = auth.uid());

drop policy if exists "nutrition messages own" on public.nutrition_messages;
create policy "nutrition messages own" on public.nutrition_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
