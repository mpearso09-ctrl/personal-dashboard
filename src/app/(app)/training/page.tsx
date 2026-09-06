'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatDate, getToday } from '@/lib/utils';
import { DEFAULT_GYM_EXERCISES } from '@/lib/types';
import type { TrainingSession, SessionType, RunSubtype, GymExercise, MilestoneType, MilestoneEntry } from '@/lib/types';
import {
  Zap, Footprints, Dumbbell, Flame, Check, ChevronLeft, ChevronRight,
  Trash2, Plus, Minus, Trophy, CalendarDays, X, Sunset,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TYPES: { key: SessionType; label: string; icon: typeof Zap; color: string; bg: string; hex: string }[] = [
  { key: 'run', label: 'Run', icon: Footprints, color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/40', hex: '#38bdf8' },
  { key: 'crossfit', label: 'CrossFit', icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/40', hex: '#fb923c' },
  { key: 'gym', label: 'Gym', icon: Dumbbell, color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/40', hex: '#a78bfa' },
  { key: 'walk', label: 'Walk', icon: Sunset, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/40', hex: '#34d399' },
];
const LEGACY_HYROX = { key: 'hyrox' as SessionType, label: 'HYROX', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/40', hex: '#facc15' };
const typeOf = (k: SessionType) => TYPES.find((t) => t.key === k) ?? LEGACY_HYROX;

const RUN_SUBTYPES: { key: RunSubtype; label: string; hint: string }[] = [
  { key: 'distance', label: 'Distance', hint: '5K · 10K · 15K' },
  { key: 'vo2', label: 'VO2 Intervals', hint: '4 min @ 98% · 3 min walk × 4' },
  { key: 'sprints', label: 'Sprints', hint: 'short all-out efforts' },
];

// milestone auto-PR matching for distance runs (±5%)
const RUN_MILESTONES: { km: number; name: string }[] = [
  { km: 1, name: '1KM Run' }, { km: 2, name: '2KM Run' }, { km: 5, name: '5K Run' },
  { km: 10, name: '10KM Run' }, { km: 21.1, name: '21KM Half Marathon' },
];

const LIFT_COLORS = ['#a78bfa', '#38bdf8', '#fb923c', '#facc15', '#34d399', '#f472b6'];

const freshGym = (): GymExercise[] => DEFAULT_GYM_EXERCISES.map((e) => ({ name: e.name, target_sets: 4, target_reps: 12, weight: null, done: [false, false, false, false] }));

function shiftDate(date: string, days: number) { const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; }
function mondayOf(date: string) { const d = new Date(date + 'T00:00:00'); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().split('T')[0]; }
function fmtTime(min: number | null) { if (min == null) return '—'; const s = Math.round(min * 60); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; }
function parseTime(v: string): number | null { if (!v.trim()) return null; const p = v.split(':').map(Number); if (p.some(isNaN)) return null; if (p.length === 1) return p[0]; if (p.length === 2) return p[0] + p[1] / 60; return p[0] * 60 + p[1] + p[2] / 60; }
function pace(min: number | null, km: number | null) { if (!min || !km) return null; return min / km; }
function fmtPace(p: number | null) { if (p == null) return '—'; const m = Math.floor(p), s = Math.round((p - m) * 60); return `${m}:${String(s).padStart(2, '0')}/km`; }
function shortDate(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function shortDay(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }); }

/** one-line summary of a session */
function summary(s: TrainingSession): string {
  if (s.type === 'run') {
    if (s.subtype === 'vo2') return `${s.rounds ?? 4} × ${Math.round((s.work_sec ?? 240) / 60)}/${Math.round((s.rest_sec ?? 180) / 60)} min${s.avg_hr ? ` · ${s.avg_hr} bpm` : ''}`;
    if (s.subtype === 'sprints') return `${s.rounds ?? '—'} sprints${s.distance_km ? ` · ${s.distance_km} km` : ''}`;
    return `${s.distance_km ?? '—'} km · ${fmtTime(s.duration_min)} · ${fmtPace(pace(s.duration_min, s.distance_km))}`;
  }
  if (s.type === 'walk') return `${s.distance_km ?? '—'} km · ${fmtTime(s.duration_min)}${s.avg_hr ? ` · ${s.avg_hr} bpm` : ''}`;
  if (s.type === 'gym') { const ex = s.exercises ?? []; const done = ex.reduce((a, e) => a + e.done.filter(Boolean).length, 0); const tot = ex.reduce((a, e) => a + e.target_sets, 0); return `${done}/${tot} sets`; }
  return `${s.duration_min ? fmtTime(s.duration_min) : '—'}${s.rpe ? ` · RPE ${s.rpe}` : ''}${s.subtype === 'hyrox_class' ? ' · HYROX class' : ''}`;
}

// ---------------------------------------------------------------------------
// Inputs (module-level so they keep focus between keystrokes)
// ---------------------------------------------------------------------------

function Num({ label, value, onChange, unit, step = '1', mode = 'decimal' }: { label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; step?: string; mode?: 'decimal' | 'numeric' }) {
  return (
    <label className="bg-zinc-800/60 rounded-xl p-3 block">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-baseline gap-1"><input type="number" inputMode={mode} step={step} value={value ?? ''} placeholder="—" onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className="w-full bg-transparent text-2xl font-semibold text-white tabular-nums outline-none placeholder:text-zinc-600" />{unit && <span className="text-zinc-500 text-sm">{unit}</span>}</div>
    </label>
  );
}

function Rpe({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="bg-zinc-800/60 rounded-xl p-3"><span className="text-xs text-zinc-400">Effort (RPE)</span>
      <div className="grid grid-cols-10 gap-1 mt-2">{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button key={n} onClick={() => onChange(value === n ? null : n)} className={cn('h-10 rounded-lg text-sm font-medium', value === n ? (n >= 8 ? 'bg-red-500 text-white' : n >= 5 ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-black') : 'bg-zinc-900 text-zinc-400')}>{n}</button>))}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Draft = Omit<TrainingSession, 'id' | 'user_id' | 'created_at'>;
const emptyDraft = (date: string, type: SessionType): Draft => ({
  date, type, subtype: type === 'run' ? 'distance' : type === 'crossfit' ? 'class' : null,
  duration_min: null, distance_km: null, avg_hr: null, max_hr: null, rpe: null,
  rounds: type === 'run' ? 4 : null, work_sec: 240, rest_sec: 180,
  exercises: type === 'gym' ? freshGym() : null, notes: null,
});

export default function TrainingPage() {
  const { user, loading } = useAuth();
  const supabase = createClient();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [date, setDate] = useState(getToday());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [timeText, setTimeText] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('training_sessions').select('*').eq('user_id', user.id)
      .gte('date', shiftDate(getToday(), -180)).order('date', { ascending: false }).order('created_at', { ascending: false });
    setSessions((data as TrainingSession[]) ?? []);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  // ------------------------------------------------------------------ start
  const start = (type: SessionType) => {
    const d = emptyDraft(date, type);
    if (type === 'gym') {
      // prefill last weights
      const last = sessions.find((s) => s.type === 'gym' && s.exercises);
      if (last?.exercises) d.exercises = d.exercises!.map((e) => ({ ...e, weight: last.exercises!.find((x) => x.name === e.name)?.weight ?? null }));
    }
    setDraft(d); setTimeText('');
  };

  // ------------------------------------------------------------------ save
  const save = async () => {
    if (!user || !draft) return;
    setSaving(true);
    const payload = { ...draft, user_id: user.id, duration_min: draft.duration_min ?? parseTime(timeText) };
    const { error } = await supabase.from('training_sessions').insert(payload);
    if (error) { setSaving(false); setToast('Save failed'); setTimeout(() => setToast(null), 2500); return; }
    // mark the day's workout toggle (walks also tick evening_walk)
    const flags = draft.type === 'walk' ? { workout: true, evening_walk: true } : { workout: true };
    const { data: fd } = await supabase.from('fitness_daily').select('id').eq('user_id', user.id).eq('date', draft.date).maybeSingle();
    if (fd) await supabase.from('fitness_daily').update(flags).eq('id', fd.id);
    else await supabase.from('fitness_daily').insert({ user_id: user.id, date: draft.date, ...flags });
    // auto-PR for distance runs
    let pr = false;
    if (draft.type === 'run' && draft.subtype === 'distance' && payload.duration_min && draft.distance_km) {
      const m = RUN_MILESTONES.find((r) => Math.abs(r.km - draft.distance_km!) / r.km <= 0.05);
      if (m) pr = await logRunMilestone(m.name, Math.round(payload.duration_min * 60), draft.date);
    }
    setSaving(false); setDraft(null);
    setToast(pr ? '🎉 New PR logged!' : 'Session saved');
    setTimeout(() => setToast(null), 2500);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pr ? [30, 60, 30] : 15);
    load();
  };

  const logRunMilestone = async (name: string, seconds: number, d: string): Promise<boolean> => {
    if (!user) return false;
    const { data: type } = await supabase.from('milestone_types').select('*').eq('user_id', user.id).eq('name', name).maybeSingle();
    if (!type) return false;
    const { data: prev } = await supabase.from('milestone_entries').select('value').eq('milestone_type_id', (type as MilestoneType).id).order('value').limit(1);
    const isPr = !prev?.length || seconds < (prev[0] as MilestoneEntry).value;
    await supabase.from('milestone_entries').insert({ user_id: user.id, milestone_type_id: (type as MilestoneType).id, rep_max: null, value: seconds, date: d, notes: 'Auto-logged from Training', is_pr: isPr });
    return isPr;
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this session?')) return;
    await supabase.from('training_sessions').delete().eq('id', id);
    load();
  };

  // ------------------------------------------------------------------ derived
  const weekStart = mondayOf(getToday());
  const thisWeek = useMemo(() => sessions.filter((s) => s.date >= weekStart), [sessions, weekStart]);
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  const monthKey = getToday().slice(0, 7);
  const thisMonth = useMemo(() => sessions.filter((s) => s.date.startsWith(monthKey)), [sessions, monthKey]);
  const countBy = (rows: TrainingSession[], t: SessionType) => rows.filter((s) => s.type === t).length;
  const runKm = (rows: TrainingSession[]) => rows.filter((s) => s.type === 'run').reduce((a, s) => a + (s.distance_km ?? 0), 0);

  const paceTrend = useMemo(() => sessions.filter((s) => s.type === 'run' && s.subtype === 'distance' && s.duration_min && s.distance_km)
    .map((s) => ({ date: s.date, pace: +(pace(s.duration_min, s.distance_km)!).toFixed(2), km: s.distance_km })).reverse(), [sessions]);
  const liftTrend = useMemo(() => {
    const rows = sessions.filter((s) => s.type === 'gym' && s.exercises).reverse();
    return rows.map((s) => { const o: Record<string, string | number | null> = { date: s.date }; s.exercises!.forEach((e) => { o[e.name] = e.weight; }); return o; });
  }, [sessions]);
  const weeklyVolume = useMemo(() => {
    const m = new Map<string, Record<SessionType, number>>();
    sessions.forEach((s) => { const k = mondayOf(s.date); const w = m.get(k) ?? { run: 0, crossfit: 0, gym: 0, walk: 0, hyrox: 0 }; w[s.type]++; m.set(k, w); });
    return [...m.entries()].sort().slice(-8).map(([k, w]) => ({ week: shortDate(k), ...w }));
  }, [sessions]);
  const dateSessions = sessions.filter((s) => s.date === date);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (!user) return <p className="text-zinc-400 p-8">Please sign in.</p>;

  const tip = { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 };
  const axis = { stroke: '#52525b', fontSize: 11 };
  // ------------------------------------------------------------------ form
  const renderForm = () => {
    if (!draft) return null;
    const T = typeOf(draft.type); const Icon = T.icon;
    return (
      <Card className={cn('border', T.bg)}>
        <div className="flex items-center justify-between mb-3">
          <div className={cn('flex items-center gap-2 font-semibold', T.color)}><Icon className="h-5 w-5" />{T.label} · {date === getToday() ? 'Today' : formatDate(date)}</div>
          <button onClick={() => setDraft(null)} className="h-9 w-9 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>

        {draft.type === 'run' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">{RUN_SUBTYPES.map((r) => (
              <button key={r.key} onClick={() => setDraft({ ...draft, subtype: r.key, rounds: r.key === 'vo2' ? 4 : r.key === 'sprints' ? 8 : null })} className={cn('rounded-xl border p-2.5 text-left', draft.subtype === r.key ? 'bg-sky-500/20 border-sky-400 text-white' : 'bg-zinc-800/60 border-zinc-700 text-zinc-400')}>
                <div className="text-sm font-medium">{r.label}</div><div className="text-[10px] opacity-70 leading-tight mt-0.5">{r.hint}</div></button>))}</div>
            {draft.subtype === 'distance' && (
              <div className="grid grid-cols-2 gap-2">
                <Num label="Distance" unit="km" step="0.1" value={draft.distance_km} onChange={(v) => setDraft({ ...draft, distance_km: v })} />
                <label className="bg-zinc-800/60 rounded-xl p-3 block"><span className="text-xs text-zinc-400">Time (mm:ss)</span>
                  <input value={timeText} onChange={(e) => { setTimeText(e.target.value); setDraft({ ...draft, duration_min: parseTime(e.target.value) }); }} placeholder="27:30" inputMode="numeric" className="w-full bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-zinc-600" /></label>
                <Num label="Avg HR" unit="bpm" value={draft.avg_hr} onChange={(v) => setDraft({ ...draft, avg_hr: v })} mode="numeric" />
                <Num label="Max HR" unit="bpm" value={draft.max_hr} onChange={(v) => setDraft({ ...draft, max_hr: v })} mode="numeric" />
                <div className="col-span-2 flex items-center justify-between bg-zinc-900/60 rounded-xl px-3 py-2 text-sm"><span className="text-zinc-400">Pace</span><span className="text-white font-semibold tabular-nums">{fmtPace(pace(draft.duration_min, draft.distance_km))}</span>
                  {draft.distance_km && RUN_MILESTONES.some((r) => Math.abs(r.km - draft.distance_km!) / r.km <= 0.05) && <span className="text-xs text-amber-400 flex items-center gap-1"><Trophy className="h-3.5 w-3.5" />checks PR</span>}</div>
              </div>
            )}
            {draft.subtype === 'vo2' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 bg-zinc-800/60 rounded-xl p-3 flex items-center justify-between"><span className="text-xs text-zinc-400">Rounds</span>
                  <div className="flex items-center gap-2"><button onClick={() => setDraft({ ...draft, rounds: Math.max(1, (draft.rounds ?? 4) - 1) })} className="h-10 w-10 rounded-lg bg-zinc-900 text-zinc-300 flex items-center justify-center"><Minus className="h-4 w-4" /></button><span className="text-2xl font-semibold text-white w-8 text-center">{draft.rounds ?? 4}</span><button onClick={() => setDraft({ ...draft, rounds: (draft.rounds ?? 4) + 1 })} className="h-10 w-10 rounded-lg bg-zinc-900 text-zinc-300 flex items-center justify-center"><Plus className="h-4 w-4" /></button></div></div>
                <Num label="Work" unit="min" value={(draft.work_sec ?? 240) / 60} onChange={(v) => setDraft({ ...draft, work_sec: v == null ? null : Math.round(v * 60) })} step="0.5" />
                <Num label="Walk" unit="min" value={(draft.rest_sec ?? 180) / 60} onChange={(v) => setDraft({ ...draft, rest_sec: v == null ? null : Math.round(v * 60) })} step="0.5" />
                <Num label="Avg HR" unit="bpm" value={draft.avg_hr} onChange={(v) => setDraft({ ...draft, avg_hr: v })} mode="numeric" />
                <Num label="Max HR" unit="bpm" value={draft.max_hr} onChange={(v) => setDraft({ ...draft, max_hr: v })} mode="numeric" />
                <Num label="Distance (opt)" unit="km" step="0.1" value={draft.distance_km} onChange={(v) => setDraft({ ...draft, distance_km: v })} />
                <div className="bg-zinc-900/60 rounded-xl p-3 text-sm flex flex-col justify-center"><span className="text-xs text-zinc-400">Total</span><span className="text-white font-semibold">{Math.round(((draft.rounds ?? 4) * ((draft.work_sec ?? 240) + (draft.rest_sec ?? 180))) / 60)} min</span></div>
              </div>
            )}
            {draft.subtype === 'sprints' && (
              <div className="grid grid-cols-2 gap-2">
                <Num label="Sprints" value={draft.rounds} onChange={(v) => setDraft({ ...draft, rounds: v })} mode="numeric" />
                <Num label="Rest" unit="s" value={draft.rest_sec} onChange={(v) => setDraft({ ...draft, rest_sec: v })} mode="numeric" />
                <Num label="Total distance" unit="km" step="0.1" value={draft.distance_km} onChange={(v) => setDraft({ ...draft, distance_km: v })} />
                <Num label="Max HR" unit="bpm" value={draft.max_hr} onChange={(v) => setDraft({ ...draft, max_hr: v })} mode="numeric" />
              </div>
            )}
            <Rpe value={draft.rpe} onChange={(v) => setDraft({ ...draft, rpe: v })} />
          </div>
        )}

        {(draft.type === 'crossfit' || draft.type === 'hyrox') && (
          <div className="space-y-3">
            {draft.type === 'crossfit' && (
              <div className="grid grid-cols-2 gap-2">{[{ k: 'class', l: 'Regular class' }, { k: 'hyrox_class', l: 'HYROX class' }].map((o) => (
                <button key={o.k} onClick={() => setDraft({ ...draft, subtype: o.k })} className={cn('rounded-xl border p-3 text-sm font-medium', draft.subtype === o.k ? 'bg-orange-500/20 border-orange-400 text-white' : 'bg-zinc-800/60 border-zinc-700 text-zinc-400')}>{o.l}</button>))}</div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="bg-zinc-800/60 rounded-xl p-3 block"><span className="text-xs text-zinc-400">{draft.type === 'hyrox' ? 'Finish time (h:mm:ss)' : 'Duration (mm:ss)'}</span>
                <input value={timeText} onChange={(e) => { setTimeText(e.target.value); setDraft({ ...draft, duration_min: parseTime(e.target.value) }); }} placeholder={draft.type === 'hyrox' ? '1:25:00' : '60:00'} inputMode="numeric" className="w-full bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-zinc-600" /></label>
              <Num label="Avg HR" unit="bpm" value={draft.avg_hr} onChange={(v) => setDraft({ ...draft, avg_hr: v })} mode="numeric" />
            </div>
            <Rpe value={draft.rpe} onChange={(v) => setDraft({ ...draft, rpe: v })} />
            <textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder={draft.type === 'hyrox' ? 'Station splits, what broke down…' : 'WOD / what you did…'} rows={2} className="w-full bg-zinc-800/60 rounded-xl p-3 text-sm text-white placeholder:text-zinc-600 outline-none resize-none" />
          </div>
        )}

        {draft.type === 'walk' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Num label="Distance" unit="km" step="0.1" value={draft.distance_km} onChange={(v) => setDraft({ ...draft, distance_km: v })} />
              <label className="bg-zinc-800/60 rounded-xl p-3 block"><span className="text-xs text-zinc-400">Time (mm:ss)</span>
                <input value={timeText} onChange={(e) => { setTimeText(e.target.value); setDraft({ ...draft, duration_min: parseTime(e.target.value) }); }} placeholder="35:00" inputMode="numeric" className="w-full bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-zinc-600" /></label>
              <Num label="Avg HR" unit="bpm" value={draft.avg_hr} onChange={(v) => setDraft({ ...draft, avg_hr: v })} mode="numeric" />
              <div className="bg-zinc-900/60 rounded-xl p-3 text-sm flex flex-col justify-center"><span className="text-xs text-zinc-400">Pace</span><span className="text-white font-semibold tabular-nums">{fmtPace(pace(draft.duration_min, draft.distance_km))}</span></div>
            </div>
            <textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Route, who with…" rows={2} className="w-full bg-zinc-800/60 rounded-xl p-3 text-sm text-white placeholder:text-zinc-600 outline-none resize-none" />
            <div className="text-xs text-emerald-400/80">Logging this also ticks Workout and Evening Walk on your Fitness page.</div>
          </div>
        )}

        {draft.type === 'gym' && draft.exercises && (
          <div className="space-y-2">
            {draft.exercises.map((ex, i) => {
              const doneN = ex.done.filter(Boolean).length; const all = doneN === ex.target_sets;
              const setEx = (patch: Partial<GymExercise>) => setDraft({ ...draft, exercises: draft.exercises!.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
              return (
                <div key={ex.name} className={cn('rounded-xl px-3 py-2.5 border', all ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-zinc-800/60 border-transparent')}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0"><div className={cn('text-sm font-medium truncate', all ? 'text-emerald-300' : 'text-white')}>{ex.name}</div><div className="text-[11px] text-zinc-500">{ex.target_sets} × {ex.target_reps}</div></div>
                    <div className="flex items-center gap-1 bg-zinc-900 rounded-lg px-2 h-10"><input type="number" inputMode="decimal" step="2.5" value={ex.weight ?? ''} placeholder="lbs" onChange={(e) => setEx({ weight: e.target.value === '' ? null : Number(e.target.value) })} className="w-14 bg-transparent text-white text-right outline-none placeholder:text-zinc-600" /><span className="text-xs text-zinc-500">lbs</span></div>
                    <div className="flex gap-1">{ex.done.map((d, k) => (
                      <button key={k} onClick={() => { const nd = [...ex.done]; nd[k] = !nd[k]; setEx({ done: nd }); if (navigator.vibrate) navigator.vibrate(10); }} className={cn('h-10 w-10 rounded-lg flex items-center justify-center text-xs font-semibold active:scale-95 transition', d ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-500 border border-zinc-700')}>{d ? <Check className="h-4 w-4" /> : k + 1}</button>))}</div>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="bg-zinc-800/60 rounded-xl p-3 block"><span className="text-xs text-zinc-400">Duration (mm:ss)</span>
                <input value={timeText} onChange={(e) => { setTimeText(e.target.value); setDraft({ ...draft, duration_min: parseTime(e.target.value) }); }} placeholder="45:00" inputMode="numeric" className="w-full bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-zinc-600" /></label>
              <Rpe value={draft.rpe} onChange={(v) => setDraft({ ...draft, rpe: v })} />
            </div>
          </div>
        )}

        <button onClick={save} disabled={saving} className={cn('mt-4 w-full h-12 rounded-xl font-semibold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50', T.key === 'run' ? 'bg-sky-400' : T.key === 'crossfit' ? 'bg-orange-400' : T.key === 'gym' ? 'bg-violet-400' : T.key === 'walk' ? 'bg-emerald-400' : 'bg-yellow-400')}>
          <Check className="h-5 w-5" />{saving ? 'Saving…' : `Log ${T.label}`}
        </button>
      </Card>
    );
  };

  // ------------------------------------------------------------------ render
  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 border border-zinc-600 text-white px-4 py-2 rounded-xl text-sm shadow-lg">{toast}</div>}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Zap className="h-7 w-7 text-yellow-400" />Training</h1>
      </div>

      {/* Date + type picker */}
      {!draft && (
        <Card>
          <div className="flex items-center gap-1.5 mb-3">
            <button onClick={() => setDate(shiftDate(date, -1))} className="h-10 w-10 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => setDate(getToday())} className="h-10 px-3 rounded-lg bg-zinc-800 text-white text-sm font-medium flex-1">{date === getToday() ? 'Today' : formatDate(date)}</button>
            <button onClick={() => setDate(shiftDate(date, 1))} disabled={date >= getToday()} className="h-10 w-10 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-4 gap-2">{TYPES.map((t) => { const I = t.icon; const n = dateSessions.filter((s) => s.type === t.key).length; return (
            <button key={t.key} onClick={() => start(t.key)} className={cn('relative h-20 rounded-xl border flex flex-col items-center justify-center gap-1.5 active:scale-95 transition', t.bg)}>
              <I className={cn('h-6 w-6', t.color)} /><span className="text-xs font-medium text-white">{t.label}</span>
              {n > 0 && <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-emerald-500 text-black text-[11px] font-bold flex items-center justify-center">{n}</span>}
            </button>); })}</div>
          {dateSessions.length > 0 && <div className="mt-3 space-y-1">{dateSessions.map((s) => { const T = typeOf(s.type); const I = T.icon; return (
            <div key={s.id} className="flex items-center gap-2 text-sm bg-zinc-800/60 rounded-lg px-3 py-2"><I className={cn('h-4 w-4', T.color)} /><span className="text-white">{T.label}{s.subtype ? ` · ${RUN_SUBTYPES.find((r) => r.key === s.subtype)?.label ?? (s.subtype === 'hyrox_class' ? 'HYROX class' : '')}` : ''}</span><span className="text-zinc-400 ml-auto tabular-nums">{summary(s)}</span></div>); })}</div>}
        </Card>
      )}

      {renderForm()}

      {/* This week */}
      <Card>
        <CardHeader className="mb-3 flex items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-zinc-400" />This Week</CardTitle><span className="text-xs text-zinc-500">{thisWeek.length} session{thisWeek.length === 1 ? '' : 's'}</span></CardHeader>
        <div className="grid grid-cols-7 gap-1">{weekDays.map((d) => { const ds = sessions.filter((s) => s.date === d); const future = d > getToday(); return (
          <button key={d} onClick={() => !future && setDate(d)} disabled={future} className={cn('rounded-xl p-2 flex flex-col items-center gap-1 min-h-[64px]', d === getToday() ? 'bg-zinc-800 border border-zinc-600' : 'bg-zinc-800/40', future && 'opacity-40')}>
            <span className={cn('text-[11px]', d === getToday() ? 'text-blue-400' : 'text-zinc-500')}>{shortDay(d)}</span>
            <div className="flex flex-wrap justify-center gap-0.5">{ds.length ? ds.map((s) => { const T = typeOf(s.type); const I = T.icon; return <I key={s.id} className={cn('h-4 w-4', T.color)} />; }) : <span className="h-4 w-4 rounded-full border border-dashed border-zinc-700" />}</div>
          </button>); })}</div>
        <div className="grid grid-cols-4 gap-2 mt-3">{TYPES.map((t) => (
          <div key={t.key} className="bg-zinc-800/40 rounded-lg p-2 text-center"><div className={cn('text-lg font-semibold', t.color)}>{countBy(thisWeek, t.key)}</div><div className="text-[10px] text-zinc-500">{t.label}</div></div>))}</div>
        {runKm(thisWeek) > 0 && <div className="text-xs text-zinc-400 mt-2 text-center">{runKm(thisWeek).toFixed(1)} km run this week</div>}
      </Card>

      {/* Month + trends */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { l: 'Sessions this month', v: thisMonth.length },
          { l: 'Run km this month', v: runKm(thisMonth).toFixed(1) },
          { l: 'CrossFit classes', v: countBy(thisMonth, 'crossfit') },
          { l: 'Walks', v: countBy(thisMonth, 'walk') },
        ].map((c) => <Card key={c.l} className="p-3"><div className="text-xs text-zinc-400">{c.l}</div><div className="text-2xl font-semibold text-white tabular-nums">{c.v}</div></Card>)}
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium text-white mb-2">Sessions per week</div>
        {!weeklyVolume.length ? <p className="text-zinc-500 text-sm py-6 text-center">Log your first session above</p> : (
          <div className="h-44"><ResponsiveContainer width="100%" height="100%"><BarChart data={weeklyVolume} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" /><XAxis dataKey="week" {...axis} /><YAxis {...axis} allowDecimals={false} /><Tooltip contentStyle={tip} />
            {TYPES.map((t) => <Bar key={t.key} dataKey={t.key} stackId="a" fill={t.hex} name={t.label} />)}
          </BarChart></ResponsiveContainer></div>)}
      </Card>

      {paceTrend.length > 1 && (
        <Card className="p-4"><div className="text-sm font-medium text-white mb-2">Run pace (min/km)</div>
          <div className="h-44"><ResponsiveContainer width="100%" height="100%"><LineChart data={paceTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={shortDate} {...axis} /><YAxis domain={['auto', 'auto']} reversed {...axis} />
            <Tooltip contentStyle={tip} labelFormatter={(v) => formatDate(String(v))} formatter={(v, n, p) => [n === 'pace' ? `${fmtPace(Number(v))} (${(p as { payload?: { km?: number } }).payload?.km} km)` : String(v), n === 'pace' ? 'Pace' : String(n)]} />
            <Line type="monotone" dataKey="pace" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart></ResponsiveContainer></div></Card>
      )}

      {liftTrend.length > 1 && (
        <Card className="p-4"><div className="text-sm font-medium text-white mb-2">Gym weights (lbs)</div>
          <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart data={liftTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={shortDate} {...axis} /><YAxis domain={['auto', 'auto']} {...axis} /><Tooltip contentStyle={tip} labelFormatter={(v) => formatDate(String(v))} />
            {DEFAULT_GYM_EXERCISES.map((e, i) => <Line key={e.name} type="monotone" dataKey={e.name} stroke={LIFT_COLORS[i]} strokeWidth={2} dot={false} connectNulls />)}
          </LineChart></ResponsiveContainer></div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">{DEFAULT_GYM_EXERCISES.map((e, i) => <span key={e.name} className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: LIFT_COLORS[i] }} />{e.name}</span>)}</div>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="mb-2"><CardTitle className="text-base">Recent</CardTitle></CardHeader>
        {!sessions.length ? <p className="text-zinc-500 text-sm">Nothing logged yet.</p> : (
          <div className="divide-y divide-zinc-800/60">{sessions.slice(0, 30).map((s) => { const T = typeOf(s.type); const I = T.icon; const open = expanded === s.id; return (
            <div key={s.id}>
              <button onClick={() => setExpanded(open ? null : s.id)} className="w-full flex items-center gap-3 py-2.5 text-left">
                <div className={cn('h-9 w-9 rounded-lg border flex items-center justify-center shrink-0', T.bg)}><I className={cn('h-4 w-4', T.color)} /></div>
                <div className="flex-1 min-w-0"><div className="text-sm text-white">{T.label}{s.type === 'run' && s.subtype ? ` · ${RUN_SUBTYPES.find((r) => r.key === s.subtype)?.label}` : s.subtype === 'hyrox_class' ? ' · HYROX class' : ''}</div><div className="text-xs text-zinc-500 truncate">{summary(s)}</div></div>
                <div className="text-xs text-zinc-500 shrink-0">{shortDate(s.date)}</div>
              </button>
              {open && (
                <div className="pb-3 pl-12 text-xs text-zinc-400 space-y-1">
                  {s.type === 'gym' && s.exercises && <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">{s.exercises.map((e) => <div key={e.name} className="flex justify-between"><span>{e.name}</span><span className="text-zinc-300 tabular-nums">{e.weight ?? '—'} lbs · {e.done.filter(Boolean).length}/{e.target_sets}</span></div>)}</div>}
                  {s.avg_hr && <div>Avg HR {s.avg_hr}{s.max_hr ? ` · Max ${s.max_hr}` : ''}</div>}
                  {s.rpe && <div>RPE {s.rpe}</div>}
                  {s.notes && <div className="text-zinc-300 whitespace-pre-wrap">{s.notes}</div>}
                  <button onClick={() => remove(s.id)} className="text-red-400/80 hover:text-red-400 flex items-center gap-1 pt-1"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                </div>
              )}
            </div>); })}</div>)}
      </Card>
    </div>
  );
}
