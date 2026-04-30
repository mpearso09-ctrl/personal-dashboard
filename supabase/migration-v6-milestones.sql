-- Personal Dashboard v6 Migration
-- Adds: Fitness milestones (weightlifting PRs + cardio records)
-- Fitness data is per-user (not household-scoped)

-- ============================================================
-- 1. MILESTONE TYPES (per user)
-- ============================================================
CREATE TABLE milestone_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  category text NOT NULL CHECK (category IN ('weightlifting', 'cardio', 'custom')),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'lbs', -- 'lbs', 'seconds', 'pace' (mm:ss or hh:mm:ss)
  is_default boolean DEFAULT false,
  sort_order int DEFAULT 0,
  hidden boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- ============================================================
-- 2. MILESTONE ENTRIES (per user)
-- ============================================================
CREATE TABLE milestone_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  milestone_type_id uuid REFERENCES milestone_types(id) ON DELETE CASCADE NOT NULL,
  rep_max int CHECK (rep_max IN (1, 2, 3, 4, 5, 10)), -- NULL for cardio milestones
  value numeric(10,2) NOT NULL,                        -- weight in lbs, seconds, or pace in seconds
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  is_pr boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX milestone_entries_type_date ON milestone_entries(milestone_type_id, date DESC);
CREATE INDEX milestone_entries_user ON milestone_entries(user_id);

-- ============================================================
-- 3. RLS DISABLED (matching current setup)
-- ============================================================
-- Access is controlled at application level via user_id filtering.
