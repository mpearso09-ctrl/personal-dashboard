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

export interface BudgetWeekly {
  id: string;
  user_id: string;
  week_start: string;
  essentials: number;
  investments: number;
  savings: number;
  debt: number;
  fun: number;
  money_in: number;
  amex_balance: number | null;
  notes: string | null;
  created_at: string;
}

export interface CashflowDaily {
  id: string;
  user_id: string;
  date: string;
  personal_in: number;
  personal_out: number;
  savings_in: number;
  savings_out: number;
  frameworks_in: number;
  frameworks_out: number;
  frameworks_savings_in: number;
  frameworks_savings_out: number;
  notes: string | null;
  created_at: string;
}

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

export interface NetWorthMonthly {
  id: string;
  user_id: string;
  month: string;
  rbc_balance: number;
  triangle_balance: number;
  scotia_visa: number;
  scotia_loc: number;
  td_loan_tesla: number;
  taxes_owed: number;
  cash_investments: number;
  business_assets: number;
  protocase_shares: number;
  vehicle_assets: number;
  created_at: string;
}

export interface Investment {
  id: string;
  user_id: string;
  tier: 'growth_engine' | 'innovation_satellite' | 'stability_liquidity' | 'asymmetric_upside';
  symbol: string;
  current_value_cad: number;
  target_pct: number;
  last_updated: string;
}

export const BUDGET_TARGETS = {
  essentials: { monthly: 5600, weekly: 1400 },
  investments: { monthly: 2800, weekly: 700 },
  savings: { monthly: 700, weekly: 175 },
  debt: { monthly: 3500, weekly: 875 },
  fun: { monthly: 1400, weekly: 350 },
} as const;

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
