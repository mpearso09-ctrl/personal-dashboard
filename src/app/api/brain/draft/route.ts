import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { draftErrorMessage, draftReply } from '@/lib/brain-draft';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Writes a suggested reply and returns it. This route does not send email,
 * does not call Gmail, and does not change the action item.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to draft a reply.' }, { status: 401 });

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Missing action item.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Missing action item.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('action_items')
    .select('title, summary, business, source_inbox')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not load that item.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'That item is not on your list.' }, { status: 404 });

  const row = data as { title: string; summary: string | null; business: string; source_inbox: string | null };
  try {
    const draft = await draftReply({
      title: row.title,
      summary: row.summary,
      business: row.business,
      sourceInbox: row.source_inbox,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    console.error('brain draft failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: draftErrorMessage(err) }, { status: 502 });
  }
}
