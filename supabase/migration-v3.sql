-- Personal Dashboard v3 Migration
-- Run this AFTER migration-v2.sql
-- Adds: household model for shared finances, cross-user fitness viewing

-- ============================================================
-- 1. HOUSEHOLDS
-- ============================================================

CREATE TABLE households (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT 'My Household',
  owner_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE household_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  finance_role text NOT NULL DEFAULT 'full_access' CHECK (finance_role IN ('full_access', 'view_only')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(household_id, user_id)
);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Users can see households they belong to
CREATE POLICY "Members see own household" ON households FOR ALL USING (
  id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- Users can see members of their household
CREATE POLICY "Members see household members" ON household_members FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- ============================================================
-- 2. ADD household_id TO FINANCE TABLES
-- ============================================================

ALTER TABLE budget_categories ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE budget_daily ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE accounts ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE account_balances ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE net_worth_items ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE net_worth_entries ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE investments ADD COLUMN household_id uuid REFERENCES households(id);
ALTER TABLE reimbursements ADD COLUMN household_id uuid REFERENCES households(id);

-- ============================================================
-- 3. UPDATE RLS POLICIES FOR FINANCE TABLES
-- ============================================================

-- Drop old user_id-based policies
DROP POLICY IF EXISTS "Users see own data" ON budget_categories;
DROP POLICY IF EXISTS "Users see own data" ON budget_daily;
DROP POLICY IF EXISTS "Users see own data" ON accounts;
DROP POLICY IF EXISTS "Users see own data" ON account_balances;
DROP POLICY IF EXISTS "Users see own data" ON net_worth_items;
DROP POLICY IF EXISTS "Users see own data" ON net_worth_entries;
DROP POLICY IF EXISTS "Users see own data" ON investments;
DROP POLICY IF EXISTS "Users see own data" ON reimbursements;

-- New policies: users see finance data for their household
-- SELECT: all household members can view
CREATE POLICY "Household members can view" ON budget_categories FOR SELECT USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
CREATE POLICY "Household members can view" ON budget_daily FOR SELECT USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
CREATE POLICY "Household members can view" ON accounts FOR SELECT USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
CREATE POLICY "Household members can view" ON account_balances FOR SELECT USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
CREATE POLICY "Household members can view" ON net_worth_items FOR SELECT USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
CREATE POLICY "Household members can view" ON net_worth_entries FOR SELECT USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
CREATE POLICY "Household members can view" ON investments FOR SELECT USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
CREATE POLICY "Household members can view" ON reimbursements FOR SELECT USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- INSERT/UPDATE/DELETE: only full_access members
CREATE POLICY "Full access members can modify" ON budget_categories FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can update" ON budget_categories FOR UPDATE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can delete" ON budget_categories FOR DELETE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);

CREATE POLICY "Full access members can modify" ON budget_daily FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can update" ON budget_daily FOR UPDATE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can delete" ON budget_daily FOR DELETE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);

CREATE POLICY "Full access members can modify" ON accounts FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can update" ON accounts FOR UPDATE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can delete" ON accounts FOR DELETE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);

CREATE POLICY "Full access members can modify" ON account_balances FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can update" ON account_balances FOR UPDATE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can delete" ON account_balances FOR DELETE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);

CREATE POLICY "Full access members can modify" ON net_worth_items FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can update" ON net_worth_items FOR UPDATE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can delete" ON net_worth_items FOR DELETE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);

CREATE POLICY "Full access members can modify" ON net_worth_entries FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can update" ON net_worth_entries FOR UPDATE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can delete" ON net_worth_entries FOR DELETE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);

CREATE POLICY "Full access members can modify" ON investments FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can update" ON investments FOR UPDATE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can delete" ON investments FOR DELETE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);

CREATE POLICY "Full access members can modify" ON reimbursements FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can update" ON reimbursements FOR UPDATE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);
CREATE POLICY "Full access members can delete" ON reimbursements FOR DELETE USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND finance_role = 'full_access')
);

-- ============================================================
-- 4. FITNESS: Allow viewing other household members' data
-- ============================================================

-- Drop old fitness policies
DROP POLICY IF EXISTS "Users see own data" ON fitness_daily;
DROP POLICY IF EXISTS "Users see own data" ON fitness_weekly;
DROP POLICY IF EXISTS "Users see own data" ON fitness_goals;

-- Fitness: can view data of any household member, but only modify your own
CREATE POLICY "View household fitness" ON fitness_daily FOR SELECT USING (
  user_id = auth.uid() OR user_id IN (
    SELECT hm2.user_id FROM household_members hm1
    JOIN household_members hm2 ON hm1.household_id = hm2.household_id
    WHERE hm1.user_id = auth.uid()
  )
);
CREATE POLICY "Modify own fitness" ON fitness_daily FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own fitness" ON fitness_daily FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Delete own fitness" ON fitness_daily FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "View household fitness" ON fitness_weekly FOR SELECT USING (
  user_id = auth.uid() OR user_id IN (
    SELECT hm2.user_id FROM household_members hm1
    JOIN household_members hm2 ON hm1.household_id = hm2.household_id
    WHERE hm1.user_id = auth.uid()
  )
);
CREATE POLICY "Modify own fitness" ON fitness_weekly FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own fitness" ON fitness_weekly FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Delete own fitness" ON fitness_weekly FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "View household fitness" ON fitness_goals FOR SELECT USING (
  user_id = auth.uid() OR user_id IN (
    SELECT hm2.user_id FROM household_members hm1
    JOIN household_members hm2 ON hm1.household_id = hm2.household_id
    WHERE hm1.user_id = auth.uid()
  )
);
CREATE POLICY "Modify own fitness" ON fitness_goals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own fitness" ON fitness_goals FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Delete own fitness" ON fitness_goals FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- 5. UPDATE UNIQUE CONSTRAINTS FOR HOUSEHOLD-BASED TABLES
-- ============================================================

-- Budget categories: unique per household instead of per user
ALTER TABLE budget_categories DROP CONSTRAINT IF EXISTS budget_categories_user_id_name_key;
ALTER TABLE budget_categories ADD CONSTRAINT budget_categories_household_name_key UNIQUE(household_id, name);

-- Budget daily: unique per household+date+category
ALTER TABLE budget_daily DROP CONSTRAINT IF EXISTS budget_daily_user_id_date_category_id_key;
ALTER TABLE budget_daily ADD CONSTRAINT budget_daily_household_date_category_key UNIQUE(household_id, date, category_id);

-- Accounts: unique per household
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_name_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_household_name_key UNIQUE(household_id, name);

-- Account balances: unique per household+account+date
ALTER TABLE account_balances DROP CONSTRAINT IF EXISTS account_balances_user_id_account_id_date_key;
ALTER TABLE account_balances ADD CONSTRAINT account_balances_household_account_date_key UNIQUE(household_id, account_id, date);

-- Net worth items: unique per household
ALTER TABLE net_worth_items DROP CONSTRAINT IF EXISTS net_worth_items_user_id_name_key;
ALTER TABLE net_worth_items ADD CONSTRAINT net_worth_items_household_name_key UNIQUE(household_id, name);

-- Net worth entries: unique per household+item+month
ALTER TABLE net_worth_entries DROP CONSTRAINT IF EXISTS net_worth_entries_user_id_item_id_month_key;
ALTER TABLE net_worth_entries ADD CONSTRAINT net_worth_entries_household_item_month_key UNIQUE(household_id, item_id, month);

-- Investments: unique per household+symbol
ALTER TABLE investments DROP CONSTRAINT IF EXISTS investments_user_id_symbol_key;
ALTER TABLE investments ADD CONSTRAINT investments_household_symbol_key UNIQUE(household_id, symbol);
