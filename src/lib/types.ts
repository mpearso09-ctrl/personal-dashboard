// ---- Household ----

export interface Household {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string | null;
  finance_role: 'full_access' | 'view_only';
  created_at: string;
}

// ---- Fitness (per-user) ----

export interface FitnessDaily {
  id: string;
  user_id: string;
  date: string;
  calories_consumed: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  steps: number | null;
  sleep_hours: number | null;
  calories_burned: number | null;
  workout: boolean;
  training_quality: number | null;
  mobility: boolean;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  notes: string | null;
  created_at: string;
}

export interface FitnessWeekly {
  id: string;
  user_id: string;
  date: string;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  photo_taken: boolean;
  created_at: string;
}

export interface FitnessGoals {
  id: string;
  user_id: string;
  calories_max: number;
  protein_min: number;
  steps_min: number;
  sleep_min: number;
  calories_burned_min: number;
  carbs_min: number;
  carbs_max: number;
  fat_min: number;
  fat_max: number;
  fiber_min: number;
  fiber_max: number;
  challenge_name: string;
  challenge_start_date: string | null;
  challenge_days: number;
  goal_weight: number;
  goal_body_fat: number;
  updated_at: string;
}

// ---- Budget (household-scoped, dynamic categories) ----

export interface BudgetCategory {
  id: string;
  household_id: string;
  user_id: string;
  name: string;
  /** The entered amount in the given frequency. Use monthlyEquiv() to get the monthly value. */
  monthly_amount: number;
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'annual';
  sort_order: number;
  created_at: string;
}

export interface BudgetDailyEntry {
  id: string;
  household_id: string;
  user_id: string;
  date: string;
  category_id: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

// ---- Cash Flow (household-scoped, dynamic accounts) ----

export interface Account {
  id: string;
  household_id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface AccountBalance {
  id: string;
  household_id: string;
  user_id: string;
  account_id: string;
  date: string;
  balance: number;
  created_at: string;
}

// ---- Net Worth (household-scoped, dynamic items) ----

export interface NetWorthItem {
  id: string;
  household_id: string;
  user_id: string;
  type: 'asset' | 'liability';
  name: string;
  sort_order: number;
  created_at: string;
}

export interface NetWorthEntry {
  id: string;
  household_id: string;
  user_id: string;
  item_id: string;
  month: string;
  value: number;
  created_at: string;
}

// ---- Reimbursements (household-scoped) ----

export interface Reimbursement {
  id: string;
  household_id: string;
  user_id: string;
  date: string;
  amount: number;
  reason: string;
  notes: string | null;
  paid: boolean;
  created_at: string;
}

// ---- Income (household-scoped, dynamic categories) ----

export interface IncomeCategory {
  id: string;
  household_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface IncomeDailyEntry {
  id: string;
  household_id: string;
  date: string;
  category_id: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

// ---- Investments (household-scoped) ----

export interface Investment {
  id: string;
  household_id: string;
  user_id: string;
  tier: 'growth_engine' | 'innovation_satellite' | 'stability_liquidity' | 'asymmetric_upside';
  symbol: string;
  current_value_cad: number;
  target_pct: number;
  last_updated: string;
}

export const TIER_LABELS: Record<Investment['tier'], string> = {
  growth_engine: 'Growth Engine (55%)',
  innovation_satellite: 'Innovation Satellite (15%)',
  stability_liquidity: 'Stability + Liquidity (25%)',
  asymmetric_upside: 'Asymmetric Upside (5%)',
};

export const TIER_TARGETS: Record<Investment['tier'], number> = {
  growth_engine: 0.55,
  innovation_satellite: 0.15,
  stability_liquidity: 0.25,
  asymmetric_upside: 0.05,
};

export const DEFAULT_BUDGET_CATEGORIES = [
  { name: 'Essentials', monthly_amount: 5600 },
  { name: 'Investments', monthly_amount: 2800 },
  { name: 'Savings', monthly_amount: 700 },
  { name: 'Debt', monthly_amount: 3500 },
  { name: 'Fun', monthly_amount: 1400 },
];

export const DEFAULT_ACCOUNTS = [
  'Personal Chequing',
  'Personal Savings',
  'Frameworks Chequing',
  'Frameworks Savings',
  'I-Trade Investments',
  'Crypto/Kraken',
];

export const DEFAULT_NET_WORTH_ASSETS = [
  'Cash + Investments',
  'Business Assets (MMP & Frameworks)',
  'Protocase Shares (110,000 shares)',
  'Vehicles',
];

// ---- Milestones (per-user fitness PRs) ----

export interface MilestoneType {
  id: string;
  user_id: string;
  category: 'weightlifting' | 'cardio' | 'custom';
  name: string;
  unit: 'lbs' | 'seconds' | 'pace';
  is_default: boolean;
  sort_order: number;
  hidden: boolean;
  created_at: string;
}

export interface MilestoneEntry {
  id: string;
  user_id: string;
  milestone_type_id: string;
  rep_max: 1 | 2 | 3 | 4 | 5 | 10 | null;
  value: number;
  date: string;
  notes: string | null;
  is_pr: boolean;
  created_at: string;
}

export const DEFAULT_WEIGHTLIFTING_MILESTONES: { name: string; sort_order: number }[] = [
  { name: 'Bench Press', sort_order: 0 },
  { name: 'Squat', sort_order: 1 },
  { name: 'Deadlift', sort_order: 2 },
  { name: 'Shoulder Press', sort_order: 3 },
  { name: 'Clean', sort_order: 4 },
  { name: 'Power Clean', sort_order: 5 },
  { name: 'Push Press', sort_order: 6 },
  { name: 'Push Jerk', sort_order: 7 },
  { name: 'Snatch', sort_order: 8 },
];

export const DEFAULT_CARDIO_MILESTONES: { name: string; unit: 'seconds' | 'pace'; sort_order: number }[] = [
  { name: 'Plank', unit: 'seconds', sort_order: 0 },
  { name: '1KM Run', unit: 'pace', sort_order: 1 },
  { name: '2KM Run', unit: 'pace', sort_order: 2 },
  { name: '5K Run', unit: 'pace', sort_order: 3 },
  { name: '10KM Run', unit: 'pace', sort_order: 4 },
  { name: '21KM Half Marathon', unit: 'pace', sort_order: 5 },
];

export const REP_MAXES = [1, 2, 3, 4, 5, 10] as const;

// ---- Training Program (per-user) ----

export interface TrainingProgramSettings {
  id: string;
  user_id: string;
  start_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrainingWorkout {
  id: string;
  user_id: string;
  date: string;
  week_number: number;
  day_number: number;
  day_name: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface TrainingExercise {
  id: string;
  workout_id: string;
  exercise_name: string;
  exercise_order: number;
  exercise_type: 'strength' | 'cardio' | 'circuit' | 'amrap' | 'intervals' | 'optional' | 'rest';
}

export interface TrainingSet {
  id: string;
  exercise_id: string;
  set_number: number;
  target_reps: number | null;
  actual_reps: number | null;
  target_weight: number | null;
  actual_weight: number | null;
  time_seconds: number | null;
  distance_meters: number | null;
  notes: string | null;
  is_completed: boolean;
  created_at: string;
}

// Static program definition (hardcoded 8-week HYROX plan)

export type ExerciseType = 'strength' | 'cardio' | 'circuit' | 'amrap' | 'intervals' | 'optional' | 'rest';

export interface ProgramSet {
  targetReps?: number | 'max';
  pctOf1RM?: number;          // e.g. 0.75 = 75%
  perLeg?: boolean;
}

export interface ProgramExercise {
  name: string;
  type: ExerciseType;
  milestoneMatch?: string;    // matches milestone_types.name for auto-PR
  // Phase-differentiated config (weeks 1-4 vs 5-8)
  phase1Sets?: ProgramSet[];
  phase2Sets?: ProgramSet[];
  // Simple (same both phases)
  sets?: ProgramSet[];
  // Timed/cardio
  durationMin?: number;       // minutes
  durationMinMax?: number;    // max minutes for range
  distanceMeters?: number;
  // AMRAP
  amrapMinutes?: number;
  // Intervals
  intervalRounds?: [number, number]; // [min, max]
  intervalDistanceMeters?: number;
  intervalRestSec?: number;
  // Notes
  notes?: string;
}

export interface ProgramDay {
  dayNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name: string;
  focus: string;
  color: string;              // tailwind text color class
  exercises: ProgramExercise[];
}

// The full 8-week program (static)
export const PROGRAM: ProgramDay[] = [
  {
    dayNumber: 1,
    name: 'Day 1',
    focus: 'Lower Body',
    color: 'text-blue-400',
    exercises: [
      {
        name: 'Back Squat',
        type: 'strength',
        milestoneMatch: 'Squat',
        phase1Sets: [
          { targetReps: 5, pctOf1RM: 0.75 },
          { targetReps: 5, pctOf1RM: 0.75 },
          { targetReps: 5, pctOf1RM: 0.75 },
          { targetReps: 5, pctOf1RM: 0.75 },
          { targetReps: 5, pctOf1RM: 0.75 },
        ],
        phase2Sets: [
          { targetReps: 4, pctOf1RM: 0.825 },
          { targetReps: 4, pctOf1RM: 0.825 },
          { targetReps: 4, pctOf1RM: 0.825 },
          { targetReps: 4, pctOf1RM: 0.825 },
        ],
      },
      {
        name: 'Romanian Deadlift',
        type: 'strength',
        milestoneMatch: 'Deadlift',
        sets: [
          { targetReps: 8 }, { targetReps: 8 }, { targetReps: 8 }, { targetReps: 8 },
        ],
      },
      {
        name: 'Walking Lunges',
        type: 'strength',
        sets: [
          { targetReps: 12, perLeg: true },
          { targetReps: 12, perLeg: true },
          { targetReps: 12, perLeg: true },
        ],
      },
      {
        name: 'Box Jumps',
        type: 'strength',
        sets: [
          { targetReps: 5 }, { targetReps: 5 }, { targetReps: 5 }, { targetReps: 5 },
        ],
      },
      {
        name: 'Finisher (AMRAP)',
        type: 'amrap',
        amrapMinutes: 10,
        notes: '10 cal row → 10 air squats → 10 sit-ups',
      },
    ],
  },
  {
    dayNumber: 2,
    name: 'Day 2',
    focus: 'Upper + HYROX',
    color: 'text-purple-400',
    exercises: [
      {
        name: 'Bench Press',
        type: 'strength',
        milestoneMatch: 'Bench Press',
        sets: [
          { targetReps: 5 }, { targetReps: 5 }, { targetReps: 5 }, { targetReps: 5 }, { targetReps: 5 },
        ],
      },
      {
        name: 'Pull-ups',
        type: 'strength',
        sets: [
          { targetReps: 'max' }, { targetReps: 'max' }, { targetReps: 'max' }, { targetReps: 'max' },
        ],
      },
      {
        name: 'Shoulder Press',
        type: 'strength',
        milestoneMatch: 'Shoulder Press',
        sets: [
          { targetReps: 6 }, { targetReps: 6 }, { targetReps: 6 }, { targetReps: 6 },
        ],
      },
      {
        name: 'DB Rows',
        type: 'strength',
        sets: [
          { targetReps: 10 }, { targetReps: 10 }, { targetReps: 10 },
        ],
      },
      {
        name: 'HYROX Circuit',
        type: 'circuit',
        notes: '3-4 rounds: 500m Ski Erg → 20 Push-ups → 20 Wall Balls / DB Thrusters → 20 Walking Lunges',
      },
    ],
  },
  {
    dayNumber: 3,
    name: 'Day 3',
    focus: 'Zone 2 + Core',
    color: 'text-emerald-400',
    exercises: [
      {
        name: 'Zone 2 Run',
        type: 'cardio',
        durationMin: 45,
        durationMinMax: 60,
        notes: 'Steady easy pace — conversational effort',
      },
      {
        name: 'Core Circuit',
        type: 'circuit',
        notes: '3-4 rounds: Plank (max hold) → 15 Hanging Knee Raises → 20 Russian Twists',
      },
    ],
  },
  {
    dayNumber: 4,
    name: 'Day 4',
    focus: 'Power + Intervals',
    color: 'text-orange-400',
    exercises: [
      {
        name: 'Power Cleans',
        type: 'strength',
        milestoneMatch: 'Power Clean',
        sets: [
          { targetReps: 3 }, { targetReps: 3 }, { targetReps: 3 }, { targetReps: 3 }, { targetReps: 3 },
        ],
      },
      {
        name: 'Deadlift',
        type: 'strength',
        milestoneMatch: 'Deadlift',
        sets: [
          { targetReps: 5, pctOf1RM: 0.75 },
          { targetReps: 5, pctOf1RM: 0.75 },
          { targetReps: 5, pctOf1RM: 0.75 },
          { targetReps: 5, pctOf1RM: 0.75 },
        ],
      },
      {
        name: 'Push Press',
        type: 'strength',
        milestoneMatch: 'Push Press',
        sets: [
          { targetReps: 5 }, { targetReps: 5 }, { targetReps: 5 }, { targetReps: 5 },
        ],
      },
      {
        name: 'Box Step-ups (weighted)',
        type: 'strength',
        sets: [
          { targetReps: 12, perLeg: true },
          { targetReps: 12, perLeg: true },
          { targetReps: 12, perLeg: true },
        ],
      },
      {
        name: '400m Run Intervals',
        type: 'intervals',
        intervalRounds: [6, 8],
        intervalDistanceMeters: 400,
        intervalRestSec: 90,
        notes: '6-8 rounds, 90 sec rest between each',
      },
    ],
  },
  {
    dayNumber: 5,
    name: 'Day 5',
    focus: 'HYROX Simulation',
    color: 'text-red-400',
    exercises: [
      { name: 'HYROX Simulation (Full)', type: 'cardio',
        notes: '1KM Run → 1KM Ski Erg → 1KM Run → 50 DB Lunges → 1KM Run → 50 Burpee Broad Jumps → 1KM Run → 1KM Row. Track TOTAL TIME.',
      },
    ],
  },
  {
    dayNumber: 6,
    name: 'Day 6',
    focus: 'Optional',
    color: 'text-zinc-400',
    exercises: [
      {
        name: 'Option A: Long Run',
        type: 'optional',
        durationMin: 60,
        durationMinMax: 75,
        notes: 'Easy pace, track time and distance',
      },
      {
        name: 'Option B: Bodyweight Conditioning',
        type: 'optional',
        notes: '5 rounds: 20 Push-ups → 20 Air Squats → 10 Pull-ups → 400m Run',
      },
    ],
  },
  {
    dayNumber: 7,
    name: 'Day 7',
    focus: 'Rest & Recovery',
    color: 'text-zinc-500',
    exercises: [
      {
        name: 'Rest Day',
        type: 'rest',
        notes: 'Walk / Mobility / Stretch. No structured training.',
      },
    ],
  },
];

export const DEFAULT_INCOME_CATEGORIES = [
  'Protocase Salary',
  'Frameworks Revenue',
  'MMP Revenue',
  'Reimbursements',
  'Other',
];

// ---- Reports ----

export interface ReportMonthlyTrend {
  month: string;  // "YYYY-MM"
  label: string;  // "May '26"
  income: number;
  spending: number;
  netIncome: number;
  netWorth: number;
  totalDebt: number;
  totalCash: number;
  spendingByCategory: { name: string; amount: number }[];
}

export interface ReportData {
  month: string; // "YYYY-MM"
  generatedAt: string;
  isPartial: boolean;
  // Section 1 — Bottom Line
  incomeTotal: number;
  spendingTotal: number;
  netIncome: number;
  netWorthCurrent: number;
  netWorthPrevMonth: number;
  netWorthChange: number;
  // Section 2 — Breakdown
  incomeBreakdown: { name: string; amount: number }[];
  spendingBreakdown: { name: string; budgeted: number; actual: number; variance: number }[];
  // Section 4 — Assets & Liabilities
  assets: { name: string; prev: number; current: number; change: number }[];
  liabilities: { name: string; prev: number; current: number; change: number }[];
  // Section 5 — Cash
  cashAccounts: { name: string; balance: number; prevBalance: number }[];
  // Section 6 — Trends
  monthlyTrends: ReportMonthlyTrend[];
}

export interface MonthlyReport {
  id: string;
  household_id: string;
  month: string; // YYYY-MM-01
  report_data: ReportData;
  status: 'draft' | 'ready' | 'sent';
  is_partial: boolean;
  generated_at: string;
  sent_at: string | null;
  created_at: string;
}

export interface ReportRecipient {
  id: string;
  household_id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export const DEFAULT_NET_WORTH_LIABILITIES = [
  'RBC Credit Card',
  'Triangle Credit Card',
  'Scotia Visa',
  'Scotia LOC',
  'TD Loan (Tesla)',
  'CRA Taxes Owed',
];
