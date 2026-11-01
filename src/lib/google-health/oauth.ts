import {
  CALENDAR_OAUTH_PREFIX,
  CALENDAR_READONLY_SCOPE,
  GOOGLE_AUTH_URL,
  GOOGLE_HEALTH_SCOPES,
  GOOGLE_TOKEN_URL,
  googleHealthRedirectUri,
} from './config.ts';

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
};

export class GoogleOAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoogleOAuthError';
    this.code = code;
  }
}

type AuthUrlOptions = {
  scopes?: readonly string[];
  /** Health consent keeps previously granted scopes. Calendar consent does not. */
  includeGrantedScopes?: boolean;
};

export function buildAuthUrl(state: string, options?: AuthUrlOptions): string {
  const clientId = requiredEnv('GOOGLE_CLIENT_ID');
  const scopes = options?.scopes ?? GOOGLE_HEALTH_SCOPES;
  const includeGrantedScopes = options?.includeGrantedScopes !== false;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleHealthRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes.join(' '),
    state,
  });
  if (includeGrantedScopes) params.set('include_granted_scopes', 'true');
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Calendar consent reuses the Fitbit redirect URI and OAuth client, but it
 * asks only for calendar.readonly and does not send include_granted_scopes.
 * The consent screen therefore does not invite Mike to untick Fitbit access,
 * and the new refresh token is stored in google_calendar_tokens, not in
 * google_health_tokens.
 */
export function buildCalendarAuthUrl(state: string): string {
  return buildAuthUrl(state, {
    scopes: [CALENDAR_READONLY_SCOPE],
    includeGrantedScopes: false,
  });
}

export function isCalendarOAuthState(state: string | null | undefined): boolean {
  return typeof state === 'string' && state.startsWith(CALENDAR_OAUTH_PREFIX);
}

export async function exchangeAuthCode(code: string): Promise<GoogleTokenResponse> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: googleHealthRedirectUri(),
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
  });
}

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = (await response.json().catch(() => ({}))) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || json.error || !json.access_token) {
    const code = json.error || `http_${response.status}`;
    throw new GoogleOAuthError(code, json.error_description || 'Google token request failed');
  }
  return json;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new GoogleOAuthError('config', `${name} is not set`);
  return value;
}
