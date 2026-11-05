/** Read-only Google Health scopes this dashboard requests. */
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.settings.readonly',
] as const;

export const SCOPE_ACTIVITY = GOOGLE_HEALTH_SCOPES[0];
export const SCOPE_SLEEP = GOOGLE_HEALTH_SCOPES[1];
export const SCOPE_METRICS = GOOGLE_HEALTH_SCOPES[2];
export const SCOPE_SETTINGS = GOOGLE_HEALTH_SCOPES[3];

/**
 * Read-only calendar scope. Requested only by the Brain "Connect calendar"
 * flow. It is intentionally absent from GOOGLE_HEALTH_SCOPES so a Fitbit
 * reconnect does not ask for calendar, and a calendar connect does not
 * replace the health refresh token.
 */
export const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/** OAuth state prefix for a calendar consent. Health states stay plain hex. */
export const CALENDAR_OAUTH_PREFIX = 'cal.';

/** First-party Fitbit / Google Health sources. Steps, sleep, and workouts stay here. */
export const DATA_SOURCE_FAMILY = 'users/me/dataSourceFamilies/google-sources';

/**
 * Every source on the Google Health account. Third-party scales are not in
 * google-sources; they only show up in this family.
 */
export const ALL_DATA_SOURCES = 'users/me/dataSourceFamilies/all-sources';

/** Weight and body fat are rewritten for this many days, including today. */
export const BODY_METRIC_DAYS = 14;

export const HEALTH_API_BASE = 'https://health.googleapis.com/v4';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const DEFAULT_REDIRECT_URI =
  'https://personal-dashboard-brown.vercel.app/api/google-health/callback';

export const DEFAULT_TIMEZONE = 'America/Halifax';

export const DEFAULT_REPORT_FROM = 'Pearson Dashboard <reports@frameworksinc.ca>';

export const OAUTH_STATE_COOKIE = 'gh_oauth_state';

/** Grams per pound, from the Google Health API BMI conversion. */
export const GRAMS_PER_POUND = 453.59237;

export function googleHealthRedirectUri(): string {
  const configured = process.env.GOOGLE_HEALTH_REDIRECT_URI?.trim();
  return configured || DEFAULT_REDIRECT_URI;
}

/**
 * Daily cron omits the flag and sends a report. Hourly runs pass email=0
 * (also false, no, or off) and only sync.
 */
export function fitbitEmailRequested(flag: string | null): boolean {
  if (flag == null || flag.trim() === '') return true;
  return !['0', 'false', 'no', 'off'].includes(flag.trim().toLowerCase());
}

export function reportRecipient(): string[] {
  return (process.env.FITBIT_REPORT_EMAIL ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

/** Daily report was not sent because this connected account is not the recipient. */
export const FITBIT_REPORT_OTHER_ACCOUNT = 'not the report recipient';

/** Daily report was not sent because the account email could not be read. */
export const FITBIT_REPORT_EMAIL_UNREADABLE = 'could not read the account email';

const SILENT_FITBIT_EMAIL_REASONS = new Set<string>([
  'skipped',
  FITBIT_REPORT_OTHER_ACCOUNT,
  FITBIT_REPORT_EMAIL_UNREADABLE,
]);

/**
 * True when this Supabase auth email is one of the FITBIT_REPORT_EMAIL
 * addresses. Comparison is case-insensitive. A "Name <email>" recipient
 * matches the address inside the brackets. Other household accounts are not
 * a match, so connecting another Fitbit cannot send a second morning email.
 */
export function isFitbitReportAccount(
  userEmail: string | null | undefined,
  recipients: readonly string[] = reportRecipient(),
): boolean {
  const normalized = normalizeReportEmail(userEmail);
  if (!normalized) return false;
  return recipients.some((recipient) => normalizeReportEmail(recipient) === normalized);
}

export type FitbitReportDecision =
  | { send: true }
  | { send: false; reason: 'skipped' | typeof FITBIT_REPORT_OTHER_ACCOUNT };

/**
 * Whether this sync should send mail. `emailEnabled` is false for hourly
 * runs (`email=0`); those never send, even when the account matches.
 * A matching account is one whose auth email is listed in FITBIT_REPORT_EMAIL.
 */
export function fitbitReportDecision(
  emailEnabled: boolean,
  userEmail: string | null | undefined,
  recipients?: readonly string[],
): FitbitReportDecision {
  if (!emailEnabled) return { send: false, reason: 'skipped' };
  if (!isFitbitReportAccount(userEmail, recipients ?? reportRecipient())) {
    return { send: false, reason: FITBIT_REPORT_OTHER_ACCOUNT };
  }
  return { send: true };
}

/**
 * Persist last_email_error only after a real delivery attempt. Skipping a
 * household account, or failing to read its email, is not an email error.
 */
export function fitbitEmailErrorPatch(
  email: { sent: boolean; reason?: string } | null,
): { last_email_error?: string | null } {
  if (!email) return {};
  if (!email.sent && email.reason && SILENT_FITBIT_EMAIL_REASONS.has(email.reason)) return {};
  return { last_email_error: email.sent ? null : email.reason ?? 'Email was not sent' };
}

function normalizeReportEmail(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  const wrapped = trimmed.match(/<([^>]+)>/);
  return (wrapped?.[1] ?? trimmed).trim();
}

export function reportFromAddress(): string {
  return process.env.FITBIT_REPORT_FROM?.trim() || DEFAULT_REPORT_FROM;
}

export function configuredTimezone(): string {
  const tz = process.env.FITBIT_TIMEZONE?.trim();
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function hasScope(granted: string | null | undefined, scope: string): boolean {
  if (!granted) return false;
  return granted.split(/\s+/).includes(scope);
}
