import type { FitnessDaily, FitnessGoals } from '@/lib/types';
import { getToday } from '@/lib/utils';
import { Dumbbell, Footprints, Moon, Flame, Beef, Salad, Weight, Percent, Activity, Wine, Beer, Martini, StretchHorizontal, Sunset } from 'lucide-react';

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

export type NumField = keyof Pick<FitnessDaily,
  'weight_lbs' | 'body_fat_pct' | 'visceral_fat_pct' |
  'calories_consumed' | 'protein_g' | 'fiber_g' |
  'steps' | 'sleep_hours' | 'calories_burned'>;
export type BoolField = keyof Pick<FitnessDaily, 'workout' | 'stretching' | 'evening_walk'>;
export type DrinkField = keyof Pick<FitnessDaily, 'drinks_wine' | 'drinks_beer' | 'drinks_spirits'>;

export const BODY_FIELDS: { name: NumField; label: string; unit: string; icon: typeof Weight; goal: keyof FitnessGoals; step: string }[] = [
  { name: 'weight_lbs', label: 'Weight', unit: 'lbs', icon: Weight, goal: 'goal_weight', step: '0.1' },
  { name: 'body_fat_pct', label: 'Body Fat', unit: '%', icon: Percent, goal: 'goal_body_fat', step: '0.1' },
  { name: 'visceral_fat_pct', label: 'Visceral Fat', unit: '%', icon: Activity, goal: 'goal_visceral_fat', step: '0.1' },
];

export const NUTRITION_FIELDS: { name: NumField; label: string; unit: string; icon: typeof Flame; goalMin?: keyof FitnessGoals; goalMax?: keyof FitnessGoals }[] = [
  { name: 'calories_consumed', label: 'Calories', unit: '', icon: Flame, goalMax: 'calories_max' },
  { name: 'protein_g', label: 'Protein', unit: 'g', icon: Beef, goalMin: 'protein_min' },
  { name: 'fiber_g', label: 'Fiber', unit: 'g', icon: Salad, goalMin: 'fiber_min' },
];

export const ACTIVITY_FIELDS: { name: NumField; label: string; unit: string; icon: typeof Footprints; goalMin: keyof FitnessGoals; step: string; cumulative: boolean }[] = [
  { name: 'steps', label: 'Steps', unit: '', icon: Footprints, goalMin: 'steps_min', step: '1', cumulative: true },
  { name: 'sleep_hours', label: 'Sleep', unit: 'h', icon: Moon, goalMin: 'sleep_min', step: '0.25', cumulative: false },
  { name: 'calories_burned', label: 'Burned', unit: '', icon: Activity, goalMin: 'calories_burned_min', step: '1', cumulative: false },
];

export const HABIT_FIELDS: { name: BoolField; label: string; icon: typeof Dumbbell }[] = [
  { name: 'workout', label: 'Workout', icon: Dumbbell },
  { name: 'stretching', label: 'Stretch', icon: StretchHorizontal },
  { name: 'evening_walk', label: 'Evening Walk', icon: Sunset },
];

export const DRINK_FIELDS: { name: DrinkField; label: string; icon: typeof Wine; color: string }[] = [
  { name: 'drinks_wine', label: 'Wine', icon: Wine, color: 'text-rose-400' },
  { name: 'drinks_beer', label: 'Beer', icon: Beer, color: 'text-amber-400' },
  { name: 'drinks_spirits', label: 'Spirits', icon: Martini, color: 'text-sky-400' },
];

export const EMPTY_DAY: Partial<FitnessDaily> = {
  weight_lbs: null, body_fat_pct: null, visceral_fat_pct: null,
  calories_consumed: null, protein_g: null, fiber_g: null,
  steps: null, sleep_hours: null, calories_burned: null,
  workout: false, stretching: false, evening_walk: false,
  drinks_wine: 0, drinks_beer: 0, drinks_spirits: 0,
  notes: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function fmtNum(v: number | null | undefined, unit = '', digits = 0): string {
  if (v === null || v === undefined) return '—';
  const n = digits ? v.toFixed(digits) : Math.round(v).toLocaleString();
  return `${n}${unit}`;
}

export function avg(vals: (number | null | undefined)[]): number | null {
  const xs = vals.filter((v): v is number => v !== null && v !== undefined);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function totalDrinks(d: Partial<FitnessDaily>): number {
  return (d.drinks_wine ?? 0) + (d.drinks_beer ?? 0) + (d.drinks_spirits ?? 0);
}

export function shortDay(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}
export function shortDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Hit / miss / no-data for a metric on a day */
export type Hit = 'hit' | 'miss' | 'none';
export type MetricDef = { key: string; label: string; short: string; test: (d: FitnessDaily, g: FitnessGoals) => Hit };

export const SCORE_METRICS: MetricDef[] = [
  { key: 'cal', label: 'Calories', short: 'Cal', test: (d, g) => d.calories_consumed == null ? 'none' : d.calories_consumed <= g.calories_max ? 'hit' : 'miss' },
  { key: 'pro', label: 'Protein', short: 'Pro', test: (d, g) => d.protein_g == null ? 'none' : d.protein_g >= g.protein_min ? 'hit' : 'miss' },
  { key: 'fib', label: 'Fiber', short: 'Fib', test: (d, g) => d.fiber_g == null ? 'none' : d.fiber_g >= g.fiber_min ? 'hit' : 'miss' },
  { key: 'steps', label: 'Steps', short: 'Steps', test: (d, g) => d.steps == null ? 'none' : d.steps >= g.steps_min ? 'hit' : 'miss' },
  { key: 'sleep', label: 'Sleep', short: 'Sleep', test: (d, g) => d.sleep_hours == null ? 'none' : d.sleep_hours >= g.sleep_min ? 'hit' : 'miss' },
  { key: 'burn', label: 'Cals Burned', short: 'Burn', test: (d, g) => d.calories_burned == null ? 'none' : d.calories_burned >= g.calories_burned_min ? 'hit' : 'miss' },
  { key: 'workout', label: 'Workout', short: 'Lift', test: (d) => d.workout ? 'hit' : 'miss' },
  { key: 'stretch', label: 'Stretching', short: 'Stretch', test: (d) => d.stretching ? 'hit' : 'miss' },
  { key: 'walk', label: 'Evening Walk', short: 'Walk', test: (d) => d.evening_walk ? 'hit' : 'miss' },
  { key: 'dry', label: 'Dry Day', short: 'Dry', test: (d) => totalDrinks(d) === 0 ? 'hit' : 'miss' },
];

export function streak(days: FitnessDaily[], test: (d: FitnessDaily) => boolean): { current: number; best: number } {
  const byDate = new Map(days.map((d) => [d.date, d]));
  let best = 0, run = 0;
  // best: walk ascending over all logged dates
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of sorted) { if (test(d)) { run++; best = Math.max(best, run); } else run = 0; }
  // current: walk back from today, allow today to be unlogged
  let current = 0;
  let cursor = getToday();
  const todayEntry = byDate.get(cursor);
  if (!todayEntry || !test(todayEntry)) cursor = shiftDate(cursor, -1);
  else { current = 1; cursor = shiftDate(cursor, -1); }
  for (let i = 0; i < 400; i++) {
    const e = byDate.get(cursor);
    if (!e || !test(e)) break;
    current++;
    cursor = shiftDate(cursor, -1);
  }
  return { current, best: Math.max(best, current) };
}

export function movingAvg(points: { date: string; v: number }[], window = 7) {
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    return { ...p, ma: slice.reduce((a, b) => a + b.v, 0) / slice.length };
  });
}

