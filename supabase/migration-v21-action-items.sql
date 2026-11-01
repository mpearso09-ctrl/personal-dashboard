-- v21: Brain action items, plus a separate calendar token table.
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- The Brain page lists open rows from action_items. The Brain bot inserts
-- them with the service role, which bypasses RLS. Signed-in household
-- members can read and mark rows done. They cannot insert or delete.
--
-- Policies call only the SECURITY DEFINER helpers from v16/v17:
--   is_household_member, is_household_owner, shares_household_with.
-- They do not query household_members. Querying that table from a policy
-- raises 42P17 (infinite recursion) once household_members itself has RLS.
--
-- google_calendar_tokens is separate from google_health_tokens. Calendar
-- consent must not replace the Fitbit refresh token.

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  business text not null,
  source_inbox text not null,
  gmail_thread_id text not null,
  gmail_message_id text,
  title text not null,
  summary text,
  due_at timestamptz,
  status text not null default 'open',
  done_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_items_business_check
    check (business in ('frameworks', 'mmp', 'f4e', 'personal')),
  constraint action_items_status_check
    check (status in ('open', 'done', 'archived')),
  constraint action_items_source_inbox_lower
    check (source_inbox = lower(source_inbox)),
  constraint action_items_source_thread_key
    unique (source_inbox, gmail_thread_id)
);

comment on table public.action_items is
  'Open work the Brain bot pulls from Gmail. The app never sends mail from this table.';

comment on column public.action_items.business is
  'frameworks = info@frameworksinc.ca, mmp = mmpenvironmental@gmail.com, f4e = frameworksforeveryone@gmail.com, personal = mpearso09@gmail.com.';

comment on column public.action_items.status is
  'open, done, or archived. There is no drafting status. A suggested reply is generated on demand and is not stored or sent.';

create index if not exists action_items_household_id_idx
  on public.action_items (household_id);

create index if not exists action_items_user_id_idx
  on public.action_items (user_id);

create index if not exists action_items_open_business_idx
  on public.action_items (business, created_at)
  where status = 'open';

create or replace function public.set_action_items_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_action_items_updated_at() from public;
revoke all on function public.set_action_items_updated_at() from anon;
revoke all on function public.set_action_items_updated_at() from authenticated;

drop trigger if exists action_items_set_updated_at on public.action_items;
create trigger action_items_set_updated_at
  before update on public.action_items
  for each row
  execute function public.set_action_items_updated_at();

alter table public.action_items enable row level security;

revoke all on table public.action_items from anon;
grant select, update on table public.action_items to authenticated;
grant select, insert, update, delete on table public.action_items to service_role;

drop policy if exists "action_items_select" on public.action_items;
drop policy if exists "action_items_update" on public.action_items;
drop policy if exists "action_items_insert" on public.action_items;
drop policy if exists "action_items_delete" on public.action_items;

create policy "action_items_select" on public.action_items
  for select to authenticated
  using (
    public.is_household_member(household_id)
    or public.is_household_owner(household_id)
    or public.shares_household_with(user_id)
  );

create policy "action_items_update" on public.action_items
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

-- Calendar tokens. Same lock as google_health_tokens: RLS on, no policies.
-- The service role bypasses RLS. The browser cannot read the refresh token.
create table if not exists public.google_calendar_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_tokens enable row level security;

revoke all on table public.google_calendar_tokens from anon, authenticated;
grant all on table public.google_calendar_tokens to service_role;
