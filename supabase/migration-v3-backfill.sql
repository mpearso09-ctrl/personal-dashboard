-- Backfill household_id on existing finance data
-- Links all rows owned by user ef7d8079-ded2-486a-b0c8-d0812f890c07
-- to household 16098cc2-e3b8-4939-929f-492a3afca363

UPDATE budget_categories SET household_id = '16098cc2-e3b8-4939-929f-492a3afca363' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07' AND household_id IS NULL;
UPDATE budget_daily SET household_id = '16098cc2-e3b8-4939-929f-492a3afca363' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07' AND household_id IS NULL;
UPDATE accounts SET household_id = '16098cc2-e3b8-4939-929f-492a3afca363' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07' AND household_id IS NULL;
UPDATE account_balances SET household_id = '16098cc2-e3b8-4939-929f-492a3afca363' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07' AND household_id IS NULL;
UPDATE net_worth_items SET household_id = '16098cc2-e3b8-4939-929f-492a3afca363' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07' AND household_id IS NULL;
UPDATE net_worth_entries SET household_id = '16098cc2-e3b8-4939-929f-492a3afca363' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07' AND household_id IS NULL;
UPDATE investments SET household_id = '16098cc2-e3b8-4939-929f-492a3afca363' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07' AND household_id IS NULL;
UPDATE reimbursements SET household_id = '16098cc2-e3b8-4939-929f-492a3afca363' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07' AND household_id IS NULL;
