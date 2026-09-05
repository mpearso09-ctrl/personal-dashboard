'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MilestonesTab } from './milestones-tab';
import { TrendsTab } from './trends-tab';
import {
  BODY_FIELDS, NUTRITION_FIELDS, ACTIVITY_FIELDS, HABIT_FIELDS, DRINK_FIELDS, EMPTY_DAY, SCORE_METRICS,
  shiftDate, fmtNum, avg, totalDrinks, shortDay, streak, type NumField, type BoolField, type DrinkField, type Hit, type MetricDef,
} from './fitness-lib';
import { createClient } from '@/lib/supabase-browser';
import type { FitnessDaily, FitnessGoals } from '@/lib/types';
import { getToday, getDayOfChallenge, getStatusColor, cn, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth-provider';
import { useHousehold } from '@/components/household-provider';
import {
  Dumbbell, Footprints, Flame, Beef, Target, ClipboardList, BarChart3, CalendarDays, Trophy, Plus, Minus, Check,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wine, StretchHorizontal, Sunset,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type TabKey = 'today' | 'week' | 'trends' | 'milestones';
const tabs: { key: TabKey; label: string; icon: typeof Dumbbell }[] = [
  { key: 'today', label: 'Today', icon: ClipboardList },
  { key: 'week', label: 'Week', icon: CalendarDays },
  { key: 'trends', label: 'Trends', icon: BarChart3 },
  { key: 'milestones', label: 'Milestones', icon: Trophy },
];

export default function FitnessPage() {
  const { user, loading: authLoading } = useAuth();
  const { householdUsers } = useHousehold();
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const supabase = createClient();

  const effectiveUserId = user ? (viewingUserId ?? user.id) : '';
  const isViewingOther = viewingUserId !== null && user !== null && viewingUserId !== user.id;
  const readOnly = isViewingOther;

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [goals, setGoals] = useState<FitnessGoals | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // today
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [day, setDay] = useState<Partial<FitnessDaily>>(EMPTY_DAY);
  const dayRef = useRef(day);
  useEffect(() => { dayRef.current = day; }, [day]);
  const [addAmounts, setAddAmounts] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // history (last 120 days, shared by Week + Trends)
  const [history, setHistory] = useState<FitnessDaily[]>([]);
  const [range, setRange] = useState<30 | 60 | 90>(30);

  // =========================================================================
  // Fetching
  // =========================================================================

  const fetchGoals = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('fitness_goals').select('*').eq('user_id', effectiveUserId).maybeSingle();
    setGoals((data as FitnessGoals) ?? null);
  }, [user, effectiveUserId]);

  const fetchDay = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('fitness_daily').select('*')
      .eq('user_id', effectiveUserId).eq('date', selectedDate).maybeSingle();
    setDay(data ? (data as FitnessDaily) : { ...EMPTY_DAY });
    setAddAmounts({});
  }, [user, effectiveUserId, selectedDate]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('fitness_daily').select('*')
      .eq('user_id', effectiveUserId).gte('date', shiftDate(getToday(), -120)).order('date');
    setHistory((data as FitnessDaily[]) ?? []);
  }, [user, effectiveUserId]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);
  useEffect(() => { fetchDay(); }, [fetchDay]);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // =========================================================================
  // Saving — every change persists; direct-entry fields are debounced
  // =========================================================================

  const persist = useCallback(async (next: Partial<FitnessDaily>) => {
    if (!user || readOnly) return;
    setSaveState('saving');
    const payload: Record<string, unknown> = { user_id: user.id, date: selectedDate };
    ([...BODY_FIELDS, ...NUTRITION_FIELDS, ...ACTIVITY_FIELDS] as { name: NumField }[]).forEach((f) => {
      const v = next[f.name];
      payload[f.name] = v === null || v === undefined || (v as unknown) === '' ? null : Number(v);
    });
    HABIT_FIELDS.forEach((f) => { payload[f.name] = !!next[f.name]; });
    DRINK_FIELDS.forEach((f) => { payload[f.name] = Number(next[f.name] ?? 0); });
    payload.notes = next.notes || null;
    const { error } = await supabase.from('fitness_daily').upsert(payload, { onConflict: 'user_id,date' });
    setSaveState(error ? 'error' : 'saved');
    if (!error) {
      // keep history in sync so Week/Trends reflect today immediately
      setHistory((h) => {
        const merged = { ...(h.find((d) => d.date === selectedDate) ?? {}), ...payload } as FitnessDaily;
        const rest = h.filter((d) => d.date !== selectedDate);
        return [...rest, merged].sort((a, b) => a.date.localeCompare(b.date));
      });
      setTimeout(() => setSaveState('idle'), 1500);
    }
  }, [user, readOnly, selectedDate]);

  /** Immediate save (toggles, counters, + button) */
  const update = (patch: Partial<FitnessDaily>) => {
    const next = { ...dayRef.current, ...patch };
    setDay(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    persist(next);
  };

  /** Debounced save (typed numeric fields, notes) */
  const updateDebounced = (patch: Partial<FitnessDaily>) => {
    const next = { ...dayRef.current, ...patch };
    setDay(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(next), 600);
  };

  const addTo = (field: NumField) => {
    const amt = Number(addAmounts[field]);
    if (!addAmounts[field] || isNaN(amt) || amt === 0) return;
    const cur = (dayRef.current[field] as number | null) ?? 0;
    setAddAmounts((p) => ({ ...p, [field]: '' }));
    update({ [field]: cur + amt } as Partial<FitnessDaily>);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
  };

  const bump = (field: DrinkField, delta: number) => {
    const cur = (dayRef.current[field] as number) ?? 0;
    update({ [field]: Math.max(0, cur + delta) } as Partial<FitnessDaily>);
  };

  const toggle = (field: BoolField) => {
    update({ [field]: !dayRef.current[field] } as Partial<FitnessDaily>);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
  };

  // =========================================================================
  // Derived
  // =========================================================================

  const challengeDay = goals ? getDayOfChallenge(goals.challenge_start_date) : null;
  const g = (k: keyof FitnessGoals): number | undefined => goals ? (goals[k] as number | null) ?? undefined : undefined;

  const completion = useMemo(() => {
    const checks = [
      day.weight_lbs != null, day.calories_consumed != null, day.protein_g != null, day.fiber_g != null,
      day.steps != null, day.sleep_hours != null, day.calories_burned != null,
    ];
    return { done: checks.filter(Boolean).length, total: checks.length };
  }, [day]);

  const last7 = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => shiftDate(getToday(), -6 + i));
    const map = new Map(history.map((d) => [d.date, d]));
    return dates.map((date) => ({ date, entry: map.get(date) ?? null }));
  }, [history]);

  const rangeData = useMemo(() => {
    const from = shiftDate(getToday(), -range);
    return history.filter((d) => d.date >= from);
  }, [history, range]);

  const thisMonth = useMemo(() => history.filter((d) => d.date.slice(0, 7) === getToday().slice(0, 7)), [history]);
  const lastMonth = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    const key = d.toISOString().slice(0, 7);
    return history.filter((x) => x.date.slice(0, 7) === key);
  }, [history]);

  const streaks = useMemo(() => {
    if (!goals) return [];
    return [
      { label: 'Workouts', ...streak(history, (d) => d.workout), icon: Dumbbell },
      { label: 'Stretching', ...streak(history, (d) => d.stretching), icon: StretchHorizontal },
      { label: 'Evening Walks', ...streak(history, (d) => d.evening_walk), icon: Sunset },
      { label: 'Dry Days', ...streak(history, (d) => totalDrinks(d) === 0), icon: Wine },
      { label: 'Protein Goal', ...streak(history, (d) => (d.protein_g ?? 0) >= goals.protein_min), icon: Beef },
      { label: 'Steps Goal', ...streak(history, (d) => (d.steps ?? 0) >= goals.steps_min), icon: Footprints },
    ];
  }, [history, goals]);

  /** latest value + change vs 7 days earlier */
  const bodyTrend = (field: NumField) => {
    const pts = history.filter((d) => d[field] != null);
    if (!pts.length) return { latest: null as number | null, delta: null as number | null };
    const latest = pts[pts.length - 1][field] as number;
    const weekAgo = pts.filter((d) => d.date <= shiftDate(pts[pts.length - 1].date, -7));
    const ref = weekAgo.length ? (weekAgo[weekAgo.length - 1][field] as number) : null;
    return { latest, delta: ref === null ? null : latest - ref };
  };

  // =========================================================================
  // Guards
  // =========================================================================

  if (authLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;
  }
  if (!user) return <p className="text-zinc-400 p-8">Please sign in to view fitness data.</p>;

  // =========================================================================
  // Shared bits
  // =========================================================================

  const SaveBadge = () => (
    <span className={cn('text-xs transition-opacity', saveState === 'idle' ? 'opacity-0' : 'opacity-100',
      saveState === 'error' ? 'text-red-400' : saveState === 'saving' ? 'text-zinc-500' : 'text-emerald-400')}>
      {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? 'Save failed' : ''}
    </span>
  );

  const Ring = ({ done, total }: { done: number; total: number }) => {
    const r = 18, c = 2 * Math.PI * r, pct = total ? done / total : 0;
    return (
      <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0">
        <circle cx="24" cy="24" r={r} stroke="#27272a" strokeWidth="5" fill="none" />
        <circle cx="24" cy="24" r={r} stroke={pct === 1 ? '#10b981' : '#3b82f6'} strokeWidth="5" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          transform="rotate(-90 24 24)" className="transition-all duration-500" />
        <text x="24" y="28" textAnchor="middle" className="fill-white text-[11px] font-semibold">{done}/{total}</text>
      </svg>
    );
  };

  // =========================================================================
  // TODAY
  // =========================================================================

  const renderToday = () => (
    <div className="space-y-4">
      {/* Date + completion */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} className="h-11 w-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center"><ChevronLeft className="h-5 w-5" /></button>
          <button onClick={() => setSelectedDate(getToday())} className="h-11 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium min-w-[7.5rem]">
            {selectedDate === getToday() ? 'Today' : formatDate(selectedDate)}
          </button>
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} disabled={selectedDate >= getToday()} className="h-11 w-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="flex items-center gap-3">
          <SaveBadge />
          <Ring done={completion.done} total={completion.total} />
        </div>
      </div>

      {goals && challengeDay !== null && challengeDay > 0 && (
        <div className="flex items-center gap-3 bg-blue-600/15 border border-blue-600/30 rounded-xl px-4 py-2.5">
          <Target className="h-4 w-4 text-blue-400" />
          <span className="text-blue-300 text-sm font-medium">{goals.challenge_name}: Day {challengeDay} of {goals.challenge_days}</span>
          <div className="ml-auto h-1.5 w-24 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (challengeDay / goals.challenge_days) * 100)}%` }} /></div>
        </div>
      )}

      {/* BODY */}
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Body</h3>
        <div className="grid grid-cols-3 gap-2">
          {BODY_FIELDS.map((f) => {
            const Icon = f.icon; const v = day[f.name] as number | null; const goal = g(f.goal);
            const color = v == null ? 'text-zinc-500' : goal !== undefined && v <= goal ? 'text-emerald-400' : 'text-white';
            return (
              <div key={f.name} className="bg-zinc-800/60 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1"><Icon className="h-3.5 w-3.5" />{f.label}</div>
                <div className="flex items-baseline gap-1">
                  <input type="number" inputMode="decimal" step={f.step} value={v ?? ''} disabled={readOnly} placeholder="—"
                    onChange={(e) => updateDebounced({ [f.name]: e.target.value === '' ? null : Number(e.target.value) } as Partial<FitnessDaily>)}
                    className={cn('w-full bg-transparent text-2xl font-semibold tabular-nums outline-none placeholder:text-zinc-600 disabled:opacity-60', color)} />
                  <span className="text-zinc-500 text-sm">{f.unit}</span>
                </div>
                {goal !== undefined && <div className="text-[11px] text-zinc-500 mt-0.5">goal {goal}{f.unit}</div>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* NUTRITION */}
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Nutrition</h3>
        <div className="space-y-2">
          {NUTRITION_FIELDS.map((f) => {
            const Icon = f.icon; const v = day[f.name] as number | null;
            const min = f.goalMin ? g(f.goalMin) : undefined; const max = f.goalMax ? g(f.goalMax) : undefined;
            const color = getStatusColor(v, min, max);
            const target = max ?? min; const pct = target && v ? Math.min(100, (v / target) * 100) : 0;
            return (
              <div key={f.name} className="bg-zinc-800/60 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-zinc-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={cn('text-xl font-semibold tabular-nums', v == null ? 'text-zinc-500' : color)}>{fmtNum(v, f.unit)}</span>
                      {target !== undefined && <span className="text-xs text-zinc-500">/ {target}{f.unit} {max ? 'max' : 'min'}</span>}
                    </div>
                    <div className="h-1 bg-zinc-700/60 rounded-full mt-1.5 overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', color.replace('text-', 'bg-'))} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input type="number" inputMode="decimal" value={addAmounts[f.name] ?? ''} placeholder="+"
                        onChange={(e) => setAddAmounts((p) => ({ ...p, [f.name]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTo(f.name); } }}
                        className="w-16 h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-2 text-sm text-white text-right focus:border-blue-500 outline-none" />
                      <button onClick={() => addTo(f.name)} disabled={!addAmounts[f.name]} className="h-11 w-11 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white flex items-center justify-center active:scale-95 transition"><Plus className="h-5 w-5" /></button>
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1 pl-7">{f.label}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ACTIVITY */}
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Activity</h3>
        <div className="grid grid-cols-3 gap-2">
          {ACTIVITY_FIELDS.map((f) => {
            const Icon = f.icon; const v = day[f.name] as number | null; const min = g(f.goalMin);
            const color = getStatusColor(v, min);
            return (
              <div key={f.name} className="bg-zinc-800/60 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1"><Icon className="h-3.5 w-3.5" />{f.label}</div>
                <div className="flex items-baseline gap-1">
                  <input type="number" inputMode="decimal" step={f.step} value={v ?? ''} disabled={readOnly} placeholder="—"
                    onChange={(e) => updateDebounced({ [f.name]: e.target.value === '' ? null : Number(e.target.value) } as Partial<FitnessDaily>)}
                    className={cn('w-full bg-transparent text-2xl font-semibold tabular-nums outline-none placeholder:text-zinc-600 disabled:opacity-60', v == null ? 'text-zinc-500' : color)} />
                  <span className="text-zinc-500 text-sm">{f.unit}</span>
                </div>
                {min !== undefined && <div className="text-[11px] text-zinc-500 mt-0.5">goal {min.toLocaleString()}{f.unit}+</div>}
                {f.cumulative && !readOnly && (
                  <div className="flex items-center gap-1 mt-2">
                    <input type="number" inputMode="numeric" value={addAmounts[f.name] ?? ''} placeholder="+"
                      onChange={(e) => setAddAmounts((p) => ({ ...p, [f.name]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTo(f.name); } }}
                      className="w-full h-9 bg-zinc-900 border border-zinc-700 rounded-lg px-2 text-sm text-white text-right outline-none focus:border-blue-500" />
                    <button onClick={() => addTo(f.name)} disabled={!addAmounts[f.name]} className="h-9 w-9 rounded-lg bg-blue-600 disabled:opacity-30 text-white flex items-center justify-center shrink-0"><Plus className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* HABITS */}
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Habits</h3>
        <div className="grid grid-cols-3 gap-2">
          {HABIT_FIELDS.map((f) => {
            const Icon = f.icon; const on = !!day[f.name];
            return (
              <button key={f.name} onClick={() => !readOnly && toggle(f.name)} disabled={readOnly}
                className={cn('h-20 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-60',
                  on ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300' : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:border-zinc-600')}>
                <div className="relative"><Icon className="h-6 w-6" />{on && <Check className="h-3.5 w-3.5 absolute -right-2 -top-1 text-emerald-400" />}</div>
                <span className="text-xs font-medium">{f.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* DRINKS */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Drinks</h3>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', totalDrinks(day) === 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-300')}>
            {totalDrinks(day) === 0 ? 'Dry day' : `${totalDrinks(day)} total`}
          </span>
        </div>
        <div className="space-y-2">
          {DRINK_FIELDS.map((f) => {
            const Icon = f.icon; const v = (day[f.name] as number) ?? 0;
            return (
              <div key={f.name} className="flex items-center gap-3 bg-zinc-800/60 rounded-xl px-3 py-2">
                <Icon className={cn('h-5 w-5', v > 0 ? f.color : 'text-zinc-500')} />
                <span className="text-sm text-zinc-300 flex-1">{f.label}</span>
                {!readOnly && <button onClick={() => bump(f.name, -1)} disabled={v === 0} className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 flex items-center justify-center disabled:opacity-30 active:scale-95"><Minus className="h-4 w-4" /></button>}
                <span className={cn('w-8 text-center text-xl font-semibold tabular-nums', v > 0 ? 'text-white' : 'text-zinc-500')}>{v}</span>
                {!readOnly && <button onClick={() => bump(f.name, 1)} className="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 flex items-center justify-center active:scale-95"><Plus className="h-4 w-4" /></button>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* NOTES */}
      <Card>
        <textarea value={day.notes ?? ''} disabled={readOnly} placeholder="Notes for the day…" rows={2}
          onChange={(e) => updateDebounced({ notes: e.target.value })}
          className="w-full bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none resize-none disabled:opacity-60" />
      </Card>
    </div>
  );

  // =========================================================================
  // WEEK
  // =========================================================================

  const renderWeek = () => {
    const hero = [
      { label: 'Weight', unit: ' lbs', f: 'weight_lbs' as NumField, goodDown: true, digits: 1 },
      { label: 'Body Fat', unit: '%', f: 'body_fat_pct' as NumField, goodDown: true, digits: 1 },
      { label: 'Visceral Fat', unit: '%', f: 'visceral_fat_pct' as NumField, goodDown: true, digits: 1 },
    ];
    const weekRate = (m: MetricDef) => {
      if (!goals) return null;
      const res = last7.map((d) => (d.entry ? m.test(d.entry, goals) : 'none'));
      const logged = res.filter((r) => r !== 'none').length;
      return logged ? Math.round((res.filter((r) => r === 'hit').length / logged) * 100) : null;
    };
    const mAvg = (rows: FitnessDaily[], f: NumField) => avg(rows.map((r) => r[f] as number | null));
    const cmp = (label: string, f: NumField, unit: string, digits: number, goodDown = false) => {
      const a = mAvg(thisMonth, f), b = mAvg(lastMonth, f);
      const d = a != null && b != null ? a - b : null;
      const good = d == null ? null : goodDown ? d <= 0 : d >= 0;
      return { label, a, b, d, unit, digits, good };
    };
    const monthRows = [
      cmp('Weight', 'weight_lbs', ' lbs', 1, true), cmp('Body Fat', 'body_fat_pct', '%', 1, true), cmp('Visceral Fat', 'visceral_fat_pct', '%', 1, true),
      cmp('Calories', 'calories_consumed', '', 0, true), cmp('Protein', 'protein_g', 'g', 0), cmp('Fiber', 'fiber_g', 'g', 0),
      cmp('Steps', 'steps', '', 0), cmp('Sleep', 'sleep_hours', 'h', 1), cmp('Cals Burned', 'calories_burned', '', 0),
    ];
    const count = (rows: FitnessDaily[], t: (d: FitnessDaily) => boolean) => rows.filter(t).length;

    return (
      <div className="space-y-4">
        {/* Hero */}
        <div className="grid grid-cols-3 gap-2">
          {hero.map((h) => {
            const t = bodyTrend(h.f);
            const up = t.delta != null && t.delta > 0;
            const good = t.delta == null ? null : h.goodDown ? t.delta <= 0 : t.delta >= 0;
            return (
              <Card key={h.f} className="p-3">
                <div className="text-xs text-zinc-400">{h.label}</div>
                <div className="text-2xl font-semibold text-white tabular-nums mt-0.5">{fmtNum(t.latest, h.unit, h.digits)}</div>
                {t.delta != null && (
                  <div className={cn('flex items-center gap-1 text-xs mt-0.5', good ? 'text-emerald-400' : 'text-red-400')}>
                    {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {t.delta > 0 ? '+' : ''}{t.delta.toFixed(1)}{h.unit.trim()} · 7d
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Scorecard */}
        <Card>
          <CardHeader className="mb-3 flex items-center justify-between"><CardTitle className="text-base">Last 7 Days</CardTitle><span className="text-xs text-zinc-500">tap Today to fill gaps</span></CardHeader>
          {!goals ? <p className="text-zinc-500 text-sm">Set goals in Settings to see the scorecard.</p> : (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-xs">
                <thead><tr><th className="text-left text-zinc-500 font-normal pb-2 w-16"></th>
                  {last7.map((d) => <th key={d.date} className={cn('font-medium pb-2', d.date === getToday() ? 'text-blue-400' : 'text-zinc-400')}>{shortDay(d.date)}</th>)}
                  <th className="text-zinc-500 font-normal pb-2 pl-1">%</th></tr></thead>
                <tbody>
                  {SCORE_METRICS.map((m) => {
                    const rate = weekRate(m);
                    return (
                      <tr key={m.key} className="border-t border-zinc-800/60">
                        <td className="py-1.5 text-zinc-400">{m.short}</td>
                        {last7.map((d) => {
                          const r: Hit = d.entry ? m.test(d.entry, goals) : 'none';
                          return (
                            <td key={d.date} className="py-1.5 text-center">
                              <button onClick={() => { setSelectedDate(d.date); setActiveTab('today'); }}
                                className={cn('inline-block h-4 w-4 rounded-full', r === 'hit' ? 'bg-emerald-500' : r === 'miss' ? 'bg-red-500/80' : 'bg-zinc-700')} />
                            </td>
                          );
                        })}
                        <td className={cn('py-1.5 text-right tabular-nums pl-1', rate == null ? 'text-zinc-600' : rate >= 80 ? 'text-emerald-400' : rate >= 50 ? 'text-amber-400' : 'text-red-400')}>{rate == null ? '—' : rate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Streaks */}
        <Card>
          <CardHeader className="mb-3"><CardTitle className="text-base">Streaks</CardTitle></CardHeader>
          <div className="grid grid-cols-3 gap-2">
            {streaks.map((s) => { const Icon = s.icon; return (
              <div key={s.label} className="bg-zinc-800/60 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]"><Icon className="h-3.5 w-3.5" />{s.label}</div>
                <div className="flex items-baseline gap-1 mt-1"><Flame className={cn('h-4 w-4', s.current > 0 ? 'text-orange-400' : 'text-zinc-600')} /><span className="text-2xl font-semibold text-white tabular-nums">{s.current}</span></div>
                <div className="text-[11px] text-zinc-500">best {s.best}</div>
              </div>
            ); })}
          </div>
        </Card>

        {/* Monthly summary */}
        <Card>
          <CardHeader className="mb-3"><CardTitle className="text-base">This Month vs Last</CardTitle></CardHeader>
          <div className="divide-y divide-zinc-800/60">
            {monthRows.map((r) => (
              <div key={r.label} className="flex items-center py-2 text-sm">
                <span className="text-zinc-400 w-28">{r.label}</span>
                <span className="text-white tabular-nums flex-1">{fmtNum(r.a, r.unit, r.digits)}</span>
                <span className="text-zinc-500 tabular-nums flex-1 text-right">{fmtNum(r.b, r.unit, r.digits)}</span>
                <span className={cn('w-20 text-right tabular-nums text-xs', r.d == null ? 'text-zinc-600' : r.good ? 'text-emerald-400' : 'text-red-400')}>
                  {r.d == null ? '—' : `${r.d > 0 ? '+' : ''}${r.d.toFixed(r.digits)}`}
                </span>
              </div>
            ))}
            {[
              { label: 'Workouts', a: count(thisMonth, (d) => d.workout), b: count(lastMonth, (d) => d.workout) },
              { label: 'Stretch sessions', a: count(thisMonth, (d) => d.stretching), b: count(lastMonth, (d) => d.stretching) },
              { label: 'Evening walks', a: count(thisMonth, (d) => d.evening_walk), b: count(lastMonth, (d) => d.evening_walk) },
              { label: 'Dry days', a: count(thisMonth, (d) => totalDrinks(d) === 0), b: count(lastMonth, (d) => totalDrinks(d) === 0) },
              { label: 'Total drinks', a: thisMonth.reduce((s, d) => s + totalDrinks(d), 0), b: lastMonth.reduce((s, d) => s + totalDrinks(d), 0), goodDown: true },
            ].map((r) => { const d = r.a - r.b; const good = r.goodDown ? d <= 0 : d >= 0; return (
              <div key={r.label} className="flex items-center py-2 text-sm">
                <span className="text-zinc-400 w-28">{r.label}</span>
                <span className="text-white tabular-nums flex-1">{r.a}</span>
                <span className="text-zinc-500 tabular-nums flex-1 text-right">{r.b}</span>
                <span className={cn('w-20 text-right tabular-nums text-xs', lastMonth.length === 0 ? 'text-zinc-600' : good ? 'text-emerald-400' : 'text-red-400')}>{lastMonth.length === 0 ? '—' : `${d > 0 ? '+' : ''}${d}`}</span>
              </div>
            ); })}
          </div>
          <div className="flex text-[11px] text-zinc-500 mt-2"><span className="w-28"></span><span className="flex-1">this month</span><span className="flex-1 text-right">last month</span><span className="w-20 text-right">change</span></div>
        </Card>
      </div>
    );
  };

  // =========================================================================
  // TRENDS
  // =========================================================================

  // =========================================================================
  // Main
  // =========================================================================

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Dumbbell className="h-7 w-7 text-blue-500" />Fitness</h1>
        {householdUsers.length > 1 && (
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {householdUsers.map((u) => (
              <button key={u.id} onClick={() => setViewingUserId(u.id === user.id ? null : u.id)}
                className={cn('px-3 h-9 rounded-lg text-sm font-medium', (viewingUserId ?? user.id) === u.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white')}>
                {u.id === user.id ? 'Me' : u.displayName}
              </button>
            ))}
          </div>
        )}
      </div>

      {isViewingOther && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-lg text-sm">
          Read-only — viewing {householdUsers.find((u) => u.id === viewingUserId)?.displayName}&apos;s data
        </div>
      )}

      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn('flex items-center justify-center gap-2 flex-1 h-11 rounded-lg text-sm font-medium transition-colors', activeTab === t.key ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800')}>
            <Icon className="h-4 w-4" /><span className="hidden sm:inline">{t.label}</span>
          </button>
        ); })}
      </div>

      {activeTab === 'today' && renderToday()}
      {activeTab === 'week' && renderWeek()}
      {activeTab === 'trends' && <TrendsTab rangeData={rangeData} goals={goals} streaks={streaks} range={range} setRange={setRange} />}
      {activeTab === 'milestones' && <MilestonesTab userId={effectiveUserId} isReadOnly={isViewingOther} />}
    </div>
  );
}

