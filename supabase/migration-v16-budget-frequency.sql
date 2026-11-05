-- v16: the Budget edit screen saves how often each amount recurs, but the column was
-- never created, so every save and every new item was rejected. Applied via Supabase MCP.
alter table public.budget_categories
  add column if not exists frequency text not null default 'monthly';
alter table public.budget_categories
  drop constraint if exists budget_categories_frequency_check;
alter table public.budget_categories
  add constraint budget_categories_frequency_check
  check (frequency in ('monthly','weekly','biweekly','annual'));
notify pgrst, 'reload schema';
