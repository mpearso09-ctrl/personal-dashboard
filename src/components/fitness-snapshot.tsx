'use client';

import Link from 'next/link';
import { UpdatedAgo } from '@/components/updated-ago';
import { workoutSummary, type DayMetrics } from '@/lib/fitness-metrics';
import type { TrainingSession } from '@/lib/types';
import { cn } from '@/lib/utils';

const ROWS: { key: keyof DayMetrics; label: string; digits: number; unit: string }[] = [
  { key: 'steps', label: 'Steps', digits: 0, unit: '' },
  { key: 'sleep_hours', label: 'Sleep', digits: 1, unit: ' h' },
  { key: 'calories_burned', label: 'Calories burned', digits: 0, unit: '' },
  { key: 'resting_heart_rate', label: 'Resting HR', digits: 0, unit: ' bpm' },
  { key: 'weight_lbs', label: 'Weight', digits: 1, unit: ' lbs' },
  { key: 'body_fat_pct', label: 'Body fat', digits: 1, unit: '%' },
];

function fmt(value: number | null, digits: number, unit: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const text = digits === 0 ? Math.round(value).toLocaleString('en-CA') : value.toFixed(digits);
  return `${text}${unit}`;
}

function columnDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function FitnessSnapshot({
  yesterday,
  today,
  yesterdayMetrics,
  todayMetrics,
  workouts,
  onSelectDate,
  tone = 'card',
  updatedAt = null,
}: {
  yesterday: string;
  today: string;
  yesterdayMetrics: DayMetrics;
  todayMetrics: DayMetrics;
  workouts: TrainingSession[];
  onSelectDate?: (date: string) => void;
  tone?: 'card' | 'inset';
  updatedAt?: string | null;
}) {
  const ordered = [...workouts].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const dayHeading = (date: string, label: string) => {
    const inner = (
      <>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-[11px] font-normal text-zinc-500">{columnDate(date)}</span>
      </>
    );
    if (!onSelectDate) return <div className="text-right">{inner}</div>;
    return (
      <button type="button" onClick={() => onSelectDate(date)} className="ml-auto block text-right hover:text-blue-300">
        {inner}
      </button>
    );
  };

  return (
    <div className={cn('rounded-xl border border-zinc-800 p-4', tone === 'inset' ? 'bg-zinc-950' : 'bg-zinc-900')}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Yesterday and today</h2>
          <UpdatedAgo at={updatedAt} />
        </div>
        <Link href="/training" className="text-xs text-blue-400 hover:text-blue-300">Training</Link>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Steps, sleep, calories burned, resting heart rate, weight, and body fat for yesterday and today</caption>
        <thead>
          <tr>
            <th className="pb-2" />
            <th className="pb-2 font-normal">{dayHeading(yesterday, 'Yesterday')}</th>
            <th className="pb-2 pl-3 font-normal">{dayHeading(today, 'Today')}</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-t border-zinc-800/80">
              <th scope="row" className="py-2 text-left text-xs font-normal text-zinc-400">{row.label}</th>
              <td className="py-2 text-right tabular-nums text-white">{fmt(yesterdayMetrics[row.key], row.digits, row.unit)}</td>
              <td className="py-2 pl-3 text-right tabular-nums text-white">{fmt(todayMetrics[row.key], row.digits, row.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Workouts</div>
        {ordered.length === 0 ? (
          <p className="text-xs text-zinc-500">No workouts for yesterday or today.</p>
        ) : ordered.map((session) => (
          <div key={session.id} className="flex items-center gap-2 text-sm bg-zinc-800/60 rounded-lg px-3 py-2">
            <span className="text-zinc-500 w-20 shrink-0">{session.date === today ? 'Today' : 'Yesterday'}</span>
            <span className="text-zinc-200">{workoutSummary(session)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
