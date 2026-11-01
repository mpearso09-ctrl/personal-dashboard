import assert from 'node:assert/strict';
import test from 'node:test';
import { actionAge, groupActionItems, type ActionItem } from './action-items.ts';
import { replyDraftMessages } from './brain-draft.ts';
import { halifaxTodayBounds, zonedDayStart } from './zoned-day.ts';
import { CALENDAR_READONLY_SCOPE, GOOGLE_HEALTH_SCOPES } from './google-health/config.ts';
import { buildAuthUrl, buildCalendarAuthUrl, isCalendarOAuthState } from './google-health/oauth.ts';

const now = Date.parse('2026-11-01T15:00:00.000Z');

function item(partial: Partial<ActionItem> & Pick<ActionItem, 'id' | 'business'>): ActionItem {
  return {
    source_inbox: 'info@frameworksinc.ca',
    title: partial.id,
    summary: null,
    created_at: '2026-11-01T12:00:00.000Z',
    ...partial,
  };
}

test('open items stay in business order with a count for every group', () => {
  const groups = groupActionItems([
    item({ id: 'p', business: 'personal', created_at: '2026-11-01T10:00:00.000Z' }),
    item({ id: 'f2', business: 'frameworks', created_at: '2026-11-01T11:00:00.000Z' }),
    item({ id: 'f1', business: 'frameworks', created_at: '2026-11-01T09:00:00.000Z' }),
    item({ id: 'e', business: 'f4e' }),
  ]);
  assert.deepEqual(groups.map((group) => group.id), ['frameworks', 'mmp', 'f4e', 'personal']);
  assert.deepEqual(groups.map((group) => group.items.length), [2, 0, 1, 1]);
  assert.deepEqual(groups[0].items.map((row) => row.id), ['f1', 'f2']);
  assert.equal(groups[2].label, 'Frameworks for Everyone');
});

test('age is short enough for a phone row', () => {
  assert.equal(actionAge('2026-11-01T14:59:40.000Z', now), 'just now');
  assert.equal(actionAge('2026-11-01T14:20:00.000Z', now), '40 min');
  assert.equal(actionAge('2026-11-01T12:00:00.000Z', now), '3 hr');
  assert.equal(actionAge('2026-10-31T15:00:00.000Z', now), '1 day');
  assert.equal(actionAge('2026-10-28T15:00:00.000Z', now), '4 days');
});

test('a suggested reply is copy text and never a send instruction', () => {
  const messages = replyDraftMessages({
    title: 'Invoice 14',
    summary: 'Please confirm the deposit.',
    business: 'mmp',
    sourceInbox: 'mmpenvironmental@gmail.com',
  });
  assert.match(messages.system, /cannot send email/i);
  assert.doesNotMatch(messages.system, /mail\.google\.com|mailto:/i);
  assert.match(messages.prompt, /Invoice 14/);
  assert.match(messages.prompt, /MMP/);
  assert.doesNotMatch(messages.prompt, /mailto:/i);
});

test('Halifax midnights follow Atlantic time, including the November fallback', () => {
  assert.equal(zonedDayStart('2026-07-15', 'America/Halifax').toISOString(), '2026-07-15T03:00:00.000Z');
  assert.equal(zonedDayStart('2026-01-15', 'America/Halifax').toISOString(), '2026-01-15T04:00:00.000Z');
  assert.equal(zonedDayStart('2026-11-01', 'America/Halifax').toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(zonedDayStart('2026-11-02', 'America/Halifax').toISOString(), '2026-11-02T04:00:00.000Z');
  const bounds = halifaxTodayBounds(new Date('2026-11-01T15:00:00.000Z'));
  assert.equal(bounds.label, '2026-11-01');
  assert.equal(bounds.timeMin, '2026-11-01T03:00:00.000Z');
  assert.equal(bounds.timeMax, '2026-11-02T04:00:00.000Z');
});

test('calendar consent does not ask for Fitbit scopes or replace their grant screen', () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  assert.equal(GOOGLE_HEALTH_SCOPES.some((scope) => scope.includes('calendar')), false);
  const health = new URL(buildAuthUrl('abc123'));
  const calendar = new URL(buildCalendarAuthUrl('cal.abc123'));
  assert.equal(health.searchParams.get('include_granted_scopes'), 'true');
  assert.equal(health.searchParams.get('scope')?.includes('calendar'), false);
  assert.equal(calendar.searchParams.get('scope'), CALENDAR_READONLY_SCOPE);
  assert.equal(calendar.searchParams.get('include_granted_scopes'), null);
  assert.equal(calendar.searchParams.get('redirect_uri'), health.searchParams.get('redirect_uri'));
  assert.equal(calendar.searchParams.get('prompt'), 'consent');
  assert.equal(isCalendarOAuthState('cal.abc'), true);
  assert.equal(isCalendarOAuthState('abc'), false);
});
