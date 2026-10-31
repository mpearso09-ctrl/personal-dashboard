import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase-admin';
import { APP_TIME_ZONE } from '@/lib/utils';
import {
  ALL_DATA_SOURCES,
  BODY_METRIC_DAYS,
  configuredTimezone,
  hasScope,
  isValidTimeZone,
  reportFromAddress,
  reportRecipient,
  SCOPE_ACTIVITY,
  SCOPE_METRICS,
  SCOPE_SETTINGS,
  SCOPE_SLEEP,
} from './config';
import {
  dailyRollUp,
  getTimeZone,
  HealthApiError,
  listDataPoints,
  type HealthDataPoint,
} from './client';
import { exerciseLabel, mapExercise } from './exercise';
import { GoogleOAuthError, refreshAccessToken } from './oauth';
import {
  addCalendarDays,
  calendarDate,
  durationMinutes,
  gramsToPounds,
  millimetersToKm,
  minutesToHours,
  latestValuePerDay,
  num,
  pickNumber,
  sessionCivilDate,
  type SampleClock,
  ymdFromCivil,
  ymdFromGoogleDate,
} from './parse';
import { buildFitbitReportHtml, type ReportMetrics } from './report';

type TokenRow = {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  scopes: string | null;
};

type DayPatch = {
  steps?: number;
  sleep_hours?: number;
  calories_burned?: number;
  weight_lbs?: number;
  body_fat_pct?: number;
  resting_heart_rate?: number;
};

type ImportedSession = {
  source_id: string;
  date: string;
  type: string;
  subtype: string | null;
  duration_min: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  notes: string;
};

export type SyncResult = {
  ok: boolean;
  userId: string;
  error?: string;
  timezone?: string;
  yesterday?: string;
  today?: string;
  sessionsImported?: number;
  skipped?: string[];
  warning?: string | null;
  email?: { sent: boolean; reason?: string };
};

export type SyncOptions = {
  /** Send the daily report, and a failure note if the sync cannot finish. Defaults to true. */
  email?: boolean;
};

export async function syncGoogleHealthUser(userId: string, options: SyncOptions = {}): Promise<SyncResult> {
  const emailEnabled = options.email !== false;
  const admin = createServiceClient();
  const { data: token, error } = await admin
    .from('google_health_tokens')
    .select('user_id, refresh_token, access_token, access_token_expires_at, refresh_token_expires_at, scopes')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return finish(admin, userId, { ok: false, userId, error: error.message }, false);
  if (!token) return { ok: false, userId, error: 'Fitbit is not connected for this account' };

  let accessToken: string;
  let scopes: string | null;
  let refreshExpires: string | null;
  try {
    const fresh = await ensureAccessToken(admin, token as TokenRow);
    accessToken = fresh.accessToken;
    scopes = fresh.scopes;
    refreshExpires = fresh.refreshExpires;
  } catch (err) {
    const invalid = err instanceof GoogleOAuthError && err.code === 'invalid_grant';
    const message = invalid
      ? 'Google access expired. Open Fitness and connect Fitbit again.'
      : err instanceof Error ? err.message : 'Could not refresh Google access';
    await writeState(admin, userId, {
      connected: !invalid,
      last_sync_error: message,
    });
    const email = emailEnabled
      ? await sendEmail(admin, userId, message, null)
      : { sent: false, reason: 'skipped' };
    return { ok: false, userId, error: message, email };
  }

  const skipped: string[] = [];
  const warning = refreshWarning(refreshExpires);
  const timeZone = await resolveTimeZone(accessToken, scopes);
  const today = calendarDate(timeZone);
  const yesterday = addCalendarDays(today, -1);
  const endExclusive = addCalendarDays(today, 1);
  const window = new Set([yesterday, today]);
  const days = new Map<string, DayPatch>();
  const touch = (date: string) => {
    const current = days.get(date) ?? {};
    days.set(date, current);
    return current;
  };

  const allow = (scope: string) => !scopes || hasScope(scopes, scope);

  if (allow(SCOPE_ACTIVITY)) {
    await tryMetric('steps', skipped, async () => {
      const points = await dailyRollUp(accessToken, 'steps', yesterday, endExclusive);
      for (const point of points) {
        const date = ymdFromCivil(point.civilStartTime);
        const count = pickNumber(point.steps, 'countSum', 'count_sum');
        if (!date || !window.has(date) || count == null) continue;
        touch(date).steps = Math.max(0, Math.round(count));
      }
    });
    await tryMetric('calories burned', skipped, async () => {
      const points = await dailyRollUp(accessToken, 'total-calories', yesterday, endExclusive);
      for (const point of points) {
        const date = ymdFromCivil(point.civilStartTime);
        const kcal = pickNumber(point.totalCalories, 'kcalSum', 'kcal_sum');
        if (!date || !window.has(date) || kcal == null) continue;
        touch(date).calories_burned = Math.max(0, Math.round(kcal));
      }
    });
  } else {
    skipped.push('steps, calories, and workouts: activity permission not granted');
  }

  if (allow(SCOPE_METRICS)) {
    // google-sources drops third-party scales. These two types are samples,
    // so the latest reading on each Halifax day is the one the scale just wrote.
    const bodyToday = calendarDate(APP_TIME_ZONE);
    const bodyDates = recentDates(bodyToday, BODY_METRIC_DAYS);
    const bodyWindow = new Set(bodyDates);
    const queryStart = addCalendarDays(bodyDates[0], -1);
    const queryEnd = addCalendarDays(bodyToday, 2);
    const sampleFilter = (field: 'weight' | 'body_fat') =>
      `${field}.sample_time.civil_time >= "${queryStart}T00:00:00" AND ${field}.sample_time.civil_time < "${queryEnd}T00:00:00"`;
    const sampleOptions = { dataSourceFamily: ALL_DATA_SOURCES, pageSize: 500, maxPages: 10 };
    await tryMetric('weight', skipped, async () => {
      const points = await listDataPoints(accessToken, 'weight', sampleFilter('weight'), sampleOptions);
      const byDay = latestValuePerDay(points.map((point) => sampleReading(point.weight, 'weightGrams', 'weight_grams')), APP_TIME_ZONE, bodyWindow);
      for (const [date, grams] of byDay) touch(date).weight_lbs = gramsToPounds(grams);
    });
    await tryMetric('body fat', skipped, async () => {
      const points = await listDataPoints(accessToken, 'body-fat', sampleFilter('body_fat'), sampleOptions);
      const byDay = latestValuePerDay(points.map((point) => sampleReading(point.bodyFat, 'percentage')), APP_TIME_ZONE, bodyWindow);
      for (const [date, pct] of byDay) touch(date).body_fat_pct = Math.round(pct * 10) / 10;
    });
    await tryMetric('resting heart rate', skipped, async () => {
      const points = await listDataPoints(
        accessToken,
        'daily-resting-heart-rate',
        `daily_resting_heart_rate.date >= "${yesterday}" AND daily_resting_heart_rate.date < "${endExclusive}"`,
      );
      for (const point of points) {
        const heart = point.dailyRestingHeartRate;
        const date = ymdFromGoogleDate(heart?.date);
        const bpm = num(heart?.beatsPerMinute);
        if (!date || !window.has(date) || bpm == null || bpm <= 0) continue;
        touch(date).resting_heart_rate = Math.round(bpm);
      }
    });
  } else {
    skipped.push('weight, body fat, and resting heart rate: measurements permission not granted');
  }

  if (allow(SCOPE_SLEEP)) {
    await tryMetric('sleep', skipped, async () => {
      const points = await listDataPoints(
        accessToken,
        'sleep',
        `sleep.interval.civil_end_time >= "${yesterday}" AND sleep.interval.civil_end_time < "${endExclusive}"`,
        { reconcile: true },
      );
      for (const [date, hours] of sleepHours(points, window)) {
        touch(date).sleep_hours = hours;
      }
    });
  } else {
    skipped.push('sleep: sleep permission not granted');
  }

  let sessionsImported = 0;
  const workoutDates = new Set<string>();
  if (allow(SCOPE_ACTIVITY)) {
    await tryMetric('workouts', skipped, async () => {
      const points = await listDataPoints(
        accessToken,
        'exercise',
        `exercise.interval.civil_start_time >= "${yesterday}" AND exercise.interval.civil_start_time < "${endExclusive}"`,
        { reconcile: true },
      );
      const imported = sessionsFrom(points, window);
      sessionsImported = await saveSessions(admin, userId, imported);
      imported.forEach((session) => workoutDates.add(session.date));
    });
  }

  try {
    const datesToWrite = new Set<string>([yesterday, today, ...days.keys()]);
    for (const date of [...datesToWrite].sort()) {
      await writeDay(admin, userId, date, days.get(date) ?? {}, workoutDates.has(date));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save Fitbit data';
    await writeState(admin, userId, { connected: true, last_sync_error: message });
    const email = emailEnabled
      ? await sendEmail(admin, userId, message, null)
      : { sent: false, reason: 'skipped' };
    return { ok: false, userId, error: message, timezone: timeZone, yesterday, today, skipped, email };
  }

  const note = [warning, skipped.length ? skipped.join('; ') : null].filter(Boolean).join(' ');
  const email = emailEnabled
    ? await sendReport(admin, userId, {
      yesterday,
      today,
      skipped,
      warning,
    })
    : null;
  await writeState(admin, userId, {
    connected: true,
    last_synced_at: new Date().toISOString(),
    last_sync_error: note || null,
    ...(email ? { last_email_error: email.sent ? null : email.reason ?? 'Email was not sent' } : {}),
  });

  return {
    ok: true,
    userId,
    timezone: timeZone,
    yesterday,
    today,
    sessionsImported,
    skipped,
    warning,
    email: email ?? { sent: false, reason: 'skipped' },
  };
}

export async function syncAllConnected(options: SyncOptions = {}): Promise<SyncResult[]> {
  const admin = createServiceClient();
  const { data, error } = await admin.from('google_health_tokens').select('user_id');
  if (error) throw new Error(error.message);
  const results: SyncResult[] = [];
  for (const row of data ?? []) {
    results.push(await syncGoogleHealthUser(row.user_id as string, options));
  }
  return results;
}

async function ensureAccessToken(admin: SupabaseClient, row: TokenRow) {
  const expires = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (row.access_token && expires - Date.now() > 120_000) {
    return {
      accessToken: row.access_token,
      scopes: row.scopes,
      refreshExpires: row.refresh_token_expires_at,
    };
  }
  const refreshed = await refreshAccessToken(row.refresh_token);
  const update: Record<string, string> = {
    access_token: refreshed.access_token,
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (refreshed.refresh_token) update.refresh_token = refreshed.refresh_token;
  if (refreshed.refresh_token_expires_in) {
    update.refresh_token_expires_at = new Date(Date.now() + refreshed.refresh_token_expires_in * 1000).toISOString();
  }
  if (refreshed.scope) update.scopes = refreshed.scope;
  const { error } = await admin.from('google_health_tokens').update(update).eq('user_id', row.user_id);
  if (error) throw new Error(error.message);
  return {
    accessToken: refreshed.access_token,
    scopes: refreshed.scope ?? row.scopes,
    refreshExpires: update.refresh_token_expires_at ?? row.refresh_token_expires_at,
  };
}

async function resolveTimeZone(accessToken: string, scopes: string | null): Promise<string> {
  const fallback = configuredTimezone();
  if (scopes && !hasScope(scopes, SCOPE_SETTINGS)) return fallback;
  try {
    const timeZone = await getTimeZone(accessToken);
    if (timeZone && isValidTimeZone(timeZone)) return timeZone;
  } catch {
    // Settings are only used to choose yesterday/today. The env fallback is enough.
  }
  return fallback;
}

function refreshWarning(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(remaining)) return null;
  if (remaining <= 0) {
    return 'The Google connection has expired. Connect Fitbit again to keep the daily sync running.';
  }
  if (remaining < 48 * 60 * 60 * 1000) {
    const hours = Math.max(1, Math.round(remaining / (60 * 60 * 1000)));
    return `The Google connection expires in about ${hours} hours. Connect Fitbit again before then. This happens while the Google app is still in Testing mode.`;
  }
  return null;
}

async function tryMetric(label: string, skipped: string[], run: () => Promise<void>) {
  try {
    await run();
  } catch (err) {
    if (err instanceof HealthApiError && (err.status === 403 || err.reason === 'MISSING_OAUTH_SCOPE')) {
      skipped.push(`${label}: permission not granted`);
      return;
    }
    const message = err instanceof Error ? err.message : 'request failed';
    skipped.push(`${label}: ${message}`);
  }
}

function recentDates(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addCalendarDays(today, index - (count - 1)));
}

function sampleReading(
  record: object | undefined,
  ...valueKeys: string[]
): { sampleTime?: SampleClock; value: number | null } {
  const raw = record as Record<string, unknown> | undefined;
  const sampleTime = (raw?.sampleTime ?? raw?.sample_time) as SampleClock | undefined;
  return { sampleTime, value: pickNumber(raw, ...valueKeys) };
}

function sleepHours(points: HealthDataPoint[], window: Set<string>): Map<string, number> {
  const grouped = new Map<string, NonNullable<HealthDataPoint['sleep']>[]>();
  for (const point of points) {
    const sleep = point.sleep;
    if (!sleep) continue;
    const date = sessionCivilDate(sleep.interval, 'end');
    if (!date || !window.has(date)) continue;
    const list = grouped.get(date) ?? [];
    list.push(sleep);
    grouped.set(date, list);
  }
  const hours = new Map<string, number>();
  for (const [date, sessions] of grouped) {
    const mains = sessions.filter((session) => session.metadata?.mainSleep === true || session.metadata?.main === true);
    const nonNaps = sessions.filter((session) => session.metadata?.nap !== true);
    const chosen = mains.length ? mains : nonNaps.length ? nonNaps : sessions;
    const minutes = chosen.reduce((sum, session) => {
      const asleep = num(session.summary?.minutesAsleep);
      return asleep != null && asleep > 0 ? sum + asleep : sum;
    }, 0);
    if (minutes > 0) hours.set(date, Math.min(24, minutesToHours(minutes)));
  }
  return hours;
}

function sessionsFrom(points: HealthDataPoint[], window: Set<string>): ImportedSession[] {
  const seen = new Set<string>();
  const imported: ImportedSession[] = [];
  for (const point of points) {
    const exercise = point.exercise;
    const sourceId = point.dataPointName || point.name;
    if (!exercise || !sourceId || seen.has(sourceId)) continue;
    const mapped = mapExercise(exercise.exerciseType, exercise.displayName);
    if (!mapped) continue;
    const date = sessionCivilDate(exercise.interval, 'start');
    if (!date || !window.has(date)) continue;
    seen.add(sourceId);
    const label = exerciseLabel(exercise.exerciseType, exercise.displayName);
    const distance = millimetersToKm(pickNumber(exercise.metricsSummary, 'distanceMillimeters', 'distance_millimeters') ?? 0);
    const heart = pickNumber(exercise.metricsSummary, 'averageHeartRateBeatsPerMinute', 'average_heart_rate_beats_per_minute');
    imported.push({
      source_id: sourceId,
      date,
      type: mapped.type,
      subtype: mapped.subtype,
      duration_min: durationMinutes(exercise.activeDuration, exercise.interval),
      distance_km: distance,
      avg_hr: heart != null && heart > 0 ? Math.round(heart) : null,
      notes: `Fitbit · ${label}`.slice(0, 500),
    });
  }
  return imported;
}

async function saveSessions(admin: SupabaseClient, userId: string, sessions: ImportedSession[]): Promise<number> {
  if (!sessions.length) return 0;
  const ids = sessions.map((session) => session.source_id);
  const { data: existing, error } = await admin
    .from('training_sessions')
    .select('id, source_id')
    .eq('user_id', userId)
    .in('source_id', ids);
  if (error) throw new Error(error.message);
  const bySource = new Map((existing ?? []).map((row) => [row.source_id as string, row.id as string]));
  for (const session of sessions) {
    const payload = {
      date: session.date,
      type: session.type,
      subtype: session.subtype,
      duration_min: session.duration_min,
      distance_km: session.distance_km,
      avg_hr: session.avg_hr,
      source: 'google_health',
    };
    const existingId = bySource.get(session.source_id);
    if (existingId) {
      const { error: updateError } = await admin.from('training_sessions').update(payload).eq('id', existingId);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { error: insertError } = await admin.from('training_sessions').insert({
        ...payload,
        user_id: userId,
        source_id: session.source_id,
        notes: session.notes,
      });
      if (insertError) throw new Error(insertError.message);
    }
  }
  return sessions.length;
}

async function writeDay(admin: SupabaseClient, userId: string, date: string, patch: DayPatch, workout: boolean) {
  const payload: Record<string, number | boolean> = {};
  (Object.entries(patch) as [string, number | undefined][]).forEach(([key, value]) => {
    if (value !== undefined) payload[key] = value;
  });
  if (workout) payload.workout = true;
  if (!Object.keys(payload).length) return;

  const { data: existing, error: readError } = await admin
    .from('fitness_daily')
    .select('id')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing) {
    const { error: updateError } = await admin.from('fitness_daily').update(payload).eq('id', existing.id);
    if (updateError) throw new Error(updateError.message);
    return;
  }
  const { error: insertError } = await admin.from('fitness_daily').insert({ user_id: userId, date, ...payload });
  if (insertError) throw new Error(insertError.message);
}

async function sendReport(
  admin: SupabaseClient,
  userId: string,
  input: { yesterday: string; today: string; skipped: string[]; warning: string | null },
): Promise<{ sent: boolean; reason?: string }> {
  const priorDates = Array.from({ length: 7 }, (_, index) => addCalendarDays(input.yesterday, -7 + index));
  const { data: rows, error } = await admin
    .from('fitness_daily')
    .select('date, steps, sleep_hours, calories_burned, weight_lbs, body_fat_pct, resting_heart_rate')
    .eq('user_id', userId)
    .gte('date', priorDates[0])
    .lte('date', input.today);
  if (error) return { sent: false, reason: error.message };
  const byDate = new Map((rows ?? []).map((row) => [row.date as string, row]));
  const metrics = (date: string): ReportMetrics => {
    const row = byDate.get(date) as Record<string, unknown> | undefined;
    return {
      steps: num(row?.steps),
      sleep_hours: num(row?.sleep_hours),
      calories_burned: num(row?.calories_burned),
      weight_lbs: num(row?.weight_lbs),
      body_fat_pct: num(row?.body_fat_pct),
      resting_heart_rate: num(row?.resting_heart_rate),
    };
  };
  const { data: sessions } = await admin
    .from('training_sessions')
    .select('date, type, duration_min, distance_km, avg_hr, notes, source')
    .eq('user_id', userId)
    .in('date', [input.yesterday, input.today]);
  const workouts = (sessions ?? []).map((session) => ({
    date: session.date as string,
    type: session.type as string,
    duration_min: num(session.duration_min),
    distance_km: num(session.distance_km),
    avg_hr: num(session.avg_hr),
    notes: (session.notes as string | null) ?? null,
    source: (session.source as string | null) ?? null,
  }));
  const html = buildFitbitReportHtml({
    yesterday: input.yesterday,
    today: input.today,
    yesterdayMetrics: metrics(input.yesterday),
    todayMetrics: metrics(input.today),
    prior: priorDates.map(metrics),
    workouts: workouts.filter((session) => session.date === input.yesterday),
    todayWorkouts: workouts.filter((session) => session.date === input.today),
    skipped: input.skipped,
    warning: input.warning,
  });
  const [year, month, day] = input.yesterday.split('-').map(Number);
  const label = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return deliver(html, `Fitbit daily — ${label}`);
}

async function sendEmail(
  admin: SupabaseClient,
  userId: string,
  message: string,
  html: string | null,
): Promise<{ sent: boolean; reason?: string }> {
  const body = html ?? `<div style="font-family:sans-serif;background:#09090b;color:#fafafa;padding:24px;">
    <h1 style="font-size:20px;">Fitbit sync did not finish</h1>
    <p>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>
    <p>Open the dashboard, go to Fitness, and choose Connect Fitbit.</p>
  </div>`;
  const result = await deliver(body, 'Fitbit sync needs a reconnect');
  await writeState(admin, userId, { last_email_error: result.sent ? null : result.reason ?? 'Email was not sent' });
  return result;
}

async function deliver(html: string, subject: string): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = reportRecipient();
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY is not set' };
  if (!to.length) return { sent: false, reason: 'FITBIT_REPORT_EMAIL is not set' };
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: reportFromAddress(),
      to,
      subject,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'Email failed' };
  }
}

async function writeState(admin: SupabaseClient, userId: string, patch: Record<string, unknown>) {
  await admin.from('fitness_sync_state').upsert(
    { user_id: userId, updated_at: new Date().toISOString(), ...patch },
    { onConflict: 'user_id' },
  );
}

async function finish(
  admin: SupabaseClient,
  userId: string,
  result: SyncResult,
  connected: boolean,
): Promise<SyncResult> {
  await writeState(admin, userId, { connected, last_sync_error: result.error ?? null });
  return result;
}
