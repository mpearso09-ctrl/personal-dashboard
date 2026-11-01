import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createServiceClient } from '@/lib/supabase-admin';
import {
  CALENDAR_READONLY_SCOPE,
  GOOGLE_HEALTH_SCOPES,
  hasScope,
  OAUTH_STATE_COOKIE,
  SCOPE_ACTIVITY,
  SCOPE_METRICS,
  SCOPE_SETTINGS,
  SCOPE_SLEEP,
} from '@/lib/google-health/config';
import { getIdentity, HealthApiError } from '@/lib/google-health/client';
import { exchangeAuthCode, GoogleOAuthError, isCalendarOAuthState } from '@/lib/google-health/oauth';

export const dynamic = 'force-dynamic';

const DATA_SCOPES = [SCOPE_ACTIVITY, SCOPE_SLEEP, SCOPE_METRICS];

export async function GET(request: NextRequest) {
  const finish = (path: string, query: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = query;
    const response = NextResponse.redirect(url);
    response.cookies.set(OAUTH_STATE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  };

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const calendarFlow = isCalendarOAuthState(state) || isCalendarOAuthState(expected);

  const oauthError = request.nextUrl.searchParams.get('error');
  if (oauthError) {
    if (calendarFlow) {
      return finish('/brain', oauthError === 'access_denied' ? 'calendar=denied' : 'calendar=token');
    }
    return finish('/fitness/connect', oauthError === 'access_denied' ? 'error=denied' : 'error=token');
  }

  if (!code || !state || !expected || state !== expected) {
    return finish(calendarFlow ? '/brain' : '/fitness/connect', calendarFlow ? 'calendar=state' : 'error=state');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return finish('/login', calendarFlow ? '' : 'error=fitbit');

  if (calendarFlow) return completeCalendarConnect(code, user.id, finish);

  try {
    const tokens = await exchangeAuthCode(code);
    if (!tokens.refresh_token) return finish('/fitness/connect', 'error=token');

    const scope = tokens.scope ?? '';
    const grantedData = DATA_SCOPES.filter((item) => hasScope(scope, item));
    if (!grantedData.length) return finish('/fitness/connect', 'error=missing');

    let identity: { healthUserId?: string; legacyUserId?: string };
    try {
      identity = await getIdentity(tokens.access_token);
    } catch (err) {
      if (err instanceof HealthApiError && err.reason === 'ACCOUNT_NOT_LINKED') {
        return finish('/fitness/connect', 'error=not_linked');
      }
      throw err;
    }

    const admin = createServiceClient();
    const now = new Date().toISOString();
    const { error: tokenError } = await admin.from('google_health_tokens').upsert({
      user_id: user.id,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      refresh_token_expires_at: tokens.refresh_token_expires_in
        ? new Date(Date.now() + tokens.refresh_token_expires_in * 1000).toISOString()
        : null,
      scopes: scope || GOOGLE_HEALTH_SCOPES.join(' '),
      health_user_id: identity.healthUserId ?? null,
      legacy_user_id: identity.legacyUserId ?? null,
      connected_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' });
    if (tokenError) return finish('/fitness/connect', 'error=save');

    await admin.from('fitness_sync_state').upsert({
      user_id: user.id,
      connected: true,
      last_sync_error: null,
      updated_at: now,
    }, { onConflict: 'user_id' });

    const partial = grantedData.length < DATA_SCOPES.length || !hasScope(scope, SCOPE_SETTINGS);
    return finish('/fitness', partial ? 'fitbit=connected&partial=1' : 'fitbit=connected');
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === 'config') {
      return finish('/fitness/connect', 'error=config');
    }
    if (err instanceof Error && err.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return finish('/fitness/connect', 'error=save');
    }
    return finish('/fitness/connect', 'error=token');
  }
}

/**
 * Stores the calendar refresh token in google_calendar_tokens and returns
 * to Brain. This branch never reads or writes google_health_tokens or
 * fitness_sync_state.
 */
async function completeCalendarConnect(
  code: string,
  userId: string,
  finish: (path: string, query: string) => NextResponse,
) {
  try {
    const tokens = await exchangeAuthCode(code);
    if (!tokens.refresh_token) return finish('/brain', 'calendar=token');
    const scope = tokens.scope ?? '';
    if (!hasScope(scope, CALENDAR_READONLY_SCOPE)) return finish('/brain', 'calendar=missing');

    const admin = createServiceClient();
    const now = new Date().toISOString();
    const { error } = await admin.from('google_calendar_tokens').upsert({
      user_id: userId,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      refresh_token_expires_at: tokens.refresh_token_expires_in
        ? new Date(Date.now() + tokens.refresh_token_expires_in * 1000).toISOString()
        : null,
      scopes: scope,
      connected_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' });
    if (error) return finish('/brain', 'calendar=save');
    return finish('/brain', 'calendar=connected');
  } catch (err) {
    if (err instanceof GoogleOAuthError && err.code === 'config') {
      return finish('/brain', 'calendar=config');
    }
    if (err instanceof Error && err.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return finish('/brain', 'calendar=save');
    }
    return finish('/brain', 'calendar=token');
  }
}
