import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleOAuthError, refreshAccessToken } from '@/lib/google-health/oauth';
import { calendarScopeGranted } from './events';

type CalendarTokenRow = {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  scopes: string | null;
};

export type CalendarAccess =
  | { connected: false; reason: 'not_connected' | 'missing_scope' | 'expired' }
  | { connected: true; accessToken: string };

/**
 * Reads and refreshes google_calendar_tokens only. google_health_tokens is
 * never selected or updated here, so a calendar refresh cannot rotate the
 * Fitbit refresh token.
 */
export async function calendarAccessForUser(admin: SupabaseClient, userId: string): Promise<CalendarAccess> {
  const { data, error } = await admin
    .from('google_calendar_tokens')
    .select('user_id, refresh_token, access_token, access_token_expires_at, scopes')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { connected: false, reason: 'not_connected' };
  const row = data as CalendarTokenRow;
  if (row.scopes && !calendarScopeGranted(row.scopes)) {
    return { connected: false, reason: 'missing_scope' };
  }

  const expires = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (row.access_token && expires - Date.now() > 120_000) {
    return { connected: true, accessToken: row.access_token };
  }

  try {
    const refreshed = await refreshAccessToken(row.refresh_token);
    const scopes = refreshed.scope ?? row.scopes;
    if (scopes && !calendarScopeGranted(scopes)) {
      return { connected: false, reason: 'missing_scope' };
    }
    const update: Record<string, string> = {
      access_token: refreshed.access_token,
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (refreshed.refresh_token) update.refresh_token = refreshed.refresh_token;
    if (refreshed.scope) update.scopes = refreshed.scope;
    const { error: saveError } = await admin.from('google_calendar_tokens').update(update).eq('user_id', userId);
    if (saveError) throw new Error(saveError.message);
    return { connected: true, accessToken: refreshed.access_token };
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === 'invalid_grant') {
      return { connected: false, reason: 'expired' };
    }
    throw err;
  }
}
