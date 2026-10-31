import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getToday, shiftDate } from '@/lib/utils';
import { logFoodTurn, nutritionAiError } from '@/lib/nutrition-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to log food.' }, { status: 401 });

  let body: { message?: unknown; date?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a food description.' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: 'Describe what you ate in one message.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > shiftDate(getToday(), 1)) {
    return NextResponse.json({ error: 'Pick a day that is today or earlier.' }, { status: 400 });
  }

  try {
    const result = await logFoodTurn(supabase, user.id, date, message);
    return NextResponse.json({ ok: true, reply: result.reply });
  } catch (err) {
    console.error('nutrition log failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: nutritionAiError(err) }, { status: 502 });
  }
}
