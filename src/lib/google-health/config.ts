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

export function reportRecipient(): string[] {
  return (process.env.FITBIT_REPORT_EMAIL ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
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
