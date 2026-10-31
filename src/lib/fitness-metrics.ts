import type { FitnessDaily, TrainingSession } from '@/lib/types';
import { toNumber } from '@/lib/utils';

const DAILY_NUMBER_KEYS = [
  'calories_consumed',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'steps',
  'sleep_hours',
  'calories_burned',
  'weight_lbs',
  'body_fat_pct',
  'visceral_fat_pct',
  'resting_heart_rate',
  'training_quality',
] as const;

/**
 * Postgres `numeric` columns arrive as strings. Adding those strings
 * produces NaN averages, and calling toFixed on them crashes a tab.
 */
export function coerceFitnessDaily(row: FitnessDaily): FitnessDaily {
  const next: FitnessDaily = { ...row };
  for (const key of DAILY_NUMBER_KEYS) {
    if (row[key] == null) continue;
    (next as unknown as Record<string, unknown>)[key] = toNumber(row[key]);
  }
  return next;
}

const SESSION_NUMBER_KEYS = ['duration_min', 'distance_km', 'avg_hr', 'max_hr', 'rpe', 'rounds', 'work_sec', 'rest_sec'] as const;

export function coerceSession(row: TrainingSession): TrainingSession {
  const next: TrainingSession = { ...row };
  for (const key of SESSION_NUMBER_KEYS) {
    if (row[key] == null) continue;
    (next as unknown as Record<string, unknown>)[key] = toNumber(row[key]);
  }
  return next;
}

export type DayMetrics = {
  steps: number | null;
  sleep_hours: number | null;
  calories_burned: number | null;
  resting_heart_rate: number | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
};

export function metricsOf(row: Partial<FitnessDaily> | null | undefined): DayMetrics {
  return {
    steps: toNumber(row?.steps),
    sleep_hours: toNumber(row?.sleep_hours),
    calories_burned: toNumber(row?.calories_burned),
    resting_heart_rate: toNumber(row?.resting_heart_rate),
    weight_lbs: toNumber(row?.weight_lbs),
    body_fat_pct: toNumber(row?.body_fat_pct),
  };
}

const TYPE_LABEL: Record<string, string> = {
  run: 'Run',
  crossfit: 'CrossFit',
  gym: 'Gym',
  walk: 'Walk',
  hyrox: 'HYROX',
};

export function workoutSummary(session: Pick<TrainingSession, 'type' | 'subtype' | 'duration_min' | 'distance_km' | 'avg_hr' | 'notes' | 'source'>): string {
  const bits = [TYPE_LABEL[session.type] ?? session.type];
  const distance = toNumber(session.distance_km);
  const minutes = toNumber(session.duration_min);
  const heart = toNumber(session.avg_hr);
  if (distance != null && distance > 0) bits.push(`${distance} km`);
  if (minutes != null && minutes > 0) {
    const total = Math.round(minutes);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    bits.push(hours ? `${hours}h ${mins}m` : `${mins} min`);
  }
  if (heart != null && heart > 0) bits.push(`${Math.round(heart)} bpm`);
  const title = session.notes?.replace(/^Fitbit · /, '').trim();
  if (title && title.toLowerCase() !== bits[0].toLowerCase()) bits.push(title);
  if (session.source === 'google_health') bits.push('Fitbit');
  return bits.join(' · ');
}
