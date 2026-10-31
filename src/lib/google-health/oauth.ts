import {
  GOOGLE_AUTH_URL,
  GOOGLE_HEALTH_SCOPES,
  GOOGLE_TOKEN_URL,
  googleHealthRedirectUri,
} from './config';

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

export function buildAuthUrl(state: string): string {
  const clientId = requiredEnv('GOOGLE_CLIENT_ID');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleHealthRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_HEALTH_SCOPES.join(' '),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
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
