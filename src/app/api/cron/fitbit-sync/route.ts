import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { fitbitEmailRequested } from '@/lib/google-health/config';
import { syncAllConnected } from '@/lib/google-health/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const actualBuffer = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * The daily Vercel cron omits this and asks for the report. Hourly runs pass
 * email=0 and stay silent. The report is sent only for the connected account
 * whose auth email is listed in FITBIT_REPORT_EMAIL; every account still syncs.
 */
function emailRequested(request: Request): boolean {
  return fitbitEmailRequested(new URL(request.url).searchParams.get('email'));
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const email = emailRequested(request);
    const results = await syncAllConnected({ email });
    const failed = results.filter((result) => !result.ok).length;
    return NextResponse.json({ ok: failed === 0, synced: results.length, failed, email, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
