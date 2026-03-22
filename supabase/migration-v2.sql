-- Personal Dashboard v2 Migration
-- Run this AFTER the initial migration.sql
-- Adds: dynamic budget categories, balance-based cash flow, dynamic net worth, daily weigh-ins

-- ============================================================
-- 1. FITNESS: Add weight/body fat to daily entries
-- ============================================================
ALTER TABLE fitness_daily ADD COLUMN weight_lbs numeric(5,1);
ALTER TABLE fitness_daily ADD COLUMN body_fat_pct numeric(4,1);

-- ============================================================
-- 2. BUDGET: Dynamic categories + daily spending
-- ============================================================

-- Budget categories (user-defined)
CREATE TABLE budget_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  monthly_amount numeric(10,2) NOT NULL DEFAULT 0,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Daily budget entries (one row per category per day)
CREATE TABLE budget_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  category_id uuid REFERENCES budget_categories(id) ON DELETE CASCADE NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date, category_id)
);

-- ============================================================
-- 3. CASH FLOW: Dynamic accounts + daily balances
-- ============================================================

-- User-defined accounts
CREATE TABLE accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Daily balance snapshots (one row per account per day)
CREATE TABLE account_balances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, account_id, date)
);

-- ============================================================
-- 4. NET WORTH: Dynamic items + monthly values
-- ============================================================

-- Net worth line items (assets and liabilities)
CREATE TABLE net_worth_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  type text NOT NULL CHECK (type IN ('asset', 'liability')),
  name text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Monthly values for each net worth item
CREATE TABLE net_worth_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  item_id uuid REFERENCES net_worth_items(id) ON DELETE CASCADE NOT NULL,
  month date NOT NULL,
  value numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id, month)
);

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own data" ON budget_categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON budget_daily FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON account_balances FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON net_worth_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON net_worth_entries FOR ALL USING (auth.uid() = user_id);
