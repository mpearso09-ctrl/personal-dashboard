'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { FitnessDaily, FitnessWeekly, FitnessGoals } from '@/lib/types';
import { getToday, getWeekStart, getDayOfChallenge, getStatusColor, cn, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/components/auth-provider';
import { useHousehold } from '@/components/household-provider';
import {
  Dumbbell, Footprints, Moon, Flame, Beef, Wheat, Droplets, Salad,
  Save, Check, X, ChevronLeft, ChevronRight, Calendar, Weight,
  TrendingUp, Activity, Target, ClipboardList, BarChart3, Camera,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ReferenceLine,
} from 'recharts';

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

const dailyFields = [
  { name: 'calories_consumed', label: 'Calories', type: 'number', icon: Flame, goalMin: undefined as string | undefined, goalMax: 'calories_max' as string | undefined },
  { name: 'protein_g', label: 'Protein (g)', type: 'number', icon: Beef, goalMin: 'protein_min', goalMax: undefined },
  { name: 'carbs_g', label: 'Carbs (g)', type: 'number', icon: Wheat, goalMin: 'carbs_min', goalMax: 'carbs_max' },
  { name: 'fat_g', label: 'Fat (g)', type: 'number', icon: Droplets, goalMin: 'fat_min', goalMax: 'fat_max' },
  { name: 'fiber_g', label: 'Fiber (g)', type: 'number', icon: Salad, goalMin: 'fiber_min', goalMax: 'fiber_max' },
  { name: 'steps', label: 'Steps', type: 'number', icon: Footprints, goalMin: 'steps_min', goalMax: undefined },
  { name: 'sleep_hours', label: 'Sleep (hrs)', type: 'number', icon: Moon, goalMin: 'sleep_min', goalMax: undefined },
  { name: 'calories_burned', label: 'Calories Burned', type: 'number', icon: Activity, goalMin: 'calories_burned_min', goalMax: undefined },
];

const toggleFields = [
  { name: 'workout', label: 'Workout' },
  { name: 'mobility', label: 'Mobility' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPreviousMondays(count: number): string[] {
  const mondays: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Go to most recent Monday
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  for (let i = 0; i < count; i++) {
    mondays.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() - 7);
  }
  return mondays;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type TabKey = 'today' | 'weekly' | 'history' | 'trends';

const tabs: { key: TabKey; label: string; icon: typeof Dumbbell }[] = [
  { key: 'today', label: 'Today', icon: ClipboardList },
  { key: 'weekly', label: 'Weekly Photos', icon: Camera },
  { key: 'history', label: 'History', icon: Calendar },
  { key: 'trends', label: 'Trends', icon: BarChart3 },
];

export default function FitnessPage() {
  const { user, loading: authLoading } = useAuth();
  const { householdUsers } = useHousehold();
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const supabase = createClient();

  const effectiveUserId = user ? (viewingUserId ?? user.id) : '';
  const isViewingOther = viewingUserId !== null && user !== null && viewingUserId !== user.id;

  const [activeTab, setActiveTab] = useState<TabKey>('today');

  // --- shared state ---
  const [goals, setGoals] = useState<FitnessGoals | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // --- today tab ---
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [dailyForm, setDailyForm] = useState<Partial<FitnessDaily>>({
    workout: false,
    mobility: false,
    training_quality: null,
    notes: '',
    weight_lbs: null,
    body_fat_pct: null,
  });

  // --- weekly tab ---
  const [weeklyDate, setWeeklyDate] = useState(() => {
    const mondays = getPreviousMondays(1);
    return mondays[0];
  });
  const [weeklyForm, setWeeklyForm] = useState<Partial<FitnessWeekly>>({
    photo_taken: false,
  });

  // --- history tab ---
  const [historyEntries, setHistoryEntries] = useState<FitnessDaily[]>([]);

  // --- trends tab ---
  const [weightTrend, setWeightTrend] = useState<{ date: string; weight_lbs: number }[]>([]);
  const [bodyFatTrend, setBodyFatTrend] = useState<{ date: string; body_fat_pct: number }[]>([]);
  const [last30Daily, setLast30Daily] = useState<FitnessDaily[]>([]);

  // =========================================================================
  // Data fetching
  // =========================================================================

  const fetchGoals = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('fitness_goals')
      .select('*')
      .eq('user_id', effectiveUserId)
      .single();
    if (data) setGoals(data as FitnessGoals);
  }, [user, effectiveUserId]);

  const fetchDaily = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('fitness_daily')
      .select('*')
      .eq('user_id', effectiveUserId)
      .eq('date', selectedDate)
      .single();
    if (data) {
      setDailyForm(data as FitnessDaily);
    } else {
      setDailyForm({ workout: false, mobility: false, training_quality: null, notes: '', weight_lbs: null, body_fat_pct: null });
    }
  }, [user, selectedDate, effectiveUserId]);

  const fetchWeekly = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('fitness_weekly')
      .select('*')
      .eq('user_id', effectiveUserId)
      .eq('date', weeklyDate)
      .single();
    if (data) {
      setWeeklyForm(data as FitnessWeekly);
    } else {
      setWeeklyForm({ photo_taken: false });
    }
  }, [user, weeklyDate, effectiveUserId]);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('fitness_daily')
      .select('*')
      .eq('user_id', effectiveUserId)
      .order('date', { ascending: false })
      .limit(14);
    if (data) setHistoryEntries(data as FitnessDaily[]);
  }, [user, effectiveUserId]);

  const fetchTrends = useCallback(async () => {
    if (!user) return;

    // Weight trend from daily entries where weight_lbs is not null
    const { data: wData } = await supabase
      .from('fitness_daily')
      .select('date, weight_lbs')
      .eq('user_id', effectiveUserId)
      .not('weight_lbs', 'is', null)
      .order('date');
    if (wData) setWeightTrend(wData as { date: string; weight_lbs: number }[]);

    // Body fat trend from daily entries where body_fat_pct is not null
    const { data: bfData } = await supabase
      .from('fitness_daily')
      .select('date, body_fat_pct')
      .eq('user_id', effectiveUserId)
      .not('body_fat_pct', 'is', null)
      .order('date');
    if (bfData) setBodyFatTrend(bfData as { date: string; body_fat_pct: number }[]);

    // Last 30 days of daily entries
    const thirtyAgo = shiftDate(getToday(), -30);
    const { data: dData } = await supabase
      .from('fitness_daily')
      .select('*')
      .eq('user_id', effectiveUserId)
      .gte('date', thirtyAgo)
      .order('date', { ascending: true });
    if (dData) setLast30Daily(dData as FitnessDaily[]);
  }, [user, effectiveUserId]);

  // =========================================================================
  // Effects
  // =========================================================================

  useEffect(() => {
    if (!user) return;
    fetchGoals();
  }, [user, fetchGoals]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'today') fetchDaily();
  }, [user, activeTab, fetchDaily]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'weekly') fetchWeekly();
  }, [user, activeTab, fetchWeekly]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'history') fetchHistory();
  }, [user, activeTab, fetchHistory]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'trends') fetchTrends();
  }, [user, activeTab, fetchTrends]);

  // =========================================================================
  // Save handlers
  // =========================================================================

  const flash = (msg: string) => {
    setSaveMessage(msg);
    setTimeout(() => setSaveMessage(''), 2500);
  };

  const saveDaily = async () => {
    if (!user) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      user_id: user.id,
      date: selectedDate,
    };
    dailyFields.forEach((f) => {
      const v = (dailyForm as Record<string, unknown>)[f.name];
      payload[f.name] = v === '' || v === undefined ? null : Number(v);
    });
    toggleFields.forEach((f) => {
      payload[f.name] = !!(dailyForm as Record<string, unknown>)[f.name];
    });
    payload.training_quality =
      dailyForm.training_quality === null || dailyForm.training_quality === undefined
        ? null
        : Number(dailyForm.training_quality);
    payload.notes = dailyForm.notes || null;

    // Weight and body fat now live on fitness_daily
    const weightVal = dailyForm.weight_lbs;
    const bfVal = dailyForm.body_fat_pct;
    payload.weight_lbs = weightVal === null || weightVal === undefined || weightVal === ('' as unknown) ? null : Number(weightVal);
    payload.body_fat_pct = bfVal === null || bfVal === undefined || bfVal === ('' as unknown) ? null : Number(bfVal);

    const { error } = await supabase
      .from('fitness_daily')
      .upsert(payload, { onConflict: 'user_id,date' });

    setSaving(false);
    flash(error ? `Error: ${error.message}` : 'Saved!');
  };

  const saveWeekly = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      date: weeklyDate,
      photo_taken: !!weeklyForm.photo_taken,
    };
    const { error } = await supabase
      .from('fitness_weekly')
      .upsert(payload, { onConflict: 'user_id,date' });
    setSaving(false);
    flash(error ? `Error: ${error.message}` : 'Saved!');
  };

  // =========================================================================
  // Derived values
  // =========================================================================

  const challengeDay = goals ? getDayOfChallenge(goals.challenge_start_date) : null;

  function goalValue(key: string): number | undefined {
    if (!goals) return undefined;
    return (goals as unknown as Record<string, number>)[key] ?? undefined;
  }

  // Scorecard calculation
  function buildScorecard() {
    if (!goals || last30Daily.length === 0) return [];

    const metrics: { label: string; field: keyof FitnessDaily; goalMin?: string; goalMax?: string }[] = [
      { label: 'Calories', field: 'calories_consumed', goalMax: 'calories_max' },
      { label: 'Protein', field: 'protein_g', goalMin: 'protein_min' },
      { label: 'Steps', field: 'steps', goalMin: 'steps_min' },
      { label: 'Sleep', field: 'sleep_hours', goalMin: 'sleep_min' },
      { label: 'Calories Burned', field: 'calories_burned', goalMin: 'calories_burned_min' },
      { label: 'Fiber', field: 'fiber_g', goalMin: 'fiber_min', goalMax: 'fiber_max' },
    ];

    return metrics.map((m) => {
      const min = m.goalMin ? goalValue(m.goalMin) : undefined;
      const max = m.goalMax ? goalValue(m.goalMax) : undefined;
      let hits = 0;
      last30Daily.forEach((d) => {
        const v = d[m.field] as number | null;
        if (v === null) return;
        if (min !== undefined && max !== undefined) {
          if (v >= min && v <= max) hits++;
        } else if (min !== undefined) {
          if (v >= min) hits++;
        } else if (max !== undefined) {
          if (v <= max) hits++;
        }
      });
      return { label: m.label, hits, total: last30Daily.length };
    });
  }

  // =========================================================================
  // Render guards
  // =========================================================================

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <p className="text-zinc-400 p-8">Please sign in to view fitness data.</p>;
  }

  // =========================================================================
  // Sub-renders
  // =========================================================================

  const renderTodayTab = () => (
    <div className="space-y-6">
      {/* Challenge banner */}
      {goals && challengeDay !== null && (
        <div className="flex items-center gap-3 bg-blue-600/20 border border-blue-600/40 rounded-lg px-4 py-3">
          <Target className="h-5 w-5 text-blue-400" />
          <span className="text-blue-300 font-medium">
            {goals.challenge_name}: Day {challengeDay} of {goals.challenge_days}
          </span>
        </div>
      )}

      {/* Date selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
        />
        <button
          onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => setSelectedDate(getToday())}
          className="text-sm text-blue-400 hover:text-blue-300 ml-2"
        >
          Today
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Entry &mdash; {formatDate(selectedDate)}</CardTitle>
        </CardHeader>

        {/* Weight & Body Fat (optional, at the top) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <Weight className="h-4 w-4" />
              Weight (lbs)
              {goals && <span className="text-xs text-zinc-500">(goal: {goals.goal_weight})</span>}
            </label>
            <input
              type="number"
              step="0.1"
              value={dailyForm.weight_lbs ?? ''}
              onChange={(e) =>
                setDailyForm((prev) => ({
                  ...prev,
                  weight_lbs: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              disabled={isViewingOther}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
              placeholder="— (optional)"
            />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <TrendingUp className="h-4 w-4" />
              Body Fat %
              {goals && <span className="text-xs text-zinc-500">(goal: {goals.goal_body_fat}%)</span>}
            </label>
            <input
              type="number"
              step="0.1"
              value={dailyForm.body_fat_pct ?? ''}
              onChange={(e) =>
                setDailyForm((prev) => ({
                  ...prev,
                  body_fat_pct: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              disabled={isViewingOther}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50"
              placeholder="— (optional)"
            />
          </div>
        </div>

        {/* Numeric fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dailyFields.map((f) => {
            const val = (dailyForm as Record<string, unknown>)[f.name] as number | null;
            const min = f.goalMin ? goalValue(f.goalMin) : undefined;
            const max = f.goalMax ? goalValue(f.goalMax) : undefined;
            const color = getStatusColor(val !== null && val !== undefined ? Number(val) : null, min, max);
            const Icon = f.icon;
            return (
              <div key={f.name} className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  <Icon className="h-4 w-4" />
                  {f.label}
                  {min !== undefined && max !== undefined && (
                    <span className="text-xs text-zinc-500">({min}-{max})</span>
                  )}
                  {min !== undefined && max === undefined && (
                    <span className="text-xs text-zinc-500">(min {min})</span>
                  )}
                  {max !== undefined && min === undefined && (
                    <span className="text-xs text-zinc-500">(max {max})</span>
                  )}
                </label>
                <input
                  type="number"
                  value={val ?? ''}
                  onChange={(e) =>
                    setDailyForm((prev) => ({
                      ...prev,
                      [f.name]: e.target.value === '' ? null : e.target.value,
                    }))
                  }
                  disabled={isViewingOther}
                  className={cn(
                    'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50',
                    color
                  )}
                  placeholder="—"
                />
              </div>
            );
          })}
        </div>

        {/* Toggle fields */}
        <div className="flex flex-wrap gap-4 mt-6">
          {toggleFields.map((f) => {
            const checked = !!(dailyForm as Record<string, unknown>)[f.name];
            return (
              <button
                key={f.name}
                onClick={() =>
                  setDailyForm((prev) => ({
                    ...prev,
                    [f.name]: !checked,
                  }))
                }
                disabled={isViewingOther}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50',
                  checked
                    ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                )}
              >
                {checked ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Training quality slider */}
        <div className="mt-6 space-y-2">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <Dumbbell className="h-4 w-4" />
            Training Quality: {dailyForm.training_quality ?? '—'} / 10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={dailyForm.training_quality ?? 5}
            onChange={(e) =>
              setDailyForm((prev) => ({
                ...prev,
                training_quality: Number(e.target.value),
              }))
            }
            disabled={isViewingOther}
            className="w-full max-w-sm accent-blue-500 disabled:opacity-50"
          />
        </div>

        {/* Notes */}
        <div className="mt-6 space-y-1">
          <label className="text-sm text-zinc-400">Notes</label>
          <textarea
            value={dailyForm.notes ?? ''}
            onChange={(e) => setDailyForm((prev) => ({ ...prev, notes: e.target.value }))}
            rows={2}
            disabled={isViewingOther}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none disabled:opacity-50"
            placeholder="Optional notes..."
          />
        </div>

        {/* Save */}
        {!isViewingOther && (
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={saveDaily}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
            {saveMessage && (
              <span className={cn('text-sm', saveMessage.startsWith('Error') ? 'text-red-400' : 'text-emerald-400')}>
                {saveMessage}
              </span>
            )}
          </div>
        )}
      </Card>
    </div>
  );

  const renderWeeklyTab = () => {
    const mondays = getPreviousMondays(8);
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Progress Photo</CardTitle>
          </CardHeader>

          {/* Monday selector */}
          <div className="mb-6">
            <label className="text-sm text-zinc-400 block mb-2">Week of (Monday)</label>
            <select
              value={weeklyDate}
              onChange={(e) => setWeeklyDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              {mondays.map((m) => (
                <option key={m} value={m}>
                  {formatDate(m)}
                </option>
              ))}
            </select>
          </div>

          {/* Photo taken toggle */}
          <div>
            <button
              onClick={() => setWeeklyForm((prev) => ({ ...prev, photo_taken: !prev.photo_taken }))}
              disabled={isViewingOther}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50',
                weeklyForm.photo_taken
                  ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              )}
            >
              {weeklyForm.photo_taken ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              Progress Photo Taken
            </button>
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Track whether you took your weekly progress photo. Weight and body fat are now logged in the daily entry.
          </p>

          {/* Save */}
          {!isViewingOther && (
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={saveWeekly}
                disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
              {saveMessage && (
                <span className={cn('text-sm', saveMessage.startsWith('Error') ? 'text-red-400' : 'text-emerald-400')}>
                  {saveMessage}
                </span>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderHistoryTab = () => (
    <Card>
      <CardHeader>
        <CardTitle>Last 14 Days</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-800">
              <th className="text-left py-2 px-2">Date</th>
              <th className="text-right py-2 px-2">Weight</th>
              <th className="text-right py-2 px-2">BF%</th>
              <th className="text-right py-2 px-2">Cals</th>
              <th className="text-right py-2 px-2">Protein</th>
              <th className="text-right py-2 px-2">Steps</th>
              <th className="text-right py-2 px-2">Sleep</th>
              <th className="text-center py-2 px-2">Workout</th>
              <th className="text-right py-2 px-2">Quality</th>
            </tr>
          </thead>
          <tbody>
            {historyEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-2 px-2 text-zinc-300">{formatDate(entry.date)}</td>
                <td className="text-right py-2 px-2 text-zinc-300">
                  {entry.weight_lbs ?? '—'}
                </td>
                <td className="text-right py-2 px-2 text-zinc-300">
                  {entry.body_fat_pct != null ? `${entry.body_fat_pct}%` : '—'}
                </td>
                <td className={cn('text-right py-2 px-2', getStatusColor(entry.calories_consumed, undefined, goalValue('calories_max')))}>
                  {entry.calories_consumed ?? '—'}
                </td>
                <td className={cn('text-right py-2 px-2', getStatusColor(entry.protein_g, goalValue('protein_min')))}>
                  {entry.protein_g ?? '—'}
                </td>
                <td className={cn('text-right py-2 px-2', getStatusColor(entry.steps, goalValue('steps_min')))}>
                  {entry.steps != null ? entry.steps.toLocaleString() : '—'}
                </td>
                <td className={cn('text-right py-2 px-2', getStatusColor(entry.sleep_hours, goalValue('sleep_min')))}>
                  {entry.sleep_hours ?? '—'}
                </td>
                <td className="text-center py-2 px-2">
                  {entry.workout ? (
                    <Check className="h-4 w-4 text-emerald-400 inline" />
                  ) : (
                    <X className="h-4 w-4 text-zinc-600 inline" />
                  )}
                </td>
                <td className="text-right py-2 px-2 text-zinc-300">
                  {entry.training_quality ?? '—'}
                </td>
              </tr>
            ))}
            {historyEntries.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-zinc-500 py-8">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const renderTrendsTab = () => {
    const scorecard = buildScorecard();

    const weightData = weightTrend.map((w) => ({
      date: formatDate(w.date),
      weight: w.weight_lbs,
    }));

    const bfData = bodyFatTrend.map((w) => ({
      date: formatDate(w.date),
      bf: w.body_fat_pct,
    }));

    const deficitData = last30Daily.map((d) => ({
      date: formatDate(d.date),
      deficit:
        d.calories_burned !== null && d.calories_consumed !== null
          ? d.calories_burned - d.calories_consumed
          : null,
    }));

    const chartTooltipStyle = {
      contentStyle: { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 },
      labelStyle: { color: '#a1a1aa' },
      itemStyle: { color: '#fff' },
    };

    return (
      <div className="space-y-6">
        {/* Weight trend */}
        <Card>
          <CardHeader>
            <CardTitle>Weight Trend</CardTitle>
          </CardHeader>
          {weightData.length > 1 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip {...chartTooltipStyle} />
                {goals && (
                  <ReferenceLine y={goals.goal_weight} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'Goal', fill: '#3b82f6', fontSize: 12 }} />
                )}
                <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm">Not enough data to chart.</p>
          )}
        </Card>

        {/* Body fat trend */}
        <Card>
          <CardHeader>
            <CardTitle>Body Fat % Trend</CardTitle>
          </CardHeader>
          {bfData.length > 1 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={bfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} domain={['dataMin - 1', 'dataMax + 1']} />
                <Tooltip {...chartTooltipStyle} />
                {goals && (
                  <ReferenceLine y={goals.goal_body_fat} stroke="#10b981" strokeDasharray="5 5" label={{ value: 'Goal', fill: '#10b981', fontSize: 12 }} />
                )}
                <Line type="monotone" dataKey="bf" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm">Not enough data to chart.</p>
          )}
        </Card>

        {/* Calorie deficit chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Calorie Deficit (Last 30 Days)</CardTitle>
          </CardHeader>
          {deficitData.filter((d) => d.deficit !== null).length > 1 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={deficitData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                <Tooltip {...chartTooltipStyle} />
                <ReferenceLine y={0} stroke="#71717a" />
                <Bar dataKey="deficit" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm">Not enough data to chart.</p>
          )}
        </Card>

        {/* Scorecard */}
        <Card>
          <CardHeader>
            <CardTitle>30-Day Scorecard</CardTitle>
          </CardHeader>
          {scorecard.length > 0 ? (
            <div className="space-y-3">
              {scorecard.map((s) => {
                const pct = s.total > 0 ? Math.round((s.hits / s.total) * 100) : 0;
                const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
                return (
                  <div key={s.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-zinc-300">{s.label}</span>
                      <span className="text-zinc-400">
                        {s.hits}/{s.total} days ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No daily data available for the last 30 days.</p>
          )}
        </Card>
      </div>
    );
  };

  // =========================================================================
  // Main render
  // =========================================================================

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Dumbbell className="h-7 w-7 text-blue-500" />
          Fitness
        </h1>

        {householdUsers.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">Viewing:</span>
            <select
              value={viewingUserId ?? user!.id}
              onChange={(e) => setViewingUserId(e.target.value === user!.id ? null : e.target.value)}
              className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
            >
              {householdUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === user!.id ? 'My Data' : u.email}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isViewingOther && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-lg text-sm">
          Viewing read-only — this is {householdUsers.find(u => u.id === viewingUserId)?.email}&apos;s data
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center',
                activeTab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'today' && renderTodayTab()}
      {activeTab === 'weekly' && renderWeeklyTab()}
      {activeTab === 'history' && renderHistoryTab()}
      {activeTab === 'trends' && renderTrendsTab()}
    </div>
  );
}
