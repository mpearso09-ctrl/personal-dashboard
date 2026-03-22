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

// ---- Budget (dynamic categories) ----

export interface BudgetCategory {
  id: string;
  user_id: string;
  name: string;
  monthly_amount: number;
  sort_order: number;
  created_at: string;
}

export interface BudgetDailyEntry {
  id: string;
  user_id: string;
  date: string;
  category_id: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

// ---- Cash Flow (dynamic accounts, daily balances) ----

export interface Account {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface AccountBalance {
  id: string;
  user_id: string;
  account_id: string;
  date: string;
  balance: number;
  created_at: string;
}

// ---- Net Worth (dynamic items) ----

export interface NetWorthItem {
  id: string;
  user_id: string;
  type: 'asset' | 'liability';
  name: string;
  sort_order: number;
  created_at: string;
}

export interface NetWorthEntry {
  id: string;
  user_id: string;
  item_id: string;
  month: string;
  value: number;
  created_at: string;
}

// ---- Reimbursements (unchanged) ----

export interface Reimbursement {
  id: string;
  user_id: string;
  date: string;
  amount: number;
  reason: string;
  notes: string | null;
  paid: boolean;
  created_at: string;
}

// ---- Investments (unchanged) ----

export interface Investment {
  id: string;
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

// Default budget categories to seed for new users
export const DEFAULT_BUDGET_CATEGORIES = [
  { name: 'Essentials', monthly_amount: 5600 },
  { name: 'Investments', monthly_amount: 2800 },
  { name: 'Savings', monthly_amount: 700 },
  { name: 'Debt', monthly_amount: 3500 },
  { name: 'Fun', monthly_amount: 1400 },
];

// Default accounts to seed for new users
export const DEFAULT_ACCOUNTS = [
  'Personal Chequing',
  'Personal Savings',
  'Frameworks Chequing',
  'Frameworks Savings',
  'I-Trade Investments',
  'Crypto/Kraken',
];

// Default net worth items to seed for new users
export const DEFAULT_NET_WORTH_ASSETS = [
  'Cash + Investments',
  'Business Assets (MMP & Frameworks)',
  'Protocase Shares (110,000 shares)',
  'Vehicles',
];

export const DEFAULT_NET_WORTH_LIABILITIES = [
  'RBC Credit Card',
  'Triangle Credit Card',
  'Scotia Visa',
  'Scotia LOC',
  'TD Loan (Tesla)',
  'CRA Taxes Owed',
];
