import { formatYmd, shiftDate } from './utils.ts';

export const HALIFAX_TIME_ZONE = 'America/Halifax';

/** UTC instant when a civil date starts in a time zone. */
export function zonedDayStart(ymd: string, timeZone: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`Bad calendar date: ${ymd}`);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const firstOffset = offsetMinutes(new Date(utcGuess), timeZone);
  let utc = utcGuess - firstOffset * 60_000;
  const settled = offsetMinutes(new Date(utc), timeZone);
  if (settled !== firstOffset) utc = utcGuess - settled * 60_000;
  return new Date(utc);
}

export function halifaxTodayBounds(now = new Date()): { timeMin: string; timeMax: string; label: string } {
  const label = formatYmd(now, HALIFAX_TIME_ZONE);
  const start = zonedDayStart(label, HALIFAX_TIME_ZONE);
  const end = zonedDayStart(shiftDate(label, 1), HALIFAX_TIME_ZONE);
  return { timeMin: start.toISOString(), timeMax: end.toISOString(), label };
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Missing ${type}`);
    return Number(value);
  };
  let year = pick('year');
  let month = pick('month');
  let day = pick('day');
  let hour = pick('hour');
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, pick('minute'), pick('second'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}
