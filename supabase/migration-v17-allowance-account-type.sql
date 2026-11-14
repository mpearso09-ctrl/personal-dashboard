-- v17: Allowance accounts (Mike's and Melissa's individual spending money) are their own
-- group, not savings. Applied via Supabase MCP.
alter table public.accounts drop constraint if exists accounts_account_type_check;
alter table public.accounts add constraint accounts_account_type_check
  check (account_type in ('chequing','savings','investments','allowance'));
update public.accounts set account_type = 'allowance'
  where id in ('7ed00c98-0ba1-4751-a4c0-83cd79e28741','39e84629-95a5-4156-9de2-eebc25abf9d6');
