-- Personal Dashboard v8 Migration
-- Enables Row Level Security on all tables that were previously unprotected.
-- Run this in the Supabase SQL Editor.
--
-- Tables covered:
--   income_categories, income_daily          (household-scoped, from v5)
--   milestone_types, milestone_entries       (per-user, from v6)
--   training_program_settings                (per-user, from v7)
--   training_workouts                        (per-user, from v7)
--   training_exercises                       (via workout_id join, from v7)
--   training_sets                            (via exercise_id join, from v7)
--
-- SAFE TO RE-RUN: Every statement uses IF NOT EXISTS / IF EXISTS guards.
-- The household tables (households, household_members) and v2/v3 finance
-- tables already have RLS enabled — they are NOT touched here.

-- ============================================================
-- 1. INCOME TABLES (household-scoped)
-- ============================================================

ALTER TABLE income_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_daily ENABLE ROW LEVEL SECURITY;

-- Drop if already exists so this script is idempotent
DROP POLICY IF EXISTS "income_categories_all" ON income_categories;
DROP POLICY IF EXISTS "income_daily_all" ON income_daily;

-- Any household member can read/write income data for their household
CREATE POLICY "income_categories_all" ON income_categories
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "income_daily_all" ON income_daily
  FOR ALL USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. MILESTONE TABLES (per-user)
-- ============================================================

ALTER TABLE milestone_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "milestone_types_all" ON milestone_types;
DROP POLICY IF EXISTS "milestone_entries_all" ON milestone_entries;

CREATE POLICY "milestone_types_all" ON milestone_types
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "milestone_entries_all" ON milestone_entries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. TRAINING TABLES (per-user, with join-based policies for
--    exercises and sets which have no direct user_id column)
-- ============================================================

ALTER TABLE training_program_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_settings_all" ON training_program_settings;
DROP POLICY IF EXISTS "training_workouts_all" ON training_workouts;
DROP POLICY IF EXISTS "training_exercises_all" ON training_exercises;
DROP POLICY IF EXISTS "training_sets_all" ON training_sets;

-- Program settings: one row per user
CREATE POLICY "training_settings_all" ON training_program_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Workouts: direct user_id
CREATE POLICY "training_workouts_all" ON training_workouts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Exercises: look up through workout → user_id
CREATE POLICY "training_exercises_all" ON training_exercises
  FOR ALL USING (
    workout_id IN (
      SELECT id FROM training_workouts WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workout_id IN (
      SELECT id FROM training_workouts WHERE user_id = auth.uid()
    )
  );

-- Sets: look up through exercise → workout → user_id
-- Using a single-level join to keep it fast (no double-nested subquery)
CREATE POLICY "training_sets_all" ON training_sets
  FOR ALL USING (
    exercise_id IN (
      SELECT te.id
      FROM training_exercises te
      INNER JOIN training_workouts tw ON te.workout_id = tw.id
      WHERE tw.user_id = auth.uid()
    )
  )
  WITH CHECK (
    exercise_id IN (
      SELECT te.id
      FROM training_exercises te
      INNER JOIN training_workouts tw ON te.workout_id = tw.id
      WHERE tw.user_id = auth.uid()
    )
  );

-- ============================================================
-- VERIFICATION QUERIES (run after applying to confirm)
-- ============================================================
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- Expected: all tables should show rowsecurity = true
