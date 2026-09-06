-- v10: fitness rebuild — visceral fat, stretching, evening walk, alcohol tracking
-- Applied to production 2026-09-05 via Supabase MCP.
-- carbs_g / fat_g columns are kept for historical data but removed from the UI.

alter table public.fitness_daily
  add column if not exists visceral_fat_pct numeric(4,1),
  add column if not exists stretching boolean not null default false,
  add column if not exists evening_walk boolean not null default false,
  add column if not exists drinks_wine int not null default 0,
  add column if not exists drinks_beer int not null default 0,
  add column if not exists drinks_spirits int not null default 0;

alter table public.fitness_goals
  add column if not exists goal_visceral_fat numeric(4,1) default 10;
