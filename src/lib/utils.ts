// Fetch every row of a query, paging past Supabase's 1000-row response cap.
// `makeQuery` receives an inclusive range and must apply .range(from, to).
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = await makeQuery(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyDecimal(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Calendar the Fitbit sync uses. UTC "today" is already tomorrow after 8pm in Halifax. */
export const APP_TIME_ZONE = 'America/Halifax';

export function formatYmd(date: Date, timeZone = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return date.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

export function getToday(): string {
  return formatYmd(new Date());
}

/** Add calendar days to a YYYY-MM-DD string. Independent of the machine timezone. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days));
  return utc.toISOString().slice(0, 10);
}

export function getWeekStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  const dow = utc.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + mondayOffset);
  return utc.toISOString().slice(0, 10);
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function getDayOfChallenge(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

export function getStatusColor(value: number | null, min?: number, max?: number): string {
  if (value === null || value === undefined) return 'text-zinc-400';
  if (min !== undefined && max !== undefined) {
    if (value >= min && value <= max) return 'text-emerald-400';
    const rangeSize = max - min;
    if (value < min - rangeSize * 0.1 || value > max + rangeSize * 0.1) return 'text-red-400';
    return 'text-amber-400';
  }
  if (min !== undefined) {
    if (value >= min) return 'text-emerald-400';
    if (value >= min * 0.9) return 'text-amber-400';
    return 'text-red-400';
  }
  if (max !== undefined) {
    if (value <= max) return 'text-emerald-400';
    if (value <= max * 1.1) return 'text-amber-400';
    return 'text-red-400';
  }
  return 'text-zinc-400';
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Newest parseable timestamp, for "updated … ago" stamps. */
export function latestTimestamp(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms) && ms >= bestMs) {
      best = value;
      bestMs = ms;
    }
  }
  return best;
}

/** "Updated 5 min ago". Null when there is no timestamp. */
export function formatUpdatedAgo(value: string | null | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return null;
  const elapsed = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < 45_000) return 'Updated just now';
  if (elapsed < hour) {
    const minutes = Math.max(1, Math.round(elapsed / minute));
    return `Updated ${minutes} min ago`;
  }
  if (elapsed < day) {
    const hours = Math.max(1, Math.round(elapsed / hour));
    return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.max(1, Math.round(elapsed / day));
  if (days < 30) return `Updated ${days} ${days === 1 ? 'day' : 'days'} ago`;
  const months = Math.max(1, Math.round(days / 30));
  return `Updated ${months} ${months === 1 ? 'month' : 'months'} ago`;
}
