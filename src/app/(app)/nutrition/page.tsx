'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Mic, Send, Square, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { audioFileName, preferredRecorderMime, recorderTimesliceMs } from '@/lib/meal-audio';
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
import { PENDING_FOOD_MESSAGE } from '@/lib/nutrition-meal';
import { cn, getToday } from '@/lib/utils';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; status: 'logged' | 'pending' };

type ActiveRecording = {
  recorder: MediaRecorder;
  stream: MediaStream;
  stopped: Promise<Blob>;
};

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
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const listeningRef = useRef(false);
  const pageAliveRef = useRef(true);
  const sendingRef = useRef(false);
  const dateRef = useRef(date);
  const mediaRef = useRef<ActiveRecording | null>(null);
  dateRef.current = date;

  const load = useCallback(async () => {
    if (!user) return;
    const [itemRes, settingRes, messageRes] = await Promise.all([
      supabase.from('nutrition_items').select('*').eq('user_id', user.id).eq('date', date).order('created_at'),
      supabase.from('nutrition_settings').select('tracked, targets').eq('user_id', user.id).maybeSingle(),
      supabase.from('nutrition_messages').select('id, role, content, status').eq('user_id', user.id).eq('date', date).order('created_at'),
    ]);
    const loadError = nutritionQueryMessage([itemRes.error, settingRes.error, messageRes.error]);
    if (loadError) {
      setError(loadError);
      return;
    }
    setError('');
    setItems(((itemRes.data ?? []) as Record<string, unknown>[]).map(normalizeItem));
    setSettings(normalizeSettings(settingRes.data));
    setMessages(((messageRes.data ?? []) as { id: string; role: 'user' | 'assistant'; content: string; status?: string }[]).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      status: row.status === 'pending' ? 'pending' : 'logged',
    })));
  }, [user, date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setNotice(''); }, [date]);

  const applyLogResponse = useCallback((res: Response, body: { error?: string; reply?: string; pending?: boolean }, restore?: string) => {
    if (!res.ok) {
      if (restore) setDraft(restore);
      setNotice('');
      setError(body.error || 'Could not log that meal.');
      return;
    }
    setError('');
    setNotice(body.pending ? (body.reply || PENDING_FOOD_MESSAGE) : '');
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
    setNotice('');
    setDraft('');
    try {
      const res = await fetch('/api/nutrition/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, date: dateRef.current }),
      });
      const body = await res.json().catch(() => ({}));
      applyLogResponse(res, body, text);
      await load();
    } catch {
      setDraft(text);
      setError('Could not reach the food parser.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [applyLogResponse, load, user]);

  const rerunMessage = useCallback(async (messageId: string) => {
    if (sendingRef.current || listeningRef.current || !user) return;
    sendingRef.current = true;
    setSending(true);
    setRerunningId(messageId);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/nutrition/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, date: dateRef.current }),
      });
      const body = await res.json().catch(() => ({}));
      applyLogResponse(res, body);
      await load();
    } catch {
      setError('Could not reach the food parser.');
    } finally {
      sendingRef.current = false;
      setSending(false);
      setRerunningId(null);
    }
  }, [applyLogResponse, load, user]);

  const uploadRecording = useCallback(async (blob: Blob) => {
    if (!user) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.set('audio', blob, audioFileName(blob.type));
      form.set('date', dateRef.current);
      const res = await fetch('/api/nutrition/transcribe', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && typeof body.transcript === 'string' && body.transcript.trim()) setDraft(body.transcript.trim());
      applyLogResponse(res, body);
      if (res.ok) await load();
    } catch {
      setError('Could not upload the recording.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [applyLogResponse, load, user]);

  const openMicrophone = useCallback(async () => {
    const audio = { echoCancellation: true, noiseSuppression: true };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError') throw err;
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }, []);

  async function startRecording() {
    if (sendingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Type what you ate instead.');
      return;
    }
    setError('');
    setNotice('');
    listeningRef.current = true;
    setListening(true);
    let stream: MediaStream;
    try {
      stream = await openMicrophone();
    } catch {
      listeningRef.current = false;
      setListening(false);
      setError('Microphone permission was blocked. Allow the mic for this site, or type the meal.');
      return;
    }
    if (!listeningRef.current || !pageAliveRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const mime = preferredRecorderMime({
      userAgent: navigator.userAgent,
      isSupported: (type) => {
        try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
      },
    });
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        listeningRef.current = false;
        setListening(false);
        setError('This browser cannot record audio. Type what you ate instead.');
        return;
      }
    }
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise<Blob>((resolve) => {
      recorder.addEventListener('stop', () => {
        window.setTimeout(() => {
          resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/mp4' }));
        }, 150);
      });
    });
    const chosen = recorder.mimeType || mime;
    const slice = recorderTimesliceMs(chosen);
    try {
      if (slice) recorder.start(slice);
      else recorder.start();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      listeningRef.current = false;
      setListening(false);
      setError('This browser cannot record audio. Type what you ate instead.');
      return;
    }
    mediaRef.current = { recorder, stream, stopped };
  }

  function stopRecording() {
    listeningRef.current = false;
    setListening(false);
    const media = mediaRef.current;
    if (!media) return;
    mediaRef.current = null;
    const { recorder, stream, stopped } = media;
    if (recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    void stopped.then((blob) => {
      stream.getTracks().forEach((track) => track.stop());
      if (!pageAliveRef.current) return;
      if (!blob.size) {
        setError('No audio was captured. Tap the mic and try again.');
        return;
      }
      void uploadRecording(blob);
    });
  }

  useEffect(() => () => {
    pageAliveRef.current = false;
    listeningRef.current = false;
    const media = mediaRef.current;
    mediaRef.current = null;
    if (!media) return;
    media.stream.getTracks().forEach((track) => track.stop());
    if (media.recorder.state !== 'inactive') {
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
        {messages.map((message) => {
          const pending = message.role === 'user' && message.status === 'pending';
          return (
            <div
              key={message.id}
              className={cn(
                'max-w-[40rem] rounded-2xl px-3 py-2 text-sm',
                message.role === 'user'
                  ? pending
                    ? 'ml-auto border border-amber-500/50 bg-amber-950 text-amber-50'
                    : 'ml-auto bg-blue-600 text-white'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-200',
              )}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === 'user' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {pending && <span className="text-xs font-medium">Not added to the log yet.</span>}
                  <button
                    type="button"
                    onClick={() => void rerunMessage(message.id)}
                    disabled={sending || listening}
                    className={cn(
                      'h-8 px-2 rounded-lg text-xs font-medium disabled:opacity-40',
                      pending ? 'bg-amber-200 text-amber-950' : 'bg-white/15 text-white',
                    )}
                  >
                    {rerunningId === message.id ? 'Parsing…' : 'Re-run'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form
        onSubmit={send}
        className="fixed left-0 right-0 lg:left-64 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur px-4 py-3"
      >
        <div className="max-w-7xl mx-auto flex items-end gap-2">
          <button
            type="button"
            onClick={toggleMic}
            disabled={sending}
            aria-pressed={listening}
            aria-label={listening ? 'Stop recording and save' : 'Start recording'}
            className={cn(
              'h-11 px-3 shrink-0 rounded-xl flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-40',
              listening ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-200',
            )}
          >
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
            {listening ? 'Stop' : 'Mic'}
          </button>
          <div className="flex-1 min-w-0">
            {listening && (
              <div role="status" className="mb-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2">
                <div className="text-xs font-medium text-rose-200">Recording — tap Stop to save</div>
                <p className="text-sm text-white mt-1">Speak the whole meal. It is transcribed after you stop.</p>
              </div>
            )}
            {notice && !error && (
              <div role="status" className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {notice}
              </div>
            )}
            {error && (
              <div role="alert" className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {error}
              </div>
            )}
            {sending && !error && !notice && (
              <p className="mb-2 text-xs text-zinc-400">Saving what you said…</p>
            )}
            <label htmlFor="food-draft" className="sr-only">What you ate</label>
            <textarea
              id="food-draft"
              rows={2}
              readOnly={listening}
              value={draft}
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
