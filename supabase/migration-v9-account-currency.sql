-- v9: account currency (CAD/USD), account type, and business/personal scope
-- Applied to production 2026-08-09 via Supabase MCP.

alter table public.accounts
  add column if not exists currency text not null default 'CAD',
  add column if not exists account_type text not null default 'chequing',
  add column if not exists scope text not null default 'personal';

alter table public.accounts
  add constraint accounts_currency_check check (currency in ('CAD','USD')),
  add constraint accounts_account_type_check check (account_type in ('chequing','savings','investments')),
  add constraint accounts_scope_check check (scope in ('personal','business'));

-- Backfill of existing accounts (adjust in Manage Accounts UI if wrong):
update public.accounts set currency='USD' where name = 'TD USD Account';
update public.accounts set scope='business' where name in
  ('Frameworks Chequing Account - 1719','MMP Chequing Account','TD CAD Account','TD USD Account');
update public.accounts set account_type='savings' where name = 'Short Savings - 1185';
update public.accounts set account_type='investments' where name in
  ('I-Trade Account - LIRA','TFSA','Kraken Account - Crypto');
