-- v19: household RLS for the Brain task tables.
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- brain_items and brain_briefings were readable and writable by every
-- authenticated user (policy USING (true)). brain_overdue_archive_20261101
-- already had RLS on and no policies, so the API could not read it.
--
-- These tables had no household or user column. This adds both, backfills
-- them to the shared household (the one that has a member who is not the
-- owner), and replaces the open policies.
--
-- Policies call the SECURITY DEFINER helpers from v16/v17:
--   is_household_member, is_household_owner, shares_household_with.
-- They do not query household_members. Querying that table from a policy
-- raises 42P17 (infinite recursion) once household_members itself has RLS.
-- The one-time backfill below is not a policy, so it may read household_members.

alter table public.brain_items
  add column if not exists household_id uuid references public.households(id) on delete set null;

alter table public.brain_items
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.brain_briefings
  add column if not exists household_id uuid references public.households(id) on delete set null;

alter table public.brain_briefings
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.brain_overdue_archive_20261101
  add column if not exists household_id uuid references public.households(id) on delete set null;

alter table public.brain_overdue_archive_20261101
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Shared household first: a member who is not the owner (Mike and Melissa).
with shared as (
  select h.id, h.owner_id
  from public.households h
  where exists (
    select 1
    from public.household_members hm
    where hm.household_id = h.id
      and hm.user_id <> h.owner_id
  )
  order by h.created_at
  limit 1
)
update public.brain_items bi
set household_id = shared.id,
    user_id = coalesce(bi.user_id, shared.owner_id)
from shared
where bi.household_id is null;

with shared as (
  select h.id, h.owner_id
  from public.households h
  where exists (
    select 1
    from public.household_members hm
    where hm.household_id = h.id
      and hm.user_id <> h.owner_id
  )
  order by h.created_at
  limit 1
)
update public.brain_briefings bb
set household_id = shared.id,
    user_id = coalesce(bb.user_id, shared.owner_id)
from shared
where bb.household_id is null;

with shared as (
  select h.id, h.owner_id
  from public.households h
  where exists (
    select 1
    from public.household_members hm
    where hm.household_id = h.id
      and hm.user_id <> h.owner_id
  )
  order by h.created_at
  limit 1
)
update public.brain_overdue_archive_20261101 arch
set household_id = shared.id,
    user_id = coalesce(arch.user_id, shared.owner_id)
from shared
where arch.household_id is null;

-- Any rows still unscoped (a database with only one household) attach to the oldest one.
update public.brain_items bi
set household_id = h.id,
    user_id = coalesce(bi.user_id, h.owner_id)
from (
  select id, owner_id
  from public.households
  order by created_at
  limit 1
) h
where bi.household_id is null;

update public.brain_briefings bb
set household_id = h.id,
    user_id = coalesce(bb.user_id, h.owner_id)
from (
  select id, owner_id
  from public.households
  order by created_at
  limit 1
) h
where bb.household_id is null;

update public.brain_overdue_archive_20261101 arch
set household_id = h.id,
    user_id = coalesce(arch.user_id, h.owner_id)
from (
  select id, owner_id
  from public.households
  order by created_at
  limit 1
) h
where arch.household_id is null;

create index if not exists brain_items_household_id_idx
  on public.brain_items (household_id);

create index if not exists brain_items_user_id_idx
  on public.brain_items (user_id);

create index if not exists brain_briefings_household_id_idx
  on public.brain_briefings (household_id);

create index if not exists brain_briefings_user_id_idx
  on public.brain_briefings (user_id);

alter table public.brain_items enable row level security;
alter table public.brain_briefings enable row level security;
alter table public.brain_overdue_archive_20261101 enable row level security;

drop policy if exists "brain_items_modify_authenticated" on public.brain_items;
drop policy if exists "brain_items_select_authenticated" on public.brain_items;
drop policy if exists "brain_items_select" on public.brain_items;
drop policy if exists "brain_items_insert" on public.brain_items;
drop policy if exists "brain_items_update" on public.brain_items;
drop policy if exists "brain_items_delete" on public.brain_items;

drop policy if exists "brain_briefings_modify_authenticated" on public.brain_briefings;
drop policy if exists "brain_briefings_select_authenticated" on public.brain_briefings;
drop policy if exists "brain_briefings_select" on public.brain_briefings;
drop policy if exists "brain_briefings_insert" on public.brain_briefings;
drop policy if exists "brain_briefings_update" on public.brain_briefings;
drop policy if exists "brain_briefings_delete" on public.brain_briefings;

drop policy if exists "brain_overdue_archive_select" on public.brain_overdue_archive_20261101;

-- Owner of the row's household, a member of that household, or anyone who
-- shares a household with the row's user. Melissa can read Mike's rows even
-- when the active household id on the insert was one of his other households.
create policy "brain_items_select" on public.brain_items
  for select to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

create policy "brain_items_insert" on public.brain_items
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

create policy "brain_items_update" on public.brain_items
  for update to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  )
  with check (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

create policy "brain_items_delete" on public.brain_items
  for delete to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

create policy "brain_briefings_select" on public.brain_briefings
  for select to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

create policy "brain_briefings_insert" on public.brain_briefings
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

create policy "brain_briefings_update" on public.brain_briefings
  for update to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  )
  with check (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

create policy "brain_briefings_delete" on public.brain_briefings
  for delete to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

-- The archive is a snapshot. Household members can read it. Writes stay in
-- the SQL editor (the table owner bypasses RLS). There is no write policy.
create policy "brain_overdue_archive_select" on public.brain_overdue_archive_20261101
  for select to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );
