-- v16: turn RLS back on for households and household_members.
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- The app uses the signed-in user's Supabase client (anon key + session), never
-- the service role, for these two tables:
--   * First sign-in (household-provider): select households you own, select your
--     membership (and the embedded household), select fellow members, or insert
--     a household you own and insert yourself as its first member.
--   * If you own a household but have no membership row, insert yourself.
--   * Settings: the owner updates finance_role and deletes other members.
--   * Display names are read with the same user token (PostgREST and a raw REST
--     fetch). No API route or service-role client reads or writes these tables.
-- Adding someone by hand in the SQL editor still works: that connection bypasses RLS.

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.households
    where id = hid
      and owner_id = auth.uid()
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_owner(uuid) from public;
revoke all on function public.is_household_member(uuid) from anon;
revoke all on function public.is_household_owner(uuid) from anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- Drop every policy name used by earlier migrations, then the names below.
drop policy if exists "Members see own household" on public.households;
drop policy if exists "Members can view household" on public.households;
drop policy if exists "Users can create households" on public.households;
drop policy if exists "Owner can update household" on public.households;
drop policy if exists "Owner can delete household" on public.households;
drop policy if exists "households_insert" on public.households;
drop policy if exists "households_select" on public.households;
drop policy if exists "households_update" on public.households;
drop policy if exists "households_delete" on public.households;
drop policy if exists "households_select_member" on public.households;

drop policy if exists "Members see household members" on public.household_members;
drop policy if exists "Members can view members" on public.household_members;
drop policy if exists "Can insert members" on public.household_members;
drop policy if exists "Owner can update members" on public.household_members;
drop policy if exists "Owner can delete members" on public.household_members;
drop policy if exists "hm_select" on public.household_members;
drop policy if exists "hm_insert" on public.household_members;
drop policy if exists "hm_update" on public.household_members;
drop policy if exists "hm_delete" on public.household_members;

drop policy if exists "households_select_own" on public.households;
drop policy if exists "households_insert_own" on public.households;
drop policy if exists "households_update_own" on public.households;
drop policy if exists "households_delete_own" on public.households;
drop policy if exists "household_members_select" on public.household_members;
drop policy if exists "household_members_insert" on public.household_members;
drop policy if exists "household_members_update" on public.household_members;
drop policy if exists "household_members_delete" on public.household_members;

-- Owner sees and edits their household. Members can read it (embedded select
-- on first sign-in and the settings page).
create policy "households_select_own" on public.households
  for select using (owner_id = auth.uid() or public.is_household_member(id));

create policy "households_insert_own" on public.households
  for insert with check (owner_id = auth.uid());

create policy "households_update_own" on public.households
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "households_delete_own" on public.households
  for delete using (owner_id = auth.uid());

-- See your own row and every fellow member. The helpers are security definer,
-- so these policies do not query household_members under RLS.
create policy "household_members_select" on public.household_members
  for select using (
    user_id = auth.uid()
    or public.is_household_member(household_id)
    or public.is_household_owner(household_id)
  );

-- First sign-in inserts yourself into a household you just created (you own it).
-- The owner can also insert another member. Nobody can join a household they do not own.
create policy "household_members_insert" on public.household_members
  for insert with check (public.is_household_owner(household_id));

create policy "household_members_update" on public.household_members
  for update
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

create policy "household_members_delete" on public.household_members
  for delete using (public.is_household_owner(household_id));
