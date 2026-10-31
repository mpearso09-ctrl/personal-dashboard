import { randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { OAUTH_STATE_COOKIE } from '@/lib/google-health/config';
import { buildAuthUrl, GoogleOAuthError } from '@/lib/google-health/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login);
  }

  const state = randomBytes(32).toString('hex');
  let authUrl: string;
  try {
    authUrl = buildAuthUrl(state);
  } catch (err) {
    const back = request.nextUrl.clone();
    back.pathname = '/fitness/connect';
    back.search = err instanceof GoogleOAuthError && err.code === 'config' ? 'error=config' : 'error=token';
    return NextResponse.redirect(back);
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
