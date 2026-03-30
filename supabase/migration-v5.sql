-- Personal Dashboard v5 Migration
-- Adds: Income tracking (categories + daily entries)

-- ============================================================
-- 1. INCOME CATEGORIES (household-scoped)
-- ============================================================
CREATE TABLE income_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(household_id, name)
);

-- ============================================================
-- 2. INCOME DAILY ENTRIES (household-scoped)
-- ============================================================
CREATE TABLE income_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  category_id uuid REFERENCES income_categories(id) ON DELETE CASCADE NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(household_id, date, category_id)
);

-- ============================================================
-- 3. RLS DISABLED (matching current setup)
-- ============================================================
-- RLS is disabled on these tables to match the existing finance table pattern.
-- Access control is handled at the application level via household_id filtering.
