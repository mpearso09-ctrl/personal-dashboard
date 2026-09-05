'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { MilestoneType, MilestoneEntry } from '@/lib/types';
import { DEFAULT_WEIGHTLIFTING_MILESTONES, DEFAULT_CARDIO_MILESTONES, REP_MAXES } from '@/lib/types';
import { cn, formatDate, getToday } from '@/lib/utils';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, Pencil, Plus, Save, Trash2, Trophy } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';

const REPMAX_COLORS: Record<number, string> = {
  1: '#3b82f6',
  2: '#8b5cf6',
  3: '#ec4899',
  4: '#f97316',
  5: '#10b981',
  10: '#eab308',
};

export function MilestonesTab({ userId, isReadOnly }: { userId: string; isReadOnly: boolean }) {
  const supabase = createClient();

  const [milestoneTypes, setMilestoneTypes] = useState<MilestoneType[]>([]);
  const [entries, setEntries] = useState<MilestoneEntry[]>([]);
  const [view, setView] = useState<'grid' | 'detail'>('grid');
  const [selectedType, setSelectedType] = useState<MilestoneType | null>(null);
  const [showAddEntry, setShowAddEntry] = useState<string | null>(null); // milestone type id
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);

  // New entry form
  const [entryDate, setEntryDate] = useState(getToday());
  const [entryValue, setEntryValue] = useState('');
  const [entryRepMax, setEntryRepMax] = useState<number>(1);
  const [entryNotes, setEntryNotes] = useState('');
  const [entrySaving, setEntrySaving] = useState(false);
  const [justPR, setJustPR] = useState(false);

  // Custom milestone form
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState<'weightlifting' | 'cardio' | 'custom'>('custom');
  const [newTypeUnit, setNewTypeUnit] = useState<'lbs' | 'seconds' | 'pace'>('lbs');

  // Log vs Results screen
  const [milestoneScreen, setMilestoneScreen] = useState<'log' | 'results'>('results');
  const [logTypeId, setLogTypeId] = useState<string>('');

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const load = useCallback(async () => {
    const [typesRes, entriesRes] = await Promise.all([
      supabase.from('milestone_types').select('*').eq('user_id', userId).eq('hidden', false).order('sort_order'),
      supabase.from('milestone_entries').select('*').eq('user_id', userId).order('date', { ascending: false }),
    ]);
    setMilestoneTypes(typesRes.data ?? []);
    setEntries(entriesRes.data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // -------------------------------------------------------------------------
  // Seed defaults
  // -------------------------------------------------------------------------

  async function seedDefaults() {
    const wLifting = DEFAULT_WEIGHTLIFTING_MILESTONES.map((m) => ({
      user_id: userId,
      name: m.name,
      category: 'weightlifting' as const,
      unit: 'lbs' as const,
      is_default: true,
      sort_order: m.sort_order,
      hidden: false,
    }));
    const cardio = DEFAULT_CARDIO_MILESTONES.map((m) => ({
      user_id: userId,
      name: m.name,
      category: 'cardio' as const,
      unit: m.unit,
      is_default: true,
      sort_order: m.sort_order,
      hidden: false,
    }));
    await supabase.from('milestone_types').insert([...wLifting, ...cardio]);
    await load();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function getBest(typeId: string, repMax: number | null): MilestoneEntry | null {
    const matching = entries.filter(
      (e) => e.milestone_type_id === typeId && e.rep_max === repMax
    );
    if (!matching.length) return null;
    const type = milestoneTypes.find((t) => t.id === typeId);
    if (type?.unit === 'lbs') {
      return matching.reduce((best, e) => (e.value > best.value ? e : best));
    }
    return matching.reduce((best, e) => (e.value < best.value ? e : best));
  }

  function formatValue(value: number, unit: string): string {
    if (unit === 'lbs') return `${value} lbs`;
    if (unit === 'seconds') {
      const m = Math.floor(value / 60);
      const s = Math.round(value % 60);
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
    if (unit === 'pace') {
      const h = Math.floor(value / 3600);
      const m = Math.floor((value % 3600) / 60);
      const s = Math.round(value % 60);
      return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
    }
    return `${value}`;
  }

  function parseTimeInput(input: string): number {
    if (!input.includes(':')) return parseFloat(input);
    const parts = input.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  function checkIsPR(typeId: string, repMax: number | null, newValue: number, unit: string): boolean {
    const best = getBest(typeId, repMax);
    if (!best) return true;
    if (unit === 'lbs') return newValue > best.value;
    return newValue < best.value;
  }

  // -------------------------------------------------------------------------
  // Add entry handler
  // -------------------------------------------------------------------------

  async function handleAddEntry(typeId: string) {
    const type = milestoneTypes.find((t) => t.id === typeId);
    if (!type) return;
    setEntrySaving(true);
    const rawValue =
      type.unit === 'lbs' ? parseFloat(entryValue) : parseTimeInput(entryValue);
    const repMax = type.category === 'weightlifting' ? entryRepMax : null;
    const isPR = checkIsPR(typeId, repMax, rawValue, type.unit);

    await supabase.from('milestone_entries').insert({
      user_id: userId,
      milestone_type_id: typeId,
      rep_max: repMax,
      value: rawValue,
      date: entryDate,
      notes: entryNotes || null,
      is_pr: isPR,
    });

    if (isPR) setJustPR(true);
    setEntryValue('');
    setEntryNotes('');
    setEntrySaving(false);
    await load();
    if (isPR) setTimeout(() => setJustPR(false), 3000);
  }

  // -------------------------------------------------------------------------
  // Hide type
  // -------------------------------------------------------------------------

  async function hideType(typeId: string) {
    await supabase.from('milestone_types').update({ hidden: true }).eq('id', typeId);
    await load();
  }

  // -------------------------------------------------------------------------
  // Delete entry
  // -------------------------------------------------------------------------

  async function deleteEntry(entryId: string) {
    await supabase.from('milestone_entries').delete().eq('id', entryId);
    await load();
    // Refresh selected type entries in detail view
    if (selectedType) {
      const found = milestoneTypes.find((t) => t.id === selectedType.id);
      if (found) setSelectedType(found);
    }
  }

  // -------------------------------------------------------------------------
  // Add custom type
  // -------------------------------------------------------------------------

  async function handleAddType() {
    if (!newTypeName.trim()) return;
    const maxSort = milestoneTypes.reduce((m, t) => Math.max(m, t.sort_order), -1);
    await supabase.from('milestone_types').insert({
      user_id: userId,
      name: newTypeName.trim(),
      category: newTypeCategory,
      unit: newTypeUnit,
      is_default: false,
      sort_order: maxSort + 1,
      hidden: false,
    });
    setNewTypeName('');
    setShowAddType(false);
    await load();
  }

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const weightliftingTypes = milestoneTypes.filter((t) => t.category === 'weightlifting');
  const cardioTypes = milestoneTypes.filter((t) => t.category === 'cardio');
  const customTypes = milestoneTypes.filter((t) => t.category === 'custom');

  const chartTooltipStyle = {
    contentStyle: { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 },
    labelStyle: { color: '#a1a1aa' },
    itemStyle: { color: '#fff' },
  };

  // -------------------------------------------------------------------------
  // Log screen — stable component, no remounting on keystroke
  // -------------------------------------------------------------------------

  function renderLogScreen() {
    const allTypes = [...milestoneTypes].sort((a, b) => a.name.localeCompare(b.name));
    const activeType = allTypes.find((t) => t.id === logTypeId) ?? allTypes[0] ?? null;
    const isWeightlifting = activeType?.category === 'weightlifting';

    return (
      <div className="space-y-6 max-w-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMilestoneScreen('results')}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors min-h-[44px] pr-3"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Results
          </button>
          <h2 className="text-lg font-semibold text-white">Log Entry</h2>
        </div>

        {allTypes.length === 0 ? (
          <p className="text-zinc-500">No milestones set up. Go to Results and load defaults first.</p>
        ) : (
          <Card>
            <div className="space-y-4">
              {/* Milestone selector */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Milestone</label>
                <select
                  value={activeType?.id ?? ''}
                  onChange={(e) => { setLogTypeId(e.target.value); setEntryValue(''); setEntryRepMax(1); }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  {(['weightlifting', 'cardio', 'custom'] as const).map((cat) => {
                    const catTypes = allTypes.filter((t) => t.category === cat);
                    if (!catTypes.length) return null;
                    return (
                      <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                        {catTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              {activeType && (
                <>
                  {/* Rep max selector (weightlifting only) */}
                  {isWeightlifting && (
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Rep Max</label>
                      <div className="flex gap-2 flex-wrap">
                        {REP_MAXES.map((rm) => (
                          <button
                            key={rm}
                            onClick={() => setEntryRepMax(rm)}
                            className={cn(
                              'px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors min-h-[44px]',
                              entryRepMax === rm
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                            )}
                          >
                            {rm}RM
                          </button>
                        ))}
                      </div>
                      {/* Show current best for this RM */}
                      {(() => {
                        const best = getBest(activeType.id, entryRepMax);
                        return best ? (
                          <p className="text-xs text-zinc-500 mt-1">
                            Current best: <span className="text-amber-400">{formatValue(best.value, activeType.unit)}</span> on {formatDate(best.date)}
                          </p>
                        ) : <p className="text-xs text-zinc-500 mt-1">No previous entry for {entryRepMax}RM</p>;
                      })()}
                    </div>
                  )}

                  {/* Value input */}
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">
                      {activeType.unit === 'lbs' ? 'Weight (lbs)' : activeType.unit === 'seconds' ? 'Time (seconds or m:ss)' : 'Time (mm:ss or h:mm:ss)'}
                    </label>
                    <input
                      type="text"
                      value={entryValue}
                      onChange={(e) => setEntryValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && entryValue) handleAddEntry(activeType.id); }}
                      placeholder={activeType.unit === 'lbs' ? 'e.g. 225' : activeType.unit === 'seconds' ? 'e.g. 90 or 1:30' : 'e.g. 25:30'}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2.5 text-lg text-white focus:border-blue-500 focus:outline-none"
                      autoFocus
                    />
                    {/* Show current best for cardio */}
                    {!isWeightlifting && (() => {
                      const best = getBest(activeType.id, null);
                      return best ? (
                        <p className="text-xs text-zinc-500 mt-1">
                          Current best: <span className="text-amber-400">{formatValue(best.value, activeType.unit)}</span> on {formatDate(best.date)}
                        </p>
                      ) : <p className="text-xs text-zinc-500 mt-1">No previous entries</p>;
                    })()}
                  </div>

                  {/* Date and notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Date</label>
                      <input
                        type="date"
                        value={entryDate}
                        onChange={(e) => setEntryDate(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Notes (optional)</label>
                      <input
                        type="text"
                        value={entryNotes}
                        onChange={(e) => setEntryNotes(e.target.value)}
                        placeholder="e.g. felt strong"
                        className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none min-h-[44px]"
                      />
                    </div>
                  </div>

                  {/* Save */}
                  <button
                    onClick={() => handleAddEntry(activeType.id)}
                    disabled={entrySaving || !entryValue}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg text-sm font-semibold transition-colors min-h-[44px]"
                  >
                    <Save className="h-4 w-4" />
                    {entrySaving ? 'Saving...' : 'Save Entry'}
                  </button>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Detail view
  // -------------------------------------------------------------------------

  function renderDetailView() {
    if (!selectedType) return null;
    const typeEntries = entries
      .filter((e) => e.milestone_type_id === selectedType.id)
      .sort((a, b) => b.date.localeCompare(a.date));

    const isWeightlifting = selectedType.category === 'weightlifting';

    // Build chart data
    let chartData: Record<string, unknown>[] = [];
    if (isWeightlifting) {
      // Group by date, one value per rep max
      const dateMap = new Map<string, Record<string, unknown>>();
      typeEntries.forEach((e) => {
        if (!dateMap.has(e.date)) dateMap.set(e.date, { date: formatDate(e.date) });
        const key = `rm${e.rep_max}`;
        const existing = (dateMap.get(e.date)![key] as number | undefined);
        const better = selectedType.unit === 'lbs'
          ? existing === undefined || e.value > existing
          : existing === undefined || e.value < existing;
        if (better) dateMap.get(e.date)![key] = e.value;
      });
      chartData = Array.from(dateMap.values()).sort((a, b) =>
        String(a.date).localeCompare(String(b.date))
      );
    } else {
      chartData = typeEntries
        .map((e) => ({ date: formatDate(e.date), value: e.value, is_pr: e.is_pr }))
        .reverse();
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView('grid'); setSelectedType(null); }}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors min-h-[44px] pr-3"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <h2 className="text-lg font-semibold text-white">{selectedType.name}</h2>
          <span className="text-xs text-zinc-500 capitalize">{selectedType.unit}</span>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Progress Over Time</CardTitle>
          </CardHeader>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} />
                {isWeightlifting ? (
                  REP_MAXES.map((rm) => (
                    <Line
                      key={rm}
                      type="monotone"
                      dataKey={`rm${rm}`}
                      name={`${rm}RM`}
                      stroke={REPMAX_COLORS[rm]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                  ))
                ) : (
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={selectedType.unit}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={(props: Record<string, unknown>) => {
                      const { cx, cy, payload } = props as { cx: number; cy: number; payload: { is_pr: boolean } };
                      return (
                        <circle
                          key={`dot-${cx}-${cy}`}
                          cx={cx}
                          cy={cy}
                          r={payload.is_pr ? 6 : 3}
                          fill={payload.is_pr ? '#eab308' : '#3b82f6'}
                          stroke={payload.is_pr ? '#854d0e' : '#1d4ed8'}
                          strokeWidth={1}
                        />
                      );
                    }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm">Not enough data to chart.</p>
          )}
        </Card>

        {/* Entry table */}
        <Card>
          <CardHeader>
            <CardTitle>All Entries</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-800">
                  <th className="text-left py-2 px-2">Date</th>
                  {isWeightlifting && <th className="text-center py-2 px-2">Rep Max</th>}
                  <th className="text-right py-2 px-2">Value</th>
                  <th className="text-center py-2 px-2">PR</th>
                  <th className="text-left py-2 px-2">Notes</th>
                  {!isReadOnly && <th className="text-center py-2 px-2">Del</th>}
                </tr>
              </thead>
              <tbody>
                {typeEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-2 px-2 text-zinc-300">{formatDate(entry.date)}</td>
                    {isWeightlifting && (
                      <td className="py-2 px-2 text-center text-zinc-300">{entry.rep_max}RM</td>
                    )}
                    <td className="py-2 px-2 text-right font-medium text-white">
                      {formatValue(entry.value, selectedType.unit)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {entry.is_pr && <span className="text-amber-400 text-xs font-semibold">PR</span>}
                    </td>
                    <td className="py-2 px-2 text-zinc-400 text-xs">{entry.notes ?? ''}</td>
                    {!isReadOnly && (
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="text-zinc-600 hover:text-red-400 transition-colors p-2 inline-flex items-center justify-center min-h-[44px] min-w-[44px]"
                          title="Delete entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {typeEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan={isWeightlifting ? (isReadOnly ? 5 : 6) : (isReadOnly ? 4 : 5)}
                      className="text-center text-zinc-500 py-8"
                    >
                      No entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Grid view
  // -------------------------------------------------------------------------

  function renderGridView() {
    // 1RM bar chart data
    const oneRMData = weightliftingTypes
      .map((t) => {
        const best = getBest(t.id, 1);
        return best ? { name: t.name, value: best.value } : null;
      })
      .filter(Boolean) as { name: string; value: number }[];

    function WeightliftingCard({ type }: { type: MilestoneType }) {
      const isOpen = showAddEntry === type.id;
      return (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => { setSelectedType(type); setView('detail'); }}
              className="text-sm font-semibold text-white hover:text-blue-400 transition-colors text-left"
            >
              {type.name}
            </button>
            <div className="flex items-center gap-2">
              {editMode && (
                <button
                  onClick={() => hideType(type.id)}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors border border-zinc-700 rounded px-2 py-0.5"
                >
                  Hide
                </button>
              )}
              {!isReadOnly && !editMode && (
                <button
                  onClick={() => { setLogTypeId(type.id); setEntryValue(''); setEntryRepMax(1); setMilestoneScreen('log'); }}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-600/40 rounded px-2 py-0.5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Log
                </button>
              )}
            </div>
          </div>

          {/* Rep max grid */}
          <div className="grid grid-cols-6 gap-1 text-center">
            {REP_MAXES.map((rm) => {
              const best = getBest(type.id, rm);
              return (
                <div key={rm} className="bg-zinc-900/60 rounded p-1.5">
                  <div className="text-[10px] text-zinc-500 mb-0.5">{rm}RM</div>
                  <div className="text-xs font-medium text-white leading-tight">
                    {best ? best.value : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    function CardioCard({ type }: { type: MilestoneType }) {
      const isOpen = showAddEntry === type.id;
      const typeEntries = entries
        .filter((e) => e.milestone_type_id === type.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      const last10 = typeEntries.slice(-10);
      const best = getBest(type.id, null);

      return (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <button
              onClick={() => { setSelectedType(type); setView('detail'); }}
              className="text-sm font-semibold text-white hover:text-blue-400 transition-colors text-left"
            >
              {type.name}
            </button>
            <div className="flex items-center gap-2">
              {editMode && (
                <button
                  onClick={() => hideType(type.id)}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors border border-zinc-700 rounded px-2 py-0.5"
                >
                  Hide
                </button>
              )}
              {!isReadOnly && !editMode && (
                <button
                  onClick={() => { setLogTypeId(type.id); setEntryValue(''); setMilestoneScreen('log'); }}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-600/40 rounded px-2 py-0.5 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Log
                </button>
              )}
            </div>
          </div>

          {best && (
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-lg font-bold text-amber-400">{formatValue(best.value, type.unit)}</span>
              <span className="text-xs text-zinc-500">{formatDate(best.date)}</span>
            </div>
          )}

          {/* Sparkline */}
          {last10.length > 1 && (
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={last10.map((e) => ({ date: e.date, value: e.value }))}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* Weightlifting section */}
        {weightliftingTypes.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">Weightlifting</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {weightliftingTypes.map((type) => (
                <WeightliftingCard key={type.id} type={type} />
              ))}
            </div>
          </div>
        )}

        {/* Cardio section */}
        {cardioTypes.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">Cardio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cardioTypes.map((type) => (
                <CardioCard key={type.id} type={type} />
              ))}
            </div>
          </div>
        )}

        {/* Custom section */}
        {customTypes.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">Custom</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {customTypes.map((type) => (
                <CardioCard key={type.id} type={type} />
              ))}
            </div>
          </div>
        )}

        {/* 1RM comparison bar chart */}
        {oneRMData.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>1RM Comparison</CardTitle>
            </CardHeader>
            <ResponsiveContainer width="100%" height={Math.max(200, oneRMData.length * 36)}>
              <BarChart data={oneRMData} layout="vertical" margin={{ left: 80, right: 40, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#e4e4e7', fontSize: 12 }} width={80} />
                <Tooltip {...chartTooltipStyle} formatter={(v: unknown) => [`${v} lbs`, '1RM']} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#a1a1aa', fontSize: 11, formatter: (v: unknown) => `${v} lbs` }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PR celebration toast */}
      {justPR && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-black px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg animate-bounce">
          🎉 New PR!
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Personal Records</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Log / Results toggle */}
          {!isReadOnly && view === 'grid' && milestoneTypes.length > 0 && (
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-sm">
              <button
                onClick={() => setMilestoneScreen('results')}
                className={cn('px-3 py-2.5 transition-colors min-h-[44px]', milestoneScreen === 'results' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white')}
              >
                Results
              </button>
              <button
                onClick={() => { setMilestoneScreen('log'); setEntryValue(''); }}
                className={cn('px-3 py-2.5 transition-colors min-h-[44px]', milestoneScreen === 'log' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white')}
              >
                <span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" />Log Entry</span>
              </button>
            </div>
          )}
          {!isReadOnly && view === 'grid' && milestoneScreen === 'results' && (
            <button
              onClick={() => { setEditMode(!editMode); setShowAddType(false); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm border transition-colors min-h-[44px]',
                editMode
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editMode ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {milestoneTypes.length === 0 && (
        <Card>
          <div className="text-center py-12 space-y-4">
            <Trophy className="h-12 w-12 text-zinc-600 mx-auto" />
            <p className="text-zinc-400">No milestones set up yet.</p>
            {!isReadOnly && (
              <button
                onClick={seedDefaults}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Load Defaults
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Edit mode: add custom milestone form */}
      {editMode && !isReadOnly && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Milestones</CardTitle>
          </CardHeader>
          {!showAddType ? (
            <button
              onClick={() => setShowAddType(true)}
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Custom Milestone
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Name</label>
                  <input
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="e.g. Box Jump"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Category</label>
                  <select
                    value={newTypeCategory}
                    onChange={(e) => setNewTypeCategory(e.target.value as 'weightlifting' | 'cardio' | 'custom')}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white"
                  >
                    <option value="weightlifting">Weightlifting</option>
                    <option value="cardio">Cardio</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Unit</label>
                  <select
                    value={newTypeUnit}
                    onChange={(e) => setNewTypeUnit(e.target.value as 'lbs' | 'seconds' | 'pace')}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-white"
                  >
                    <option value="lbs">lbs</option>
                    <option value="seconds">seconds</option>
                    <option value="pace">pace (mm:ss)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddType}
                  disabled={!newTypeName.trim()}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </button>
                <button
                  onClick={() => { setShowAddType(false); setNewTypeName(''); }}
                  className="px-3 py-1.5 rounded text-sm text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Main content */}
      {milestoneTypes.length > 0 && (
        view === 'detail'
          ? renderDetailView()
          : milestoneScreen === 'log' && !isReadOnly
            ? renderLogScreen()
            : renderGridView()
      )}
    </div>
  );
}
