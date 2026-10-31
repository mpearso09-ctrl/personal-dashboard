import { GRAMS_PER_POUND } from './config';

export type CivilDateTime = {
  date?: { year?: number; month?: number; day?: number };
  time?: { hours?: number; minutes?: number; seconds?: number };
};

export type SessionInterval = {
  startTime?: string;
  endTime?: string;
  startUtcOffset?: string;
  endUtcOffset?: string;
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
};

export function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Protobuf JSON duration, for example "3661.5s" or "-14400s". */
export function durationSeconds(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(-?\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function ymdFromParts(year?: number, month?: number, day?: number): string | null {
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function ymdFromCivil(civil: CivilDateTime | undefined): string | null {
  return ymdFromParts(civil?.date?.year, civil?.date?.month, civil?.date?.day);
}

export function ymdFromGoogleDate(date: { year?: number; month?: number; day?: number } | undefined): string | null {
  return ymdFromParts(date?.year, date?.month, date?.day);
}

/** Calendar date of a session start or end, preferring civil time. */
export function sessionCivilDate(interval: SessionInterval | undefined, edge: 'start' | 'end'): string | null {
  if (!interval) return null;
  const civil = edge === 'start' ? interval.civilStartTime : interval.civilEndTime;
  const fromCivil = ymdFromCivil(civil);
  if (fromCivil) return fromCivil;

  const stamp = edge === 'start' ? interval.startTime : interval.endTime;
  const offset = edge === 'start' ? interval.startUtcOffset : interval.endUtcOffset;
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  if (Number.isNaN(ms)) return null;
  const shifted = ms + (durationSeconds(offset) ?? 0) * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

export function calendarDate(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return now.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function gramsToPounds(grams: number): number {
  return round1(grams / GRAMS_PER_POUND);
}

export function minutesToHours(minutes: number): number {
  return round1(minutes / 60);
}

export function durationMinutes(activeDuration: unknown, interval: SessionInterval | undefined): number | null {
  const active = durationSeconds(activeDuration);
  if (active != null && active > 0) return round1(active / 60);
  if (!interval?.startTime || !interval.endTime) return null;
  const start = Date.parse(interval.startTime);
  const end = Date.parse(interval.endTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return round1((end - start) / 60000);
}

export function millimetersToKm(millimeters: number): number | null {
  if (!Number.isFinite(millimeters) || millimeters <= 0) return null;
  return Math.round((millimeters / 1_000_000) * 100) / 100;
}

export type SampleClock = {
  physicalTime?: string;
  civilTime?: CivilDateTime;
};

/**
 * Keep the latest positive reading on each calendar day in `timeZone`.
 * A physical timestamp is converted into that zone, so a late-evening
 * Halifax weigh-in stays on the Halifax date instead of the next UTC date.
 */
export function latestValuePerDay(
  samples: { sampleTime?: SampleClock; value: number | null | undefined }[],
  timeZone: string,
  allowedDates: ReadonlySet<string>,
): Map<string, number> {
  const best = new Map<string, { order: number; value: number }>();
  for (const sample of samples) {
    const value = sample.value;
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    const placed = placeSample(sample.sampleTime, timeZone);
    if (!placed || !allowedDates.has(placed.date)) continue;
    const current = best.get(placed.date);
    if (!current || placed.order >= current.order) {
      best.set(placed.date, { order: placed.order, value });
    }
  }
  return new Map(Array.from(best, ([date, row]) => [date, row.value]));
}

function placeSample(sampleTime: SampleClock | undefined, timeZone: string): { date: string; order: number } | null {
  const physical = sampleTime?.physicalTime?.trim();
  if (physical) {
    const atMs = Date.parse(physical);
    if (!Number.isNaN(atMs)) {
      return { date: calendarDate(timeZone, new Date(atMs)), order: atMs };
    }
  }
  const civil = sampleTime?.civilTime;
  const date = ymdFromCivil(civil);
  if (!date) return null;
  const hours = civil?.time?.hours ?? 0;
  const minutes = civil?.time?.minutes ?? 0;
  const seconds = civil?.time?.seconds ?? 0;
  return {
    date,
    order: zonedCivilToUtc(date, hours, minutes, seconds, timeZone),
  };
}

/** UTC millis of a civil clock time in `timeZone`. */
function zonedCivilToUtc(ymd: string, hours: number, minutes: number, seconds: number, timeZone: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  let utc = wall - timeZoneOffsetMs(timeZone, wall);
  const crossed = timeZoneOffsetMs(timeZone, utc);
  if (crossed !== timeZoneOffsetMs(timeZone, wall)) utc = wall - crossed;
  return utc;
}

function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const hour = pick('hour') === 24 ? 0 : pick('hour');
  const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), hour, pick('minute'), pick('second'));
  return asUtc - utcMs;
}

export function pickNumber(record: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    if (key in record) {
      const value = num(record[key]);
      if (value != null) return value;
    }
  }
  return null;
}
