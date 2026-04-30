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
  monthly_amount: number;
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

export const DEFAULT_INCOME_CATEGORIES = [
  'Protocase Salary',
  'Frameworks Revenue',
  'MMP Revenue',
  'Reimbursements',
  'Other',
];

export const DEFAULT_NET_WORTH_LIABILITIES = [
  'RBC Credit Card',
  'Triangle Credit Card',
  'Scotia Visa',
  'Scotia LOC',
  'TD Loan (Tesla)',
  'CRA Taxes Owed',
];
