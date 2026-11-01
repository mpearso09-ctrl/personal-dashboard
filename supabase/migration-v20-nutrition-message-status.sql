-- v20: a food transcript can stay pending when the parser is unavailable.
-- Run this in the Supabase SQL Editor. Safe to re-run.
--
-- When the food model fails, the spoken or typed words are kept and no
-- nutrition_items rows are written. status = 'pending' is the Re-run button.
-- Existing messages were already logged.

alter table public.nutrition_messages
  add column if not exists status text not null default 'logged';

alter table public.nutrition_messages
  drop constraint if exists nutrition_messages_status_check;

alter table public.nutrition_messages
  add constraint nutrition_messages_status_check
  check (status in ('logged', 'pending'));
