import type { SessionType } from '@/lib/types';

export type ReportMetrics = {
  steps: number | null;
  sleep_hours: number | null;
  calories_burned: number | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  resting_heart_rate: number | null;
};

export type ReportWorkout = {
  type: string;
  duration_min: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  notes: string | null;
  source: string | null;
};

type MetricKey = keyof ReportMetrics;

const METRICS: { key: MetricKey; label: string; digits: number; unit: string; goodDown: boolean }[] = [
  { key: 'steps', label: 'Steps', digits: 0, unit: '', goodDown: false },
  { key: 'sleep_hours', label: 'Sleep', digits: 1, unit: ' h', goodDown: false },
  { key: 'calories_burned', label: 'Calories burned', digits: 0, unit: '', goodDown: false },
  { key: 'weight_lbs', label: 'Weight', digits: 1, unit: ' lbs', goodDown: true },
  { key: 'body_fat_pct', label: 'Body fat', digits: 1, unit: '%', goodDown: true },
  { key: 'resting_heart_rate', label: 'Resting heart rate', digits: 0, unit: ' bpm', goodDown: true },
];

const TYPE_LABEL: Record<SessionType, string> = {
  run: 'Run',
  crossfit: 'CrossFit',
  gym: 'Gym',
  walk: 'Walk',
  hyrox: 'HYROX',
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(value: number | null, digits: number, unit: string): string {
  if (value == null) return '—';
  const text = digits === 0 ? Math.round(value).toLocaleString('en-CA') : value.toFixed(digits);
  return `${text}${unit}`;
}

function average(values: (number | null)[]): { avg: number | null; count: number } {
  const present = values.filter((value): value is number => value != null);
  if (!present.length) return { avg: null, count: 0 };
  return { avg: present.reduce((sum, value) => sum + value, 0) / present.length, count: present.length };
}

function longDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function workoutLine(workout: ReportWorkout): string {
  const label = TYPE_LABEL[workout.type as SessionType] ?? workout.type;
  const bits = [label];
  if (workout.distance_km != null) bits.push(`${workout.distance_km} km`);
  if (workout.duration_min != null) {
    const total = Math.round(workout.duration_min);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    bits.push(hours ? `${hours}h ${minutes}m` : `${minutes} min`);
  }
  if (workout.avg_hr != null) bits.push(`${Math.round(workout.avg_hr)} bpm`);
  const title = workout.notes?.replace(/^Fitbit · /, '');
  if (title && title !== label) bits.push(title);
  if (workout.source === 'google_health') bits.push('Fitbit');
  return bits.join(' · ');
}

export function buildFitbitReportHtml(input: {
  yesterday: string;
  today: string;
  yesterdayMetrics: ReportMetrics;
  prior: ReportMetrics[];
  workouts: ReportWorkout[];
  todayWorkouts: ReportWorkout[];
  todayMetrics: ReportMetrics;
  skipped: string[];
  warning?: string | null;
}): string {
  const rows = METRICS.map((metric) => {
    const value = input.yesterdayMetrics[metric.key];
    const prior = average(input.prior.map((day) => day[metric.key]));
    const delta = value != null && prior.avg != null ? value - prior.avg : null;
    const good = delta == null ? null : metric.goodDown ? delta <= 0 : delta >= 0;
    const color = delta == null ? '#a1a1aa' : good ? '#10b981' : '#f59e0b';
    const deltaText = delta == null
      ? '—'
      : `${delta > 0 ? '+' : ''}${metric.digits ? delta.toFixed(metric.digits) : Math.round(delta).toLocaleString('en-CA')}${metric.unit}`;
    const priorText = prior.avg == null
      ? 'no prior days'
      : `avg ${fmt(prior.avg, metric.digits, metric.unit)} over ${prior.count} day${prior.count === 1 ? '' : 's'}`;
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #27272a;color:#e4e4e7;">${metric.label}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #27272a;text-align:right;font-weight:700;color:#fff;">${fmt(value, metric.digits, metric.unit)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #27272a;text-align:right;color:${color};">${deltaText}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #27272a;text-align:right;color:#71717a;font-size:12px;">${priorText}</td>
    </tr>`;
  }).join('');

  const workoutBlock = (items: ReportWorkout[], empty: string) =>
    items.length
      ? `<ul style="margin:0;padding-left:18px;color:#e4e4e7;">${items.map((item) => `<li style="margin:4px 0;">${esc(workoutLine(item))}</li>`).join('')}</ul>`
      : `<div style="color:#71717a;">${empty}</div>`;

  const todayBits = METRICS
    .map((metric) => {
      const value = input.todayMetrics[metric.key];
      if (value == null) return null;
      return `${metric.label} ${fmt(value, metric.digits, metric.unit)}`;
    })
    .filter(Boolean);

  const notes = [
    input.warning,
    input.skipped.length ? `Some data was skipped: ${input.skipped.join('; ')}.` : null,
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fafafa;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="font-size:13px;color:#a1a1aa;margin-bottom:4px;">Fitbit daily</div>
  <h1 style="margin:0;font-size:28px;font-weight:700;color:#fff;">${esc(longDate(input.yesterday))}</h1>
  <div style="font-size:12px;color:#71717a;margin-top:4px;">Compared with the 7 days before yesterday. Synced from Google Health.</div>

  <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:8px 8px 4px;margin-top:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr>
        <th style="text-align:left;padding:8px 12px;color:#71717a;font-weight:500;">Yesterday</th>
        <th style="text-align:right;padding:8px 12px;color:#71717a;font-weight:500;">Value</th>
        <th style="text-align:right;padding:8px 12px;color:#71717a;font-weight:500;">Vs avg</th>
        <th style="text-align:right;padding:8px 12px;color:#71717a;font-weight:500;">Prior 7 days</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;margin-top:16px;">
    <div style="font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Workouts yesterday</div>
    ${workoutBlock(input.workouts, 'No workouts logged.')}
  </div>

  <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;margin-top:16px;">
    <div style="font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">So far today</div>
    <div style="color:#e4e4e7;margin-bottom:8px;">${todayBits.length ? esc(todayBits.join(' · ')) : 'Nothing recorded yet today.'}</div>
    ${input.todayWorkouts.length ? workoutBlock(input.todayWorkouts, '') : ''}
  </div>

  ${notes.length ? `<div style="margin-top:16px;font-size:13px;color:#fbbf24;">${notes.map((note) => esc(note!)).join('<br>')}</div>` : ''}

  <div style="text-align:center;font-size:12px;color:#52525b;margin-top:32px;">Pearson Household · Fitbit via Google Health</div>
</div>
</body>
</html>`;
}
