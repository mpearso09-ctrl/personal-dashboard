-- v18: drop the leftover recursive household policies.
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- Production still had these two policies after v16:
--   members_see_household on households
--   owners_manage_members on household_members
-- They queried household_members from inside household RLS, so Postgres raised
-- 42P17 (infinite recursion). That also broke fitness reads, which use the same
-- membership check. They were dropped in the database on 31 Oct 2026.
-- This file records that drop so a fresh database does not recreate them
-- (they are not created by v3–v17) and so re-running this is a no-op if
-- they are already gone.

drop policy if exists "members_see_household" on public.households;
drop policy if exists "owners_manage_members" on public.household_members;
