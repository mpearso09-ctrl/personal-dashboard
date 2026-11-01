import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getToday, shiftDate } from '@/lib/utils';
import { nutritionAiError, transcribeAndLogFood } from '@/lib/nutrition-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4_000_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to log food.' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send an audio recording.' }, { status: 400 });
  }

  const date = String(form.get('date') ?? '').trim();
  const audio = form.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: 'The recording was empty. Tap the mic and try again.' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'That recording is too long. Stop sooner, or type the meal.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > shiftDate(getToday(), 1)) {
    return NextResponse.json({ error: 'Pick a day that is today or earlier.' }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const result = await transcribeAndLogFood(supabase, user.id, date, bytes);
    return NextResponse.json({
      ok: true,
      transcript: result.transcript,
      reply: result.reply,
      pending: result.pending,
    });
  } catch (err) {
    console.error('nutrition transcribe failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: nutritionAiError(err) }, { status: 502 });
  }
}
