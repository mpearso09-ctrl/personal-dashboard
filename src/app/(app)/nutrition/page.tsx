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
  syncFitnessNutritionFromFood,
  type NutritionItem,
  type NutritionMacroKey,
  type NutritionSettings,
} from '@/lib/nutrition';
import { cn, getToday } from '@/lib/utils';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

type SpeechResult = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognition(): SpeechRec | null {
  if (typeof window === 'undefined') return null;
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'en-CA';
  rec.interimResults = true;
  rec.continuous = false;
  return rec;
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
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const recRef = useRef<SpeechRec | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [itemRes, settingRes, messageRes] = await Promise.all([
      supabase.from('nutrition_items').select('*').eq('user_id', user.id).eq('date', date).order('created_at'),
      supabase.from('nutrition_settings').select('tracked, targets').eq('user_id', user.id).maybeSingle(),
      supabase.from('nutrition_messages').select('id, role, content').eq('user_id', user.id).eq('date', date).order('created_at'),
    ]);
    if (itemRes.error || settingRes.error || messageRes.error) {
      setError('The food log tables are not in the database yet. Run the nutrition migration, then reload.');
      return;
    }
    setError('');
    setItems(((itemRes.data ?? []) as Record<string, unknown>[]).map(normalizeItem));
    setSettings(normalizeSettings(settingRes.data));
    setMessages((messageRes.data ?? []) as ChatMessage[]);
  }, [user, date]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => { recRef.current?.stop(); }, []);

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = recognition();
    if (!rec) {
      setVoiceNote('This browser has no speech recognition. Type the meal instead. Chrome on Android and Safari on iPhone usually have the mic.');
      return;
    }
    setVoiceNote('');
    rec.onresult = (event) => {
      let finalText = '';
      let live = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) finalText += piece;
        else live += piece;
      }
      if (finalText.trim()) {
        setDraft((current) => `${current ? `${current.trim()} ` : ''}${finalText.trim()}`);
        setInterim('');
      } else {
        setInterim(live);
      }
    };
    rec.onerror = () => {
      setListening(false);
      setVoiceNote('The microphone did not start. Check permission, or type the meal.');
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setVoiceNote('The microphone did not start. Check permission, or type the meal.');
    }
  }

  const pending = `${draft}${interim ? `${draft ? ' ' : ''}${interim}` : ''}`.trim();

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const message = pending;
    if (!message || sending || !user) return;
    setSending(true);
    setError('');
    setDraft('');
    setInterim('');
    try {
      const res = await fetch('/api/nutrition/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, date }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraft(message);
        setError(body.error || 'Could not log that meal.');
      }
      await load();
    } catch {
      setDraft(message);
      setError('Could not reach the food parser.');
    } finally {
      setSending(false);
    }
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
            aria-label={listening ? 'Stop microphone' : 'Speak what you ate'}
            className={cn(
              'h-11 w-11 shrink-0 rounded-xl flex items-center justify-center',
              listening ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-200',
            )}
          >
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
          <div className="flex-1">
            <label htmlFor="food-draft" className="sr-only">What you ate</label>
            <textarea
              id="food-draft"
              rows={2}
              value={interim ? `${draft}${draft ? ' ' : ''}${interim}` : draft}
              onChange={(event) => { setDraft(event.target.value); setInterim(''); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Here's what I ate today: 2 eggs, toast with butter…"
              className="w-full resize-none rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(voiceNote || error || sending) && (
              <p className={cn('mt-1 text-xs', error ? 'text-amber-300' : 'text-zinc-500')}>
                {error || voiceNote || (sending ? 'Estimating…' : '')}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={sending || !pending}
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
