import { CALENDAR_READONLY_SCOPE, hasScope } from '@/lib/google-health/config';
import { halifaxTodayBounds } from '@/lib/zoned-day';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export type CalendarEvent = {
  id: string;
  title: string;
  when: string;
  allDay: boolean;
  sortKey: string;
};

type CalendarListEntry = {
  id?: string;
  summary?: string;
  selected?: boolean;
};

type GoogleEvent = {
  id?: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
};

export class CalendarApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CalendarApiError';
    this.status = status;
  }
}

export function calendarScopeGranted(scopes: string | null | undefined): boolean {
  return hasScope(scopes, CALENDAR_READONLY_SCOPE);
}

export async function listTodayEvents(accessToken: string, now = new Date()): Promise<CalendarEvent[]> {
  const bounds = halifaxTodayBounds(now);
  const calendars = await listSelectedCalendars(accessToken);
  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  for (const calendar of calendars) {
    let items: GoogleEvent[];
    try {
      items = await listEvents(accessToken, calendar.id, bounds.timeMin, bounds.timeMax);
    } catch (err) {
      if (err instanceof CalendarApiError && (err.status === 403 || err.status === 404)) continue;
      throw err;
    }
    for (const item of items) {
      if (item.status === 'cancelled') continue;
      const mapped = toEvent(item);
      if (!mapped) continue;
      const key = `${item.iCalUID ?? item.id ?? mapped.title}|${mapped.sortKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(mapped);
    }
  }
  events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.sortKey.localeCompare(b.sortKey));
  return events;
}

async function listSelectedCalendars(accessToken: string): Promise<{ id: string }[]> {
  const url = new URL(`${CALENDAR_API}/users/me/calendarList`);
  url.searchParams.set('minAccessRole', 'reader');
  url.searchParams.set('showHidden', 'false');
  url.searchParams.set('maxResults', '15');
  const payload = await calendarGet(accessToken, url);
  const items = Array.isArray(payload.items) ? payload.items as CalendarListEntry[] : [];
  const selected = items.filter((item) => item.id && item.selected !== false);
  if (selected.length) return selected.slice(0, 15).map((item) => ({ id: item.id as string }));
  return [{ id: 'primary' }];
}

async function listEvents(accessToken: string, calendarId: string, timeMin: string, timeMax: string) {
  const collected: GoogleEvent[] = [];
  let pageToken = '';
  for (let page = 0; page < 3; page += 1) {
    const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('timeZone', 'America/Halifax');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const payload = await calendarGet(accessToken, url);
    if (Array.isArray(payload.items)) collected.push(...payload.items as GoogleEvent[]);
    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
    if (!pageToken) break;
  }
  return collected;
}

async function calendarGet(accessToken: string, url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string } };
  if (!response.ok) {
    throw new CalendarApiError(response.status, json.error?.message || 'Google Calendar request failed');
  }
  return json;
}

function toEvent(item: GoogleEvent): CalendarEvent | null {
  const start = item.start;
  if (!start) return null;
  const title = item.summary?.trim() || '(No title)';
  if (start.date && !start.dateTime) {
    return {
      id: item.id || `${title}-${start.date}`,
      title,
      when: 'All day',
      allDay: true,
      sortKey: `${start.date}T00:00:00`,
    };
  }
  if (!start.dateTime) return null;
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Halifax',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(start.dateTime));
  return {
    id: item.id || `${title}-${start.dateTime}`,
    title,
    when,
    allDay: false,
    sortKey: start.dateTime,
  };
}
