'use client';

import { useState, useEffect, useCallback } from 'react';

import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getToday, cn } from '@/lib/utils';
import type { BudgetCategory, BudgetDailyEntry, IncomeDailyEntry } from '@/lib/types';

import { DEFAULT_BUDGET_CATEGORIES } from '@/lib/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { Save, Plus, Check, X, Loader2, Trash2, Settings, ChevronDown, ChevronRight, ChevronLeft, ChevronUp } from 'lucide-react';
import { BudgetFrequency, FREQ_LABELS, FREQ_MULTIPLIERS, formatMonthLabel, formatWeekLabel, getLast3Months, getMondayOfWeek, getMonthEnd, getPastMonths, getWeekEnd, getWeeksInMonth, minDate, monthlyEquiv } from './shared';

export function BudgetTab({
  userId,
  householdId,
  canEdit,
}: {
  userId: string;
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const today = getToday();
  const currentMonth = today.slice(0, 7);

  // ── View state ──────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedWeek, setSelectedWeek] = useState(() => getMondayOfWeek(today));

  // ── Data ───────────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [monthEntries, setMonthEntries] = useState<BudgetDailyEntry[]>([]);
  const [chartBudgetEntries, setChartBudgetEntries] = useState<BudgetDailyEntry[]>([]);
  const [chartIncomeEntries, setChartIncomeEntries] = useState<IncomeDailyEntry[]>([]);

  // ── Add entry state ─────────────────────────────────────────────────────────────
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [addAmounts, setAddAmounts] = useState<Record<string, string>>({});
  const [addNotes, setAddNotes] = useState<Record<string, string>>({});
  const [addSaving, setAddSaving] = useState(false);

  // ── Edit state ──────────────────────────────────────────────────────────────────
  const [editDraft, setEditDraft] = useState<BudgetCategory[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatAmount, setNewCatAmount] = useState('');
  const [newCatFreq, setNewCatFreq] = useState<BudgetFrequency>('monthly');

  // ── Derived ────────────────────────────────────────────────────────────────────
  const monthStart = selectedMonth + '-01';
  const monthEnd = getMonthEnd(monthStart);
  const weeksInMonth = getWeeksInMonth(selectedMonth);
  const pastMonths = getPastMonths(12);

  // Clamp week to month when month changes
  useEffect(() => {
    const weeks = getWeeksInMonth(selectedMonth);
    if (!weeks.includes(selectedWeek)) {
      const curWeek = getMondayOfWeek(today);
      setSelectedWeek(selectedMonth === currentMonth && weeks.includes(curWeek) ? curWeek : weeks[weeks.length - 1]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  // ── Load data ─────────────────────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('budget_categories')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order');
    if (data) setCategories(data);
  }, [householdId]);

  const loadMonthEntries = useCallback(async (month: string) => {
    const mStart = month + '-01';
    const mEnd = getMonthEnd(mStart);
    const { data } = await supabase
      .from('budget_daily')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', mStart)
      .lte('date', mEnd);
    if (data) setMonthEntries(data);
  }, [householdId]);

  const loadChartEntries = useCallback(async () => {
    const months = getLast3Months();
    const start = months[0].start;
    const end = months[months.length - 1].end;
    const [budgetRes, incomeRes] = await Promise.all([
      supabase.from('budget_daily').select('*').eq('household_id', householdId).gte('date', start).lte('date', end),
      supabase.from('income_daily').select('*').eq('household_id', householdId).gte('date', start).lte('date', end),
    ]);
    if (budgetRes.data) setChartBudgetEntries(budgetRes.data);
    if (incomeRes.data) setChartIncomeEntries(incomeRes.data);
  }, [householdId]);

  useEffect(() => { loadCategories(); loadChartEntries(); }, [loadCategories, loadChartEntries]);
  useEffect(() => { loadMonthEntries(selectedMonth); }, [selectedMonth, loadMonthEntries]);

  // ── Computed spend ──────────────────────────────────────────────────────────────
  const weekEnd = getWeekEnd(selectedWeek);
  const cumulativeEnd = minDate(weekEnd, monthEnd);

  const catCumulativeSpend = (catId: string) =>
    monthEntries.filter((e) => e.category_id === catId && e.date <= cumulativeEnd).reduce((s, e) => s + e.amount, 0);

  const catWeekSpend = (catId: string) => {
    const wStart = selectedWeek < monthStart ? monthStart : selectedWeek;
    return monthEntries.filter((e) => e.category_id === catId && e.date >= wStart && e.date <= cumulativeEnd).reduce((s, e) => s + e.amount, 0);
  };

  const todayEntriesByCat = (catId: string) =>
    monthEntries.filter((e) => e.category_id === catId && e.date === today);

  const isCurrentMonth = selectedMonth === currentMonth;
  const isCurrentWeek = selectedWeek === getMondayOfWeek(today);

  const totalMonthBudget = categories.reduce((s, c) => s + monthlyEquiv(c), 0);
  const totalMonthSpend = monthEntries.reduce((s, e) => s + e.amount, 0);
  const totalCumulativeSpend = categories.reduce((s, c) => s + catCumulativeSpend(c.id), 0);

  const daysInMonth = new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 0).getDate();
  const dayOfMonth = isCurrentMonth ? new Date().getDate() : daysInMonth;
  const daysLeft = isCurrentMonth ? daysInMonth - dayOfMonth : 0;
  const dailyAvg = dayOfMonth > 0 ? totalMonthSpend / dayOfMonth : 0;
  const projectedTotal = isCurrentMonth ? dailyAvg * daysInMonth : totalMonthSpend;

  // ── Bar helpers ────────────────────────────────────────────────────────────────
  const barColor = (spent: number, budget: number) => {
    if (budget <= 0) return 'bg-blue-500';
    const pct = spent / budget;
    if (pct > 1) return 'bg-red-500';
    if (pct >= 0.75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const textColor = (spent: number, budget: number) => {
    if (budget <= 0) return 'text-white';
    const pct = spent / budget;
    if (pct > 1) return 'text-red-400';
    if (pct >= 0.75) return 'text-amber-400';
    return 'text-emerald-400';
  };

  // ── Add entry ─────────────────────────────────────────────────────────────────
  const handleAddEntry = async (catId: string) => {
    const amount = parseFloat(addAmounts[catId] || '');
    if (isNaN(amount) || amount <= 0) return;
    setAddSaving(true);
    const { data: existing } = await supabase
      .from('budget_daily').select('id, amount')
      .eq('household_id', householdId).eq('date', today).eq('category_id', catId)
      .maybeSingle();
    if (existing) {
      await supabase.from('budget_daily').update({ amount: existing.amount + amount, notes: addNotes[catId] || null }).eq('id', existing.id);
    } else {
      await supabase.from('budget_daily').insert({ user_id: userId, household_id: householdId, date: today, category_id: catId, amount, notes: addNotes[catId] || null });
    }
    setAddAmounts((p) => ({ ...p, [catId]: '' }));
    setAddNotes((p) => ({ ...p, [catId]: '' }));
    setAddSaving(false);
    await loadMonthEntries(selectedMonth);
    await loadChartEntries();
  };

  const handleDeleteEntry = async (entryId: string) => {
    await supabase.from('budget_daily').delete().eq('id', entryId);
    await loadMonthEntries(selectedMonth);
  };

  // ── Edit mode ─────────────────────────────────────────────────────────────────
  const openEdit = () => { setEditDraft(categories.map((c) => ({ ...c }))); setViewMode('edit'); };

  const saveEdit = async () => {
    setEditSaving(true);
    for (let i = 0; i < editDraft.length; i++) {
      const c = editDraft[i];
      await supabase.from('budget_categories').update({ name: c.name, monthly_amount: c.monthly_amount, frequency: c.frequency ?? 'monthly', sort_order: i }).eq('id', c.id);
    }
    setEditSaving(false);
    await loadCategories();
    setViewMode('view');
  };

  const refreshEditDraft = async () => {
    const { data } = await supabase.from('budget_categories').select('*').eq('household_id', householdId).order('sort_order');
    if (data) { setCategories(data); setEditDraft(data.map((c: BudgetCategory) => ({ ...c }))); }
  };

  const addCategory = async () => {
    const amt = parseFloat(newCatAmount);
    if (!newCatName.trim() || isNaN(amt) || amt <= 0) return;
    await supabase.from('budget_categories').insert({ user_id: userId, household_id: householdId, name: newCatName.trim(), monthly_amount: amt, frequency: newCatFreq, sort_order: editDraft.length });
    setNewCatName(''); setNewCatAmount('');
    await refreshEditDraft();
  };

  const deleteCategory = async (catId: string) => {
    await supabase.from('budget_categories').delete().eq('id', catId);
    setDeleteConfirm(null);
    await refreshEditDraft();
  };

  const moveCategory = (idx: number, dir: -1 | 1) => {
    const d = [...editDraft];
    const s = idx + dir;
    if (s < 0 || s >= d.length) return;
    [d[idx], d[s]] = [d[s], d[idx]];
    setEditDraft(d);
  };

  const seedDefaults = async () => {
    const rows = DEFAULT_BUDGET_CATEGORIES.map((c, i) => ({ user_id: userId, household_id: householdId, name: c.name, monthly_amount: c.monthly_amount, frequency: 'monthly', sort_order: i }));
    await supabase.from('budget_categories').insert(rows);
    await loadCategories();
  };

  // Income vs spending chart data
  const chartMonths = getLast3Months();
  const incomeVsSpendingData = chartMonths.map(({ label, start, end }) => ({
    month: label,
    Income: chartIncomeEntries.filter((e) => e.date >= start && e.date <= end).reduce((s, e) => s + e.amount, 0),
    Spending: chartBudgetEntries.filter((e) => e.date >= start && e.date <= end).reduce((s, e) => s + e.amount, 0),
  }));

  const tooltipStyle = { contentStyle: { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', color: '#fff' } };

  // ── EDIT SCREEN ─────────────────────────────────────────────────────────────────
  if (viewMode === 'edit') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setViewMode('view')} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-white">Edit Budget Categories</h2>
          <div className="ml-auto">
            <button onClick={saveEdit} disabled={editSaving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]">
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </div>

        <Card>
          {editDraft.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-zinc-400 mb-4">No categories yet.</p>
              {canEdit && (
                <button onClick={seedDefaults} className="flex items-center gap-2 mx-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                  <Plus className="w-4 h-4" /> Seed Defaults
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {editDraft.map((cat, idx) => {
                const freq = (cat.frequency ?? 'monthly') as BudgetFrequency;
                const moEquiv = cat.monthly_amount * FREQ_MULTIPLIERS[freq];
                return (
                  <div key={cat.id} className="flex items-center gap-2 bg-zinc-800 rounded-lg p-3 flex-wrap sm:flex-nowrap">
                    {/* Reorder arrows */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button onClick={() => moveCategory(idx, -1)} disabled={idx === 0} className="p-1 rounded text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveCategory(idx, 1)} disabled={idx === editDraft.length - 1} className="p-1 rounded text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"><ChevronDown className="w-3.5 h-3.5" /></button>
                    </div>
                    {/* Name */}
                    <input
                      value={cat.name}
                      onChange={(e) => setEditDraft((d) => d.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                      className="flex-1 min-w-[100px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                    />
                    {/* Amount */}
                    <input
                      type="number" inputMode="decimal" step="1"
                      value={cat.monthly_amount}
                      onChange={(e) => setEditDraft((d) => d.map((c, i) => i === idx ? { ...c, monthly_amount: parseFloat(e.target.value) || 0 } : c))}
                      className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 text-right min-h-[40px]"
                    />
                    {/* Frequency */}
                    <select
                      value={freq}
                      onChange={(e) => setEditDraft((d) => d.map((c, i) => i === idx ? { ...c, frequency: e.target.value as BudgetFrequency } : c))}
                      className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[40px]"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="annual">Annual</option>
                    </select>
                    {/* Monthly equiv hint */}
                    {freq !== 'monthly' && (
                      <span className="text-xs text-zinc-500 whitespace-nowrap">= {formatCurrency(Math.round(moEquiv))}/mo</span>
                    )}
                    {/* Delete */}
                    {canEdit && (deleteConfirm === cat.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-red-400">Delete?</span>
                        <button onClick={() => deleteCategory(cat.id)} className="p-2 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"><Check className="w-3 h-3" /></button>
                        <button onClick={() => setDeleteConfirm(null)} className="p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(cat.id)} className="p-2 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center shrink-0"><Trash2 className="w-3 h-3" /></button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new */}
          {canEdit && (
            <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
              <p className="text-sm font-medium text-zinc-300">Add Category</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                  <label className="text-xs text-zinc-400">Name</label>
                  <input type="text" placeholder="e.g. Groceries" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[40px]" />
                </div>
                <div className="flex flex-col gap-1 w-28">
                  <label className="text-xs text-zinc-400">Amount ($)</label>
                  <input type="number" inputMode="decimal" step="1" placeholder="0" value={newCatAmount} onChange={(e) => setNewCatAmount(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[40px]" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">Frequency</label>
                  <select value={newCatFreq} onChange={(e) => setNewCatFreq(e.target.value as BudgetFrequency)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[40px]">
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <button onClick={addCategory} disabled={!newCatName.trim() || !newCatAmount || parseFloat(newCatAmount) <= 0} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors min-h-[40px]">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ── VIEW SCREEN ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Month selector + Edit button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { const idx = pastMonths.indexOf(selectedMonth); if (idx < pastMonths.length - 1) setSelectedMonth(pastMonths[idx + 1]); }}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold text-white min-w-[150px] text-center">{formatMonthLabel(selectedMonth)}</span>
          <button
            onClick={() => { const idx = pastMonths.indexOf(selectedMonth); if (idx > 0) setSelectedMonth(pastMonths[idx - 1]); }}
            disabled={selectedMonth === currentMonth}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {selectedMonth !== currentMonth && (
            <button onClick={() => setSelectedMonth(currentMonth)} className="text-xs text-blue-400 hover:text-blue-300 underline">Today</button>
          )}
        </div>
        {canEdit && (
          <button onClick={openEdit} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors min-h-[44px] px-2">
            <Settings className="w-4 h-4" /> Edit Budget
          </button>
        )}
      </div>

      {categories.length === 0 && (
        <Card>
          <div className="text-center py-6">
            <p className="text-zinc-400 mb-4">No budget categories yet.</p>
            {canEdit && (
              <div className="flex flex-col items-center gap-3">
                <button onClick={seedDefaults} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> Seed Defaults</button>
                <button onClick={openEdit} className="text-sm text-zinc-400 hover:text-white underline">Or add manually</button>
              </div>
            )}
          </div>
        </Card>
      )}

      {categories.length > 0 && (
        <>
          {/* Master progress bar */}
          {(() => {
            const pct = totalMonthBudget > 0 ? Math.min((totalCumulativeSpend / totalMonthBudget) * 100, 100) : 0;
            const over = totalCumulativeSpend > totalMonthBudget;
            return (
              <Card>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                  <span className="text-sm font-semibold text-white">All Categories {isCurrentMonth ? '(month-to-date)' : ''}</span>
                  <span className={cn('text-sm font-bold', textColor(totalCumulativeSpend, totalMonthBudget))}>
                    {formatCurrency(Math.round(totalCumulativeSpend))} / {formatCurrency(Math.round(totalMonthBudget))}
                  </span>
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-3 mb-1.5">
                  <div className={cn('h-3 rounded-full transition-all', barColor(totalCumulativeSpend, totalMonthBudget))} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{Math.round(pct)}% of budget used</span>
                  {over && <span className="text-red-400 font-medium">Over by {formatCurrency(Math.round(totalCumulativeSpend - totalMonthBudget))}</span>}
                </div>
              </Card>
            );
          })()}

          {/* Week selector + category cards */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>Week View</CardTitle>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors"
                >
                  {weeksInMonth.map((mon) => (
                    <option key={mon} value={mon}>
                      {formatWeekLabel(mon)}{mon === getMondayOfWeek(today) ? ' (this week)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>

            <div className="space-y-4">
              {categories.map((cat) => {
                const freq = (cat.frequency ?? 'monthly') as BudgetFrequency;
                const moEquiv = monthlyEquiv(cat);
                const cumSpend = catCumulativeSpend(cat.id);
                const wkSpend = catWeekSpend(cat.id);
                const pct = moEquiv > 0 ? Math.min((cumSpend / moEquiv) * 100, 100) : 0;
                const isOpen = openCategoryId === cat.id;
                const todayCatEntries = todayEntriesByCat(cat.id);

                return (
                  <div key={cat.id} className="bg-zinc-800 rounded-lg p-3">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0 mr-2">
                        <span className="text-sm font-medium text-white">{cat.name}</span>
                        {freq !== 'monthly' && (
                          <span className="ml-2 text-xs text-zinc-500">
                            {formatCurrency(cat.monthly_amount)}{FREQ_LABELS[freq]} → {formatCurrency(Math.round(moEquiv))}/mo
                          </span>
                        )}
                      </div>
                      {canEdit && isCurrentMonth && isCurrentWeek && (
                        <button onClick={() => setOpenCategoryId(isOpen ? null : cat.id)} className="p-2.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0">
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Cumulative progress bar */}
                    <div className="w-full bg-zinc-700 rounded-full h-2.5 mb-1">
                      <div className={cn('h-2.5 rounded-full transition-all', barColor(cumSpend, moEquiv))} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={cn('font-medium', textColor(cumSpend, moEquiv))}>
                        {formatCurrency(Math.round(cumSpend))} / {formatCurrency(Math.round(moEquiv))}
                      </span>
                      <span className="text-zinc-500">{Math.round(pct)}%</span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      This week: <span className="font-medium text-zinc-300">{formatCurrency(Math.round(wkSpend))}</span>
                    </div>

                    {/* Add entry form */}
                    {isOpen && (
                      <div className="mt-2 pt-2 border-t border-zinc-700">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col gap-1 w-32">
                            <label className="text-xs text-zinc-400">Amount ($)</label>
                            <input
                              autoFocus type="number" inputMode="decimal" step="0.01" placeholder="0.00"
                              value={addAmounts[cat.id] || ''}
                              onChange={(e) => setAddAmounts((p) => ({ ...p, [cat.id]: e.target.value }))}
                              onKeyDown={async (e) => { if (e.key === 'Enter') await handleAddEntry(cat.id); if (e.key === 'Escape') setOpenCategoryId(null); }}
                              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors min-h-[44px]"
                            />
                          </div>
                          <div className="flex flex-col gap-1 flex-1 min-w-[8rem]">
                            <label className="text-xs text-zinc-400">Notes (optional)</label>
                            <input
                              type="text" placeholder="Optional"
                              value={addNotes[cat.id] || ''}
                              onChange={(e) => setAddNotes((p) => ({ ...p, [cat.id]: e.target.value }))}
                              onKeyDown={async (e) => { if (e.key === 'Enter') await handleAddEntry(cat.id); if (e.key === 'Escape') setOpenCategoryId(null); }}
                              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors min-h-[44px]"
                            />
                          </div>
                          <button onClick={() => handleAddEntry(cat.id)} disabled={addSaving || !addAmounts[cat.id] || parseFloat(addAmounts[cat.id]) <= 0} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2.5 rounded-lg text-xs font-medium transition-colors min-h-[44px]">
                            {addSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                          </button>
                          <button onClick={() => setOpenCategoryId(null)} className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Today's entries (current week only) */}
                    {isCurrentWeek && isCurrentMonth && todayCatEntries.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-700 space-y-1">
                        <div className="text-xs text-zinc-500 mb-1">Today</div>
                        {todayCatEntries.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between text-xs py-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-300">{formatCurrency(entry.amount)}</span>
                              {entry.notes && <span className="text-zinc-500 truncate max-w-[180px]">{entry.notes}</span>}
                            </div>
                            {canEdit && (
                              <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 rounded bg-zinc-700 hover:bg-red-600/20 text-zinc-500 hover:text-red-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center">
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

          {/* Summary */}
          <Card>
            <CardHeader><CardTitle>Month Summary — {formatMonthLabel(selectedMonth)}</CardTitle></CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-zinc-400 mb-0.5">Total Budgeted</div>
                <div className="text-base font-semibold text-white">{formatCurrency(Math.round(totalMonthBudget))}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-0.5">Total Spent</div>
                <div className={cn('text-base font-semibold', textColor(totalMonthSpend, totalMonthBudget))}>{formatCurrency(Math.round(totalMonthSpend))}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-0.5">Remaining</div>
                <div className={cn('text-base font-semibold', totalMonthBudget - totalMonthSpend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatCurrency(Math.round(Math.abs(totalMonthBudget - totalMonthSpend)))}
                  {totalMonthBudget - totalMonthSpend < 0 ? ' over' : ''}
                </div>
              </div>
              {isCurrentMonth && (
                <>
                  <div>
                    <div className="text-xs text-zinc-400 mb-0.5">Days Left</div>
                    <div className="text-base font-semibold text-white">{daysLeft}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-0.5">Daily Avg</div>
                    <div className="text-base font-semibold text-white">{formatCurrency(Math.round(dailyAvg))}/day</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-0.5">Projected Total</div>
                    <div className={cn('text-base font-semibold', textColor(projectedTotal, totalMonthBudget))}>{formatCurrency(Math.round(projectedTotal))}</div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Income vs Spending chart */}
      {incomeVsSpendingData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Income vs Spending — Last 3 Months</CardTitle></CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeVsSpendingData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="month" tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={{ stroke: '#3f3f46' }} tickLine={false} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={{ stroke: '#3f3f46' }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip {...tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), '']} />
                <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />
                <Bar dataKey="Income" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Spending" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
