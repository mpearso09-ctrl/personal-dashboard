'use client';

import { useState, useEffect, useCallback } from 'react';

import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getToday } from '@/lib/utils';
import type { IncomeCategory, IncomeDailyEntry } from '@/lib/types';

import { DEFAULT_INCOME_CATEGORIES } from '@/lib/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { Save, Plus, Check, X, Loader2, Trash2, Settings } from 'lucide-react';
import { InlineEdit, InputField, formatWeekLabel, getLast3Months, getMondayOfWeek, getPastWeekMondays, getWeekEnd } from './shared';

export function IncomeTab({
  householdId,
  canEdit,
}: {
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [showSettings, setShowSettings] = useState(false);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [weekEntries, setWeekEntries] = useState<IncomeDailyEntry[]>([]);
  const [todayEntries, setTodayEntries] = useState<IncomeDailyEntry[]>([]);
  const [chartEntries, setChartEntries] = useState<IncomeDailyEntry[]>([]);
  const [yearEntries, setYearEntries] = useState<IncomeDailyEntry[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>(() => getMondayOfWeek(getToday()));
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [addAmounts, setAddAmounts] = useState<Record<string, string>>({});
  const [addNotes, setAddNotes] = useState<Record<string, string>>({});
  const [addSaving, setAddSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');

  const weekMondays = getPastWeekMondays(12);
  const today = getToday();
  const weekEnd = getWeekEnd(selectedWeek);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('income_categories')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order');
    if (data) setCategories(data);
  }, [householdId]);

  const loadWeekEntries = useCallback(async (monday: string) => {
    const end = getWeekEnd(monday);
    const { data } = await supabase
      .from('income_daily')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', monday)
      .lte('date', end);
    if (data) {
      setWeekEntries(data);
      setTodayEntries(data.filter((e: IncomeDailyEntry) => e.date === getToday()));
    }
  }, [householdId]);

  const loadChartEntries = useCallback(async () => {
    const months = getLast3Months();
    const start = months[0].start;
    const end = months[months.length - 1].end;
    const { data } = await supabase
      .from('income_daily')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', start)
      .lte('date', end);
    if (data) setChartEntries(data);
  }, [householdId]);

  const loadYearEntries = useCallback(async () => {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const { data } = await supabase
      .from('income_daily')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', yearStart)
      .lte('date', getToday());
    if (data) setYearEntries(data);
  }, [householdId]);

  const loadAll = useCallback(async () => {
    await loadCategories();
    await loadWeekEntries(selectedWeek);
    await loadChartEntries();
    await loadYearEntries();
  }, [loadCategories, loadWeekEntries, selectedWeek, loadChartEntries, loadYearEntries]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadWeekEntries(selectedWeek); }, [selectedWeek, loadWeekEntries]);

  const weekSumByCat = (catId: string) =>
    weekEntries.filter((e) => e.category_id === catId).reduce((s, e) => s + e.amount, 0);

  const todayEntriesByCat = (catId: string) =>
    todayEntries.filter((e) => e.category_id === catId);

  const handleAddEntry = async (catId: string) => {
    const amount = parseFloat(addAmounts[catId] || '');
    if (isNaN(amount) || amount <= 0) return;
    setAddSaving(true);
    const t = getToday();
    // Additive upsert: fetch existing, update or insert
    const { data: existing } = await supabase
      .from('income_daily')
      .select('id, amount')
      .eq('household_id', householdId)
      .eq('date', t)
      .eq('category_id', catId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('income_daily')
        .update({ amount: existing.amount + amount, notes: addNotes[catId] || null })
        .eq('id', existing.id);
    } else {
      await supabase.from('income_daily').insert({
        household_id: householdId,
        date: t,
        category_id: catId,
        amount,
        notes: addNotes[catId] || null,
      });
    }
    setAddAmounts((prev) => ({ ...prev, [catId]: '' }));
    setAddNotes((prev) => ({ ...prev, [catId]: '' }));
    setAddSaving(false);
    await loadWeekEntries(selectedWeek);
    await loadChartEntries();
    await loadYearEntries();
  };

  const handleDeleteEntry = async (entryId: string) => {
    await supabase.from('income_daily').delete().eq('id', entryId);
    await loadWeekEntries(selectedWeek);
    await loadChartEntries();
    await loadYearEntries();
  };

  const setCategoryScope = async (catId: string, scope: 'personal' | 'business') => {
    await supabase.from('income_categories').update({ scope }).eq('id', catId);
    await loadCategories();
  };

  const renameCategory = async (catId: string, newName: string) => {
    await supabase.from('income_categories').update({ name: newName }).eq('id', catId);
    await loadCategories();
  };

  const deleteCategory = async (catId: string) => {
    await supabase.from('income_categories').delete().eq('id', catId);
    setDeleteConfirm(null);
    await loadAll();
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    await supabase.from('income_categories').insert({
      household_id: householdId,
      name: newCatName.trim(),
      sort_order: categories.length,
    });
    setNewCatName('');
    await loadCategories();
  };

  const seedDefaults = async () => {
    const rows = DEFAULT_INCOME_CATEGORIES.map((name, i) => ({
      household_id: householdId,
      name,
      sort_order: i,
    }));
    await supabase.from('income_categories').insert(rows);
    await loadAll();
  };

  // YTD derived
  const currentYear = new Date().getFullYear();
  const yearSumByCat = (catId: string) =>
    yearEntries.filter((e) => e.category_id === catId).reduce((s, e) => s + e.amount, 0);
  const grandYearTotal = categories.reduce((s, c) => s + yearSumByCat(c.id), 0);

  // Build chart data: monthly income per category
  const months = getLast3Months();
  const monthlyChartData = months.map(({ label, start, end }) => {
    const row: Record<string, string | number> = { month: label };
    let total = 0;
    categories.forEach((cat) => {
      const sum = chartEntries
        .filter((e) => e.category_id === cat.id && e.date >= start && e.date <= end)
        .reduce((s, e) => s + e.amount, 0);
      row[cat.name] = sum;
      total += sum;
    });
    row['Total'] = total;
    return row;
  });

  const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316'];

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: '#18181b',
      border: '1px solid #3f3f46',
      borderRadius: '8px',
      color: '#fff',
    },
  };

  return (
    <div className="space-y-6">
      {/* Settings toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors min-h-[44px] px-2"
        >
          <Settings className="w-4 h-4" />
          {showSettings ? 'Hide Settings' : 'Manage Categories'}
        </button>
      </div>

      {/* Category management */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Income Categories</CardTitle>
          </CardHeader>
          {categories.length === 0 && (
            <div className="text-center py-6">
              <p className="text-zinc-400 mb-4">No income categories yet.</p>
              {canEdit && (
                <button
                  onClick={seedDefaults}
                  className="flex items-center gap-2 mx-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Seed Defaults
                </button>
              )}
            </div>
          )}
          {categories.length > 0 && (
            <div className="space-y-2 mb-4">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between bg-zinc-800 rounded-lg p-3">
                  <InlineEdit
                    value={cat.name}
                    onSave={(v) => renameCategory(cat.id, v)}
                    className="text-sm font-medium text-white"
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <>
                      <select
                        value={cat.scope ?? 'personal'}
                        onChange={(e) => setCategoryScope(cat.id, e.target.value as 'personal' | 'business')}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 mr-2 min-h-[36px]"
                      >
                        <option value="personal">Personal</option>
                        <option value="business">Business</option>
                      </select>
                      {deleteConfirm === cat.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">Delete?</span>
                          <button onClick={() => deleteCategory(cat.id)} className="p-2.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setDeleteConfirm(null)} className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(cat.id)} className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex items-end gap-3 pt-3 border-t border-zinc-800">
              <InputField
                label="Category Name"
                type="text"
                value={newCatName}
                onChange={setNewCatName}
                placeholder="e.g. Consulting"
                className="flex-1"
              />
              <button
                onClick={addCategory}
                disabled={!newCatName.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Week selector + category rows */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Weekly Income</CardTitle>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors"
              >
                {weekMondays.map((mon) => (
                  <option key={mon} value={mon}>
                    {formatWeekLabel(mon)}
                    {mon === getMondayOfWeek(today) ? ' (this week)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>

          <div className="text-xs text-zinc-500 mb-3">
            {formatWeekLabel(selectedWeek)} &nbsp;·&nbsp; {selectedWeek} to {weekEnd}
          </div>

          <div className="space-y-3">
            {categories.map((cat) => {
              const weekTotal = weekSumByCat(cat.id);
              const isOpen = openCategoryId === cat.id;
              const todayCatEntries = todayEntriesByCat(cat.id);
              const isCurrentWeek = selectedWeek === getMondayOfWeek(today);

              return (
                <div key={cat.id} className="bg-zinc-800 rounded-lg p-3">
                  {/* Category header row */}
                  <div className="flex items-center justify-between">
                    <InlineEdit
                      value={cat.name}
                      onSave={(v) => renameCategory(cat.id, v)}
                      className="text-sm font-medium text-white"
                      disabled={!canEdit}
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-emerald-400">
                        {formatCurrency(weekTotal)}
                      </span>
                      {canEdit && isCurrentWeek && (
                        <button
                          onClick={() => setOpenCategoryId(isOpen ? null : cat.id)}
                          className="p-2.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Add income entry"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline add-entry form */}
                  {isOpen && (
                    <div className="mt-2 pt-2 border-t border-zinc-700">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-col gap-1 w-32 min-w-[8rem]">
                          <label className="text-xs text-zinc-400">Amount ($)</label>
                          <input
                            autoFocus
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="0.00"
                            value={addAmounts[cat.id] || ''}
                            onChange={(e) => setAddAmounts((p) => ({ ...p, [cat.id]: e.target.value }))}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') await handleAddEntry(cat.id);
                              if (e.key === 'Escape') setOpenCategoryId(null);
                            }}
                            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors min-h-[44px]"
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[8rem]">
                          <label className="text-xs text-zinc-400">Notes (optional)</label>
                          <input
                            type="text"
                            placeholder="Optional"
                            value={addNotes[cat.id] || ''}
                            onChange={(e) => setAddNotes((p) => ({ ...p, [cat.id]: e.target.value }))}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') await handleAddEntry(cat.id);
                              if (e.key === 'Escape') setOpenCategoryId(null);
                            }}
                            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors min-h-[44px]"
                          />
                        </div>
                        <button
                          onClick={() => handleAddEntry(cat.id)}
                          disabled={addSaving || !addAmounts[cat.id] || parseFloat(addAmounts[cat.id]) <= 0}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2.5 rounded-lg text-xs font-medium transition-colors min-h-[44px]"
                        >
                          {addSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save
                        </button>
                        <button
                          onClick={() => setOpenCategoryId(null)}
                          className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Today's entries */}
                  {isCurrentWeek && todayCatEntries.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-zinc-700 space-y-1">
                      <div className="text-xs text-zinc-500 mb-1">Today</div>
                      {todayCatEntries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-xs py-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-400 font-medium">{formatCurrency(entry.amount)}</span>
                            {entry.notes && <span className="text-zinc-500 truncate max-w-[180px]">{entry.notes}</span>}
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="p-2 rounded bg-zinc-700 hover:bg-red-600/20 text-zinc-500 hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Year-to-date totals */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{currentYear} Year to Date</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {categories.map((cat) => {
              const ytd = yearSumByCat(cat.id);
              const pct = grandYearTotal > 0 ? (ytd / grandYearTotal) * 100 : 0;
              return (
                <div key={cat.id} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-300 w-32 shrink-0 truncate">{cat.name}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-emerald-400 w-28 text-right shrink-0">
                    {formatCurrency(Math.round(ytd))}
                  </span>
                </div>
              );
            })}
            {/* Grand total divider row */}
            <div className="flex items-center gap-3 pt-2 mt-1 border-t border-zinc-700">
              <span className="text-sm font-semibold text-white w-32 shrink-0">Total</span>
              <div className="flex-1" />
              <span className="text-base font-bold text-emerald-400 w-28 text-right shrink-0">
                {formatCurrency(Math.round(grandYearTotal))}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Monthly income chart */}
      {categories.length > 0 && monthlyChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Income (Last 3 Months)</CardTitle>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="month" tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={{ stroke: '#3f3f46' }} tickLine={false} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={{ stroke: '#3f3f46' }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip {...tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), '']} />
                <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />
                {categories.map((cat, i) => (
                  <Bar key={cat.id} dataKey={cat.name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
