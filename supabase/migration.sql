-- Personal Dashboard - Supabase Migration
-- Run this SQL in your Supabase SQL Editor to create all tables

-- Fitness daily entries
CREATE TABLE fitness_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  date date NOT NULL,
  calories_consumed int,
  protein_g numeric(5,1),
  carbs_g numeric(5,1),
  fat_g numeric(5,1),
  fiber_g numeric(5,1),
  steps int,
  sleep_hours numeric(3,1),
  calories_burned int,
  workout boolean DEFAULT false,
  training_quality int CHECK (training_quality BETWEEN 1 AND 10),
  mobility boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Fitness weekly weigh-ins
CREATE TABLE fitness_weekly (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  date date NOT NULL,
  weight_lbs numeric(5,1),
  body_fat_pct numeric(4,1),
  photo_taken boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Fitness goals/targets
CREATE TABLE fitness_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  calories_max int DEFAULT 2100,
  protein_min int DEFAULT 180,
  steps_min int DEFAULT 10000,
  sleep_min numeric(3,1) DEFAULT 7.0,
  calories_burned_min int DEFAULT 3000,
  carbs_min int DEFAULT 125,
  carbs_max int DEFAULT 165,
  fat_min int DEFAULT 55,
  fat_max int DEFAULT 80,
  fiber_min int DEFAULT 30,
  fiber_max int DEFAULT 55,
  challenge_name text DEFAULT 'Iron69',
  challenge_start_date date,
  challenge_days int DEFAULT 69,
  goal_weight numeric(5,1) DEFAULT 170,
  goal_body_fat numeric(4,1) DEFAULT 12,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Weekly budget entries
CREATE TABLE budget_weekly (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  week_start date NOT NULL,
  essentials numeric(10,2) DEFAULT 0,
  investments numeric(10,2) DEFAULT 0,
  savings numeric(10,2) DEFAULT 0,
  debt numeric(10,2) DEFAULT 0,
  fun numeric(10,2) DEFAULT 0,
  money_in numeric(10,2) DEFAULT 0,
  amex_balance numeric(10,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start)
);

-- Daily cash flow
CREATE TABLE cashflow_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  date date NOT NULL,
  personal_in numeric(10,2) DEFAULT 0,
  personal_out numeric(10,2) DEFAULT 0,
  savings_in numeric(10,2) DEFAULT 0,
  savings_out numeric(10,2) DEFAULT 0,
  frameworks_in numeric(10,2) DEFAULT 0,
  frameworks_out numeric(10,2) DEFAULT 0,
  frameworks_savings_in numeric(10,2) DEFAULT 0,
  frameworks_savings_out numeric(10,2) DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Reimbursements
CREATE TABLE reimbursements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  date date NOT NULL,
  amount numeric(10,2) NOT NULL,
  reason text NOT NULL,
  notes text,
  paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Net worth monthly snapshots
CREATE TABLE net_worth_monthly (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  month date NOT NULL,
  -- Liabilities
  rbc_balance numeric(10,2) DEFAULT 0,
  triangle_balance numeric(10,2) DEFAULT 0,
  scotia_visa numeric(10,2) DEFAULT 0,
  scotia_loc numeric(10,2) DEFAULT 0,
  td_loan_tesla numeric(10,2) DEFAULT 0,
  taxes_owed numeric(10,2) DEFAULT 0,
  -- Assets
  cash_investments numeric(12,2) DEFAULT 0,
  business_assets numeric(12,2) DEFAULT 0,
  protocase_shares numeric(12,2) DEFAULT 0,
  vehicle_assets numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, month)
);

-- Investment holdings
CREATE TABLE investments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  tier text NOT NULL,
  symbol text NOT NULL,
  current_value_cad numeric(12,2) DEFAULT 0,
  target_pct numeric(5,4),
  last_updated timestamptz DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- Enable Row Level Security on all tables
ALTER TABLE fitness_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only see/edit their own data
CREATE POLICY "Users see own data" ON fitness_daily FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON fitness_weekly FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON fitness_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON budget_weekly FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON cashflow_daily FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON reimbursements FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON net_worth_monthly FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own data" ON investments FOR ALL USING (auth.uid() = user_id);
