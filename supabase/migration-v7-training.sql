-- Personal Dashboard v7 Migration
-- Adds: HYROX Hybrid Training program tracker
-- All tables are per-user (fitness data, not household-shared)

-- ============================================================
-- 1. PROGRAM SETTINGS
-- ============================================================
CREATE TABLE training_program_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  start_date date NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. COMPLETED WORKOUTS (one row per day logged)
-- ============================================================
CREATE TABLE training_workouts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  week_number int NOT NULL CHECK (week_number BETWEEN 1 AND 8),
  day_number int NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  day_name text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- ============================================================
-- 3. EXERCISES WITHIN A WORKOUT
-- ============================================================
CREATE TABLE training_exercises (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_id uuid REFERENCES training_workouts(id) ON DELETE CASCADE NOT NULL,
  exercise_name text NOT NULL,
  exercise_order int NOT NULL,
  exercise_type text NOT NULL CHECK (exercise_type IN ('strength', 'cardio', 'circuit', 'amrap', 'intervals', 'optional', 'rest'))
);

-- ============================================================
-- 4. SETS / REPS / TIMES (one row per set or interval round)
-- ============================================================
CREATE TABLE training_sets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  exercise_id uuid REFERENCES training_exercises(id) ON DELETE CASCADE NOT NULL,
  set_number int NOT NULL,
  target_reps int,
  actual_reps int,
  target_weight numeric(6,1),
  actual_weight numeric(6,1),
  time_seconds int,
  distance_meters int,
  notes text,
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 5. INDEXES
-- ============================================================
CREATE INDEX training_workouts_user_date ON training_workouts(user_id, date DESC);
CREATE INDEX training_exercises_workout ON training_exercises(workout_id, exercise_order);
CREATE INDEX training_sets_exercise ON training_sets(exercise_id, set_number);

-- ============================================================
-- 6. RLS DISABLED (matching current setup)
-- ============================================================
-- Access controlled at application level via user_id filtering.
