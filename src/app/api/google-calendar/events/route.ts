import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createServiceClient } from '@/lib/supabase-admin';
import { CalendarApiError, listTodayEvents } from '@/lib/google-calendar/events';
import { calendarAccessForUser } from '@/lib/google-calendar/tokens';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false, events: [] }, { status: 401 });

  try {
    const admin = createServiceClient();
    const access = await calendarAccessForUser(admin, user.id);
    if (!access.connected) {
      return NextResponse.json({ connected: false, events: [], reason: access.reason });
    }
    const events = await listTodayEvents(access.accessToken);
    return NextResponse.json({
      connected: true,
      events: events.map(({ id, title, when, allDay }) => ({ id, title, when, allDay })),
    });
  } catch (err) {
    if (err instanceof CalendarApiError && (err.status === 401 || err.status === 403)) {
      return NextResponse.json({ connected: false, events: [], reason: 'missing_scope' });
    }
    const message = err instanceof Error ? err.message : '';
    if (/google_calendar_tokens|schema cache|does not exist/i.test(message)) {
      return NextResponse.json({ connected: false, events: [], reason: 'not_connected' });
    }
    console.error('calendar events failed', message || err);
    return NextResponse.json({ connected: false, events: [], reason: 'error' }, { status: 502 });
  }
}
