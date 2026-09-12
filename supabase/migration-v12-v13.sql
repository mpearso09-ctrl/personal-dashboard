-- v12: allow 'walk' as a training session type (hyrox kept for legacy rows). Applied 2026-09-06.
alter table public.training_sessions drop constraint if exists training_sessions_type_check;
alter table public.training_sessions add constraint training_sessions_type_check
  check (type in ('run','crossfit','gym','walk','hyrox'));

-- v13: personal/business scope on budget + income categories (default personal). Applied 2026-09-12.
alter table public.budget_categories add column if not exists scope text not null default 'personal' check (scope in ('personal','business'));
alter table public.income_categories add column if not exists scope text not null default 'personal' check (scope in ('personal','business'));
