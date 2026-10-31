'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Mic, Send, Square, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import {
  dayTotals,
  formatMacro,
  macroByKey,
  macroStatus,
  normalizeItem,
  normalizeSettings,
  nutritionQueryMessage,
  syncFitnessNutritionFromFood,
  type NutritionItem,
  type NutritionMacroKey,
  type NutritionSettings,
} from '@/lib/nutrition';
import { commitTranscript, readSpeechResults } from '@/lib/speech-transcript';
import { cn, getToday } from '@/lib/utils';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

type SpeechResultEvent = { results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }> };
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechRecognition(): SpeechRec | null {
  if (typeof window === 'undefined') return null;
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'en-CA';
  // iOS cuts continuous mode off after a short phrase. Restart on onend instead.
  rec.continuous = false;
  rec.interimResults = true;
  return rec;
}

function recorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export default function NutritionPage() {
  const { user, loading } = useAuth();
  const supabase = createClient();
  const [date, setDate] = useState(getToday);
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('date');
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param) && param <= getToday()) setDate(param);
  }, []);
  const [items, setItems] = useState<NutritionItem[]>([]);
  const [settings, setSettings] = useState<NutritionSettings>(normalizeSettings(null));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState('');
  const [listening, setListening] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'speech' | 'audio' | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const listeningRef = useRef(false);
  const pageAliveRef = useRef(true);
  const sendingRef = useRef(false);
  const dateRef = useRef(date);
  const committedRef = useRef('');
  const sessionFinalRef = useRef('');
  const sessionInterimRef = useRef('');
  const recRef = useRef<SpeechRec | null>(null);
  const mediaRef = useRef<{ recorder: MediaRecorder; stream: MediaStream } | null>(null);
  dateRef.current = date;

  const load = useCallback(async () => {
    if (!user) return;
    const [itemRes, settingRes, messageRes] = await Promise.all([
      supabase.from('nutrition_items').select('*').eq('user_id', user.id).eq('date', date).order('created_at'),
      supabase.from('nutrition_settings').select('tracked, targets').eq('user_id', user.id).maybeSingle(),
      supabase.from('nutrition_messages').select('id, role, content').eq('user_id', user.id).eq('date', date).order('created_at'),
    ]);
    const loadError = nutritionQueryMessage([itemRes.error, settingRes.error, messageRes.error]);
    if (loadError) {
      setError(loadError);
      return;
    }
    setError('');
    setItems(((itemRes.data ?? []) as Record<string, unknown>[]).map(normalizeItem));
    setSettings(normalizeSettings(settingRes.data));
    setMessages((messageRes.data ?? []) as ChatMessage[]);
  }, [user, date]);

  useEffect(() => { load(); }, [load]);

  const publishLive = useCallback(() => {
    setLive(commitTranscript(committedRef.current, sessionFinalRef.current, sessionInterimRef.current));
  }, []);

  const submitMessage = useCallback(async (message: string) => {
    const text = message.trim();
    if (!text) {
      setError('Nothing was captured. Tap the mic, speak the meal, then tap stop.');
      return;
    }
    if (sendingRef.current || !user) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    setDraft('');
    setLive('');
    try {
      const res = await fetch('/api/nutrition/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, date: dateRef.current }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraft(text);
        setError(body.error || 'Could not log that meal.');
      }
      await load();
    } catch {
      setDraft(text);
      setError('Could not reach the food parser.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [load, user]);

  const finishSpeech = useCallback((submit: boolean) => {
    committedRef.current = commitTranscript(committedRef.current, sessionFinalRef.current, sessionInterimRef.current);
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    const text = committedRef.current.trim();
    publishLive();
    if (!submit) return;
    committedRef.current = '';
    setLive('');
    void submitMessage(text);
  }, [publishLive, submitMessage]);

  const startSpeech = useCallback(() => {
    const rec = speechRecognition();
    if (!rec) return false;
    rec.onresult = (event) => {
      const pieces = Array.from(event.results).map((result) => ({
        isFinal: result.isFinal,
        transcript: result[0]?.transcript ?? '',
      }));
      const spoken = readSpeechResults(pieces);
      sessionFinalRef.current = spoken.finalText;
      sessionInterimRef.current = spoken.interim;
      publishLive();
    };
    rec.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      if (event.error === 'not-allowed') {
        listeningRef.current = false;
        setListening(false);
        setError('Microphone permission was blocked. Allow the mic for this site, or type the meal.');
      }
    };
    rec.onend = () => {
      if (!pageAliveRef.current) return;
      const keepGoing = listeningRef.current;
      finishSpeech(false);
      if (!keepGoing) {
        finishSpeech(true);
        return;
      }
      try {
        rec.start();
      } catch {
        window.setTimeout(() => {
          if (!listeningRef.current || !pageAliveRef.current) return;
          try {
            rec.start();
          } catch {
            listeningRef.current = false;
            setListening(false);
            finishSpeech(true);
          }
        }, 200);
      }
    };
    try {
      rec.start();
    } catch {
      return false;
    }
    recRef.current = rec;
    return true;
  }, [finishSpeech, publishLive]);

  const uploadRecording = useCallback(async (blob: Blob) => {
    if (!user) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.set('audio', blob, blob.type.includes('webm') ? 'meal.webm' : 'meal.m4a');
      form.set('date', dateRef.current);
      const res = await fetch('/api/nutrition/transcribe', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof body.transcript === 'string' && body.transcript.trim()) setDraft(body.transcript.trim());
        setError(body.error || 'Could not transcribe that recording.');
        return;
      }
      setDraft('');
      setLive('');
      await load();
    } catch {
      setError('Could not upload the recording.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [load, user]);

  const startAudioRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Type what you ate instead.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = recorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/mp4' });
        mediaRef.current = null;
        if (!pageAliveRef.current) return;
        if (!blob.size) {
          setError('No audio was captured. Tap the mic and try again.');
          return;
        }
        void uploadRecording(blob);
      };
      recorder.start();
      mediaRef.current = { recorder, stream };
      setRecordingMode('audio');
      return true;
    } catch {
      setError('Microphone permission was blocked. Allow the mic for this site, or type the meal.');
      return false;
    }
  }, [uploadRecording]);

  function stopRecording() {
    listeningRef.current = false;
    setListening(false);
    if (recRef.current) {
      try { recRef.current.stop(); } catch { finishSpeech(true); }
      recRef.current = null;
      return;
    }
    const media = mediaRef.current;
    if (media && media.recorder.state !== 'inactive') {
      media.recorder.stop();
      return;
    }
    finishSpeech(true);
  }

  async function startRecording() {
    setError('');
    committedRef.current = draft.trim();
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    listeningRef.current = true;
    setListening(true);
    publishLive();
    if (startSpeech()) {
      setRecordingMode('speech');
      return;
    }
    const started = await startAudioRecording();
    if (!started) {
      listeningRef.current = false;
      setListening(false);
      setRecordingMode(null);
    }
  }

  useEffect(() => () => {
    pageAliveRef.current = false;
    listeningRef.current = false;
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    const media = mediaRef.current;
    media?.stream.getTracks().forEach((track) => track.stop());
    if (media && media.recorder.state !== 'inactive') {
      try { media.recorder.stop(); } catch { /* already stopped */ }
    }
  }, []);

  function toggleMic() {
    if (listeningRef.current) stopRecording();
    else void startRecording();
  }

  function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (listeningRef.current) stopRecording();
    else void submitMessage(draft);
  }

  async function removeItem(id: string, name: string) {
    if (!user || !confirm(`Remove ${name}?`)) return;
    const { error: deleteError } = await supabase.from('nutrition_items').delete().eq('id', id).eq('user_id', user.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    try {
      await syncFitnessNutritionFromFood(supabase, user.id, date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the fitness totals.');
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function saveItem(item: NutritionItem) {
    if (!user) return;
    const { error: updateError } = await supabase.from('nutrition_items').update({
      name: item.name.trim().slice(0, 120),
      quantity: item.quantity?.trim().slice(0, 80) || null,
      calories: item.calories,
      protein_g: item.protein_g,
      fat_g: item.fat_g,
      carbs_g: item.carbs_g,
      fiber_g: item.fiber_g,
      sugar_g: item.sugar_g,
      sodium_mg: item.sodium_mg,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id).eq('user_id', user.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    try {
      await syncFitnessNutritionFromFood(supabase, user.id, date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the fitness totals.');
    }
    setEditing(null);
    await load();
  }

  const totals = dayTotals(items, settings);

  if (loading || !user) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="space-y-4 pb-40">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Food log</h1>
          <p className="text-sm text-zinc-500 mt-1">Halifax day. Estimates, so correct anything that looks off.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-400">
            Day
            <input
              type="date"
              value={date}
              max={getToday()}
              onChange={(event) => setDate(event.target.value)}
              className="ml-2 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-white"
            />
          </label>
          <Link href="/nutrition/settings" className="text-sm text-blue-400 hover:text-blue-300">What I track</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {totals.map((total) => {
          const status = macroStatus(total);
          return (
            <div key={total.key} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
              <div className="text-xs text-zinc-500">{total.label}</div>
              <div className={cn('text-lg font-semibold', status === 'off' ? 'text-amber-300' : 'text-white')}>
                {formatMacro(total.key, total.value)}
                <span className="text-sm font-normal text-zinc-500">
                  {total.target != null ? ` / ${formatMacro(total.key, total.target)}` : ''} {total.unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-zinc-500">No foods for this day yet.</p>}
        {items.map((item) => (
          <FoodRow
            key={item.id}
            item={item}
            tracked={settings.tracked}
            editing={editing === item.id}
            onEdit={() => setEditing(item.id)}
            onCancel={() => setEditing(null)}
            onSave={saveItem}
            onDelete={() => removeItem(item.id, item.name)}
          />
        ))}
      </div>

      <div className="space-y-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'max-w-[40rem] rounded-2xl px-3 py-2 text-sm',
              message.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-200',
            )}
          >
            {message.content}
          </div>
        ))}
      </div>

      <form
        onSubmit={send}
        className="fixed left-0 right-0 lg:left-64 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur px-4 py-3"
      >
        <div className="max-w-7xl mx-auto flex items-end gap-2">
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? 'Stop recording and save' : 'Start recording'}
            className={cn(
              'h-11 px-3 shrink-0 rounded-xl flex items-center justify-center gap-2 text-sm font-medium',
              listening ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-200',
            )}
          >
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
            {listening ? 'Stop' : 'Mic'}
          </button>
          <div className="flex-1 min-w-0">
            {listening && (
              <div role="status" className="mb-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2">
                <div className="text-xs font-medium text-rose-200">
                  {recordingMode === 'audio' ? 'Recording audio' : 'Recording'} — tap Stop to save
                </div>
                <p className="text-sm text-white mt-1">{live || 'Listening…'}</p>
              </div>
            )}
            {error && (
              <div role="alert" className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {error}
              </div>
            )}
            {sending && !error && (
              <p className="mb-2 text-xs text-zinc-400">Saving what you said…</p>
            )}
            <label htmlFor="food-draft" className="sr-only">What you ate</label>
            <textarea
              id="food-draft"
              rows={2}
              readOnly={listening}
              value={listening ? live : draft}
              onChange={(event) => { if (!listening) setDraft(event.target.value); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Here's what I ate today: 2 eggs, toast with butter…"
              className="w-full resize-none rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:opacity-80"
            />
          </div>
          <button
            type="submit"
            disabled={sending || (!listening && !draft.trim())}
            aria-label="Log this food"
            className="h-11 w-11 shrink-0 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function FoodRow({
  item,
  tracked,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  item: NutritionItem;
  tracked: NutritionMacroKey[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (item: NutritionItem) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(item);
  useEffect(() => { setDraft(item); }, [item]);

  if (!editing) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 flex items-start gap-3">
        <button type="button" onClick={onEdit} className="flex-1 text-left">
          <div className="text-white text-sm font-medium">{item.name}{item.quantity ? <span className="text-zinc-400 font-normal"> · {item.quantity}</span> : null}</div>
          <div className="text-xs text-zinc-500 mt-1">
            {tracked.map((key) => `${macroByKey(key).label} ${formatMacro(key, item[key])}`).join(' · ')}
          </div>
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete ${item.name}`} className="h-9 w-9 rounded-lg text-zinc-400 hover:text-rose-300 hover:bg-zinc-800 flex items-center justify-center">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <form
      className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 space-y-2"
      onSubmit={(event) => { event.preventDefault(); onSave(draft); }}
    >
      <input
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        aria-label="Food name"
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
      />
      <input
        value={draft.quantity ?? ''}
        onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
        aria-label="Portion"
        placeholder="Portion"
        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tracked.map((key) => (
          <label key={key} className="text-xs text-zinc-400">
            {macroByKey(key).label}
            <input
              type="number"
              min="0"
              step={macroByKey(key).digits ? '0.1' : '1'}
              value={draft[key] ?? ''}
              onChange={(event) => {
                const next = event.target.value === '' ? null : Number(event.target.value);
                setDraft({ ...draft, [key]: next != null && Number.isFinite(next) ? next : null });
              }}
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="submit" className="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm">Save</button>
        <button type="button" onClick={onCancel} className="h-9 px-3 rounded-lg bg-zinc-800 text-zinc-200 text-sm">Cancel</button>
      </div>
    </form>
  );
}
