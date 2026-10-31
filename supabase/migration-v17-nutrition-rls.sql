-- v17: food-log reads must not query household_members under RLS.
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- v15's SELECT policies on nutrition_items and nutrition_settings join
-- household_members. After v16 turned RLS on for that table, those joins are
-- checked by the household_members policies, which call is_household_member.
-- That function reads household_members again. Postgres then raises
-- 42P17 (infinite recursion detected in policy for relation household_members).
-- The Food page treated every PostgREST error as "tables are not in the database".
--
-- These helpers run with row_security off, so they read the tables directly.
-- The food-log policies call shares_household_with instead of joining
-- household_members themselves.

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
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
set row_security = off
as $$
  select exists (
    select 1
    from public.households
    where id = hid
      and owner_id = auth.uid()
  );
$$;

create or replace function public.shares_household_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.household_members me
    join public.household_members them
      on them.household_id = me.household_id
    where me.user_id = auth.uid()
      and them.user_id = other_user
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_owner(uuid) from public;
revoke all on function public.shares_household_with(uuid) from public;
revoke all on function public.is_household_member(uuid) from anon;
revoke all on function public.is_household_owner(uuid) from anon;
revoke all on function public.shares_household_with(uuid) from anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;

drop policy if exists "nutrition settings select" on public.nutrition_settings;
create policy "nutrition settings select" on public.nutrition_settings
  for select using (
    user_id = auth.uid()
    or public.shares_household_with(user_id)
  );

drop policy if exists "nutrition items select" on public.nutrition_items;
create policy "nutrition items select" on public.nutrition_items
  for select using (
    user_id = auth.uid()
    or public.shares_household_with(user_id)
  );
