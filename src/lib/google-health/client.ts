import { DATA_SOURCE_FAMILY, HEALTH_API_BASE } from './config';
import type { CivilDateTime } from './parse';

export class HealthApiError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = 'HealthApiError';
    this.status = status;
    this.reason = reason;
  }
}

export type HealthDataPoint = {
  name?: string;
  dataPointName?: string;
  dailyRestingHeartRate?: {
    date?: { year?: number; month?: number; day?: number };
    beatsPerMinute?: string | number;
  };
  sleep?: {
    interval?: {
      startTime?: string;
      endTime?: string;
      startUtcOffset?: string;
      endUtcOffset?: string;
      civilStartTime?: CivilDateTime;
      civilEndTime?: CivilDateTime;
    };
    metadata?: { mainSleep?: boolean; main?: boolean; nap?: boolean };
    summary?: { minutesAsleep?: string | number };
  };
  exercise?: {
    interval?: {
      startTime?: string;
      endTime?: string;
      startUtcOffset?: string;
      endUtcOffset?: string;
      civilStartTime?: CivilDateTime;
      civilEndTime?: CivilDateTime;
    };
    exerciseType?: string;
    displayName?: string;
    activeDuration?: string;
    metricsSummary?: Record<string, unknown>;
  };
  weight?: {
    sampleTime?: {
      physicalTime?: string;
      civilTime?: CivilDateTime;
    };
    weightGrams?: string | number;
  };
  bodyFat?: {
    sampleTime?: {
      physicalTime?: string;
      civilTime?: CivilDateTime;
    };
    percentage?: string | number;
  };
};

export type DailyRollupPoint = {
  civilStartTime?: CivilDateTime;
  steps?: Record<string, unknown>;
  totalCalories?: Record<string, unknown>;
  weight?: Record<string, unknown>;
  bodyFat?: Record<string, unknown>;
};

type ListResponse = {
  dataPoints?: HealthDataPoint[];
  nextPageToken?: string;
};

type RollupResponse = {
  rollupDataPoints?: DailyRollupPoint[];
  nextPageToken?: string;
};

function civilMidnight(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  return {
    date: { year, month, day },
    time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
  };
}

async function healthFetch(accessToken: string, path: string, init?: RequestInit): Promise<unknown> {
  let lastError: HealthApiError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${HEALTH_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const text = await response.text();
    const body = text ? safeJson(text) : {};
    if (response.ok) return body;
    const reason = errorReason(body);
    const message = errorMessage(body) || response.statusText || 'Google Health request failed';
    lastError = new HealthApiError(response.status, message, reason);
    if (attempt === 0 && (response.status === 429 || response.status === 503 || response.status === 504)) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    throw lastError;
  }
  throw lastError ?? new HealthApiError(500, 'Google Health request failed');
}

export async function getIdentity(accessToken: string): Promise<{ healthUserId?: string; legacyUserId?: string }> {
  const body = (await healthFetch(accessToken, '/users/me/identity')) as {
    healthUserId?: string;
    legacyUserId?: string;
  };
  return body;
}

export async function getTimeZone(accessToken: string): Promise<string | null> {
  const body = (await healthFetch(accessToken, '/users/me/settings')) as { timeZone?: string };
  return body.timeZone?.trim() || null;
}

export async function dailyRollUp(
  accessToken: string,
  dataType: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<DailyRollupPoint[]> {
  const points: DailyRollupPoint[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const body = (await healthFetch(
      accessToken,
      `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
      {
        method: 'POST',
        body: JSON.stringify({
          range: { start: civilMidnight(startYmd), end: civilMidnight(endExclusiveYmd) },
          windowSizeDays: 1,
          dataSourceFamily: DATA_SOURCE_FAMILY,
          ...(pageToken ? { pageToken } : {}),
        }),
      },
    )) as RollupResponse;
    points.push(...(body.rollupDataPoints ?? []));
    if (!body.nextPageToken || body.nextPageToken === pageToken) break;
    pageToken = body.nextPageToken;
  }
  return points;
}

export async function listDataPoints(
  accessToken: string,
  dataType: string,
  filter: string,
  options?: { reconcile?: boolean; pageSize?: number; dataSourceFamily?: string; maxPages?: number },
): Promise<HealthDataPoint[]> {
  const points: HealthDataPoint[] = [];
  let pageToken: string | undefined;
  const method = options?.reconcile ? 'dataPoints:reconcile' : 'dataPoints';
  const pageSize = options?.pageSize ?? 25;
  const family = options?.dataSourceFamily ?? DATA_SOURCE_FAMILY;
  const maxPages = options?.maxPages ?? 5;
  for (let page = 0; page < maxPages; page++) {
    const query = [
      `filter=${encodeURIComponent(filter)}`,
      `pageSize=${pageSize}`,
      `dataSourceFamily=${encodeURIComponent(family)}`,
      pageToken ? `pageToken=${encodeURIComponent(pageToken)}` : '',
    ].filter(Boolean).join('&');
    const body = (await healthFetch(
      accessToken,
      `/users/me/dataTypes/${dataType}/${method}?${query}`,
    )) as ListResponse;
    points.push(...(body.dataPoints ?? []));
    if (!body.nextPageToken || body.nextPageToken === pageToken) break;
    pageToken = body.nextPageToken;
  }
  return points;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function errorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const error = (body as { error?: { message?: string } }).error;
  return error?.message ?? '';
}

function errorReason(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const details = (body as { error?: { details?: { reason?: string }[] } }).error?.details;
  return details?.find((detail) => detail.reason)?.reason;
}
