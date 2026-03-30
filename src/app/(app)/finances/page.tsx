'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useHousehold } from '@/components/household-provider';
import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatCurrency,
  formatCurrencyDecimal,
  formatDate,
  getToday,
  getWeekStart,
  cn,
} from '@/lib/utils';
import type {
  BudgetCategory,
  BudgetDailyEntry,
  Account,
  AccountBalance,
  NetWorthItem,
  NetWorthEntry,
  Reimbursement,
  Investment,
  IncomeCategory,
  IncomeDailyEntry,
} from '@/lib/types';
import {
  TIER_LABELS,
  TIER_TARGETS,
  DEFAULT_BUDGET_CATEGORIES,
  DEFAULT_ACCOUNTS,
  DEFAULT_NET_WORTH_ASSETS,
  DEFAULT_NET_WORTH_LIABILITIES,
  DEFAULT_INCOME_CATEGORIES,
} from '@/lib/types';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Landmark,
  PieChart as PieIcon,
  Save,
  Plus,
  Check,
  X,
  Loader2,
  Trash2,
  Settings,
  LayoutDashboard,
  Wallet,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import FinanceOverview from '@/components/finance-overview';

const TABS = ['Overview', 'Income', 'Budget', 'Cash Flow', 'Reimbursements', 'Net Worth', 'Investments'] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  Overview: <LayoutDashboard className="w-4 h-4" />,
  Income: <Wallet className="w-4 h-4" />,
  Budget: <DollarSign className="w-4 h-4" />,
  'Cash Flow': <TrendingUp className="w-4 h-4" />,
  Reimbursements: <Receipt className="w-4 h-4" />,
  'Net Worth': <Landmark className="w-4 h-4" />,
  Investments: <PieIcon className="w-4 h-4" />,
};

const TIER_COLORS: Record<Investment['tier'], string> = {
  growth_engine: '#3b82f6',
  innovation_satellite: '#8b5cf6',
  stability_liquidity: '#10b981',
  asymmetric_upside: '#f59e0b',
};

const DEFAULT_HOLDINGS: Omit<Investment, 'id' | 'user_id' | 'household_id' | 'last_updated'>[] = [
  { tier: 'growth_engine', symbol: 'VTI', current_value_cad: 0, target_pct: 35 },
  { tier: 'growth_engine', symbol: 'VEA', current_value_cad: 0, target_pct: 20 },
  { tier: 'innovation_satellite', symbol: 'ARKQ', current_value_cad: 0, target_pct: 4 },
  { tier: 'innovation_satellite', symbol: 'BOTZ', current_value_cad: 0, target_pct: 4 },
  { tier: 'innovation_satellite', symbol: 'ROBO', current_value_cad: 0, target_pct: 4 },
  { tier: 'innovation_satellite', symbol: 'ARTY', current_value_cad: 0, target_pct: 3 },
  { tier: 'stability_liquidity', symbol: 'VSB', current_value_cad: 0, target_pct: 15 },
  { tier: 'stability_liquidity', symbol: 'CGL', current_value_cad: 0, target_pct: 10 },
  { tier: 'asymmetric_upside', symbol: 'BTC', current_value_cad: 0, target_pct: 2 },
  { tier: 'asymmetric_upside', symbol: 'ETH', current_value_cad: 0, target_pct: 1 },
  { tier: 'asymmetric_upside', symbol: 'LINK', current_value_cad: 0, target_pct: 1 },
  { tier: 'asymmetric_upside', symbol: 'XRP', current_value_cad: 0, target_pct: 1 },
];

// ─── InlineEdit component ────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  className,
  disabled,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing || disabled) {
    return (
      <span
        onClick={() => !disabled && setEditing(true)}
        className={cn(
          'cursor-pointer hover:text-blue-400',
          disabled && 'cursor-default hover:text-inherit',
          className
        )}
      >
        {value}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== value) onSave(draft.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (draft.trim() && draft !== value) onSave(draft.trim());
          setEditing(false);
        }
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="px-2 py-1 bg-zinc-800 border border-blue-500 rounded text-sm text-white focus:outline-none"
    />
  );
}

function InlineNumberEdit({
  value,
  onSave,
  className,
  disabled,
  format,
}: {
  value: number;
  onSave: (v: number) => void;
  className?: string;
  disabled?: boolean;
  format?: (v: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toString());

  const displayValue = format ? format(value) : value.toString();

  if (!editing || disabled) {
    return (
      <span
        onClick={() => {
          if (!disabled) {
            setDraft(value.toString());
            setEditing(true);
          }
        }}
        className={cn(
          'cursor-pointer hover:text-blue-400',
          disabled && 'cursor-default hover:text-inherit',
          className
        )}
      >
        {displayValue}
      </span>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      step="1"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseFloat(draft);
        if (!isNaN(parsed) && parsed !== value) onSave(parsed);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const parsed = parseFloat(draft);
          if (!isNaN(parsed) && parsed !== value) onSave(parsed);
          setEditing(false);
        }
        if (e.key === 'Escape') {
          setDraft(value.toString());
          setEditing(false);
        }
      }}
      className="px-2 py-1 bg-zinc-800 border border-blue-500 rounded text-sm text-white focus:outline-none w-28"
    />
  );
}

// ─── Input helpers ───────────────────────────────────────────────────────────

function InputField({
  label,
  value,
  onChange,
  type = 'number',
  step,
  placeholder,
  className,
  disabled,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-xs text-zinc-400">{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors resize-none"
      />
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
    >
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {saving ? 'Saving...' : 'Save'}
    </button>
  );
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function getMonthStart(date: string): string {
  return date.slice(0, 7) + '-01';
}

function getMonthEnd(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split('T')[0];
}

function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

function getDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function getYesterday(): string {
  return getDaysAgo(1);
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function FinancesPage() {
  const { user, loading: authLoading } = useAuth();
  const { householdId, canEditFinances } = useHousehold();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center text-zinc-400 py-20">Please sign in to view finances.</div>
    );
  }

  if (!householdId) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        <span className="text-zinc-400">Setting up household...</span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Finances</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            )}
          >
            {TAB_ICONS[tab]}
            {tab}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'Overview' && (
        <FinanceOverview householdId={householdId} />
      )}
      {activeTab === 'Income' && (
        <IncomeTab householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Budget' && (
        <BudgetTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Cash Flow' && (
        <CashFlowTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Reimbursements' && (
        <ReimbursementsTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Net Worth' && (
        <NetWorthTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
      {activeTab === 'Investments' && (
        <InvestmentsTab userId={user.id} householdId={householdId} canEdit={canEditFinances} />
      )}
    </div>
  );
}

// ─── INCOME TAB ─────────────────────────────────────────────────────────────

function IncomeTab({
  householdId,
  canEdit,
}: {
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [entries, setEntries] = useState<IncomeDailyEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<IncomeDailyEntry[]>([]);
  const [date, setDate] = useState(getToday());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [newCatName, setNewCatName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('income_categories')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order');
    if (data) setCategories(data);
  }, [householdId]);

  const loadEntriesForDate = useCallback(
    async (d: string) => {
      const { data } = await supabase
        .from('income_daily')
        .select('*')
        .eq('household_id', householdId)
        .eq('date', d);
      if (data) {
        setEntries(data);
        const amts: Record<string, number> = {};
        const nts: Record<string, string> = {};
        data.forEach((e: IncomeDailyEntry) => {
          amts[e.category_id] = e.amount;
          nts[e.category_id] = e.notes ?? '';
        });
        setAmounts(amts);
        setNotes(nts);
      }
    },
    [householdId]
  );

  const loadMonthEntries = useCallback(async () => {
    const monthStart = getMonthStart(getToday());
    const monthEnd = getMonthEnd(getToday());
    const { data } = await supabase
      .from('income_daily')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', monthStart)
      .lte('date', monthEnd);
    if (data) setMonthEntries(data);
  }, [householdId]);

  const loadAll = useCallback(async () => {
    await loadCategories();
    await loadEntriesForDate(date);
    await loadMonthEntries();
  }, [loadCategories, loadEntriesForDate, date, loadMonthEntries]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadEntriesForDate(date);
  }, [date, loadEntriesForDate]);

  const handleSave = async () => {
    setSaving(true);
    for (const cat of categories) {
      const amount = amounts[cat.id] || 0;
      const note = notes[cat.id] || null;
      if (amount > 0 || note) {
        await supabase.from('income_daily').upsert(
          {
            household_id: householdId,
            date,
            category_id: cat.id,
            amount,
            notes: note,
          },
          { onConflict: 'household_id,date,category_id' }
        );
      }
    }
    await loadAll();
    setSaving(false);
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

  const deleteCategory = async (catId: string) => {
    await supabase.from('income_categories').delete().eq('id', catId);
    setDeleteConfirm(null);
    await loadAll();
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

  const renameCategory = async (catId: string, newName: string) => {
    await supabase.from('income_categories').update({ name: newName }).eq('id', catId);
    await loadCategories();
  };

  const monthSumByCat = (catId: string) =>
    monthEntries.filter((e) => e.category_id === catId).reduce((s, e) => s + e.amount, 0);
  const monthTotal = monthEntries.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Settings toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
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
                <div
                  key={cat.id}
                  className="flex items-center justify-between bg-zinc-800 rounded-lg p-3"
                >
                  <InlineEdit
                    value={cat.name}
                    onSave={(v) => renameCategory(cat.id, v)}
                    className="text-sm font-medium text-white"
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <>
                      {deleteConfirm === cat.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">Delete?</span>
                          <button
                            onClick={() => deleteCategory(cat.id)}
                            className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(cat.id)}
                          className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new category */}
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
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors h-[38px]"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Daily income entry */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily Income Entry</CardTitle>
          </CardHeader>
          <div className="mb-4">
            <InputField
              label="Date"
              type="date"
              value={date}
              onChange={setDate}
              className="w-48"
              disabled={!canEdit}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <div key={cat.id} className="bg-zinc-800 rounded-lg p-3 space-y-2">
                <div className="text-sm font-medium text-white">{cat.name}</div>
                <input
                  type="number"
                  step="0.01"
                  value={amounts[cat.id] || ''}
                  placeholder="0"
                  disabled={!canEdit}
                  onChange={(e) =>
                    setAmounts((a) => ({ ...a, [cat.id]: parseFloat(e.target.value) || 0 }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  value={notes[cat.id] || ''}
                  placeholder="Notes (optional)"
                  disabled={!canEdit}
                  onChange={(e) => setNotes((n) => ({ ...n, [cat.id]: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="mt-4 flex justify-end">
              <SaveButton saving={saving} onClick={handleSave} />
            </div>
          )}
        </Card>
      )}

      {/* Monthly income summary */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>This Month&apos;s Income</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {categories.map((cat) => {
              const total = monthSumByCat(cat.id);
              return (
                <div key={cat.id} className="bg-zinc-800 rounded-lg p-3">
                  <div className="text-xs text-zinc-400 mb-1">{cat.name}</div>
                  <div className="text-lg font-semibold text-white">
                    {formatCurrency(total)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-zinc-800 border border-emerald-600/30 rounded-lg p-4">
            <div className="text-sm text-zinc-400">Total Monthly Income</div>
            <div className="text-3xl font-bold text-emerald-400">
              {formatCurrency(monthTotal)}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── BUDGET TAB ──────────────────────────────────────────────────────────────

function BudgetTab({
  userId,
  householdId,
  canEdit,
}: {
  userId: string;
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [entries, setEntries] = useState<BudgetDailyEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<BudgetDailyEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<BudgetDailyEntry[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; total: number }[]>([]);
  const [date, setDate] = useState(getToday());
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [newCatName, setNewCatName] = useState('');
  const [newCatAmount, setNewCatAmount] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [quickAddCat, setQuickAddCat] = useState<string | null>(null);
  const [quickAddAmount, setQuickAddAmount] = useState('');
  const [quickAddNotes, setQuickAddNotes] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const toggleExpanded = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('budget_categories')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order');
    if (data) setCategories(data);
  }, [householdId]);

  const loadEntriesForDate = useCallback(
    async (d: string) => {
      const { data } = await supabase
        .from('budget_daily')
        .select('*')
        .eq('household_id', householdId)
        .eq('date', d);
      if (data) {
        setEntries(data);
        const amts: Record<string, number> = {};
        const nts: Record<string, string> = {};
        data.forEach((e) => {
          amts[e.category_id] = e.amount;
          nts[e.category_id] = e.notes ?? '';
        });
        setAmounts(amts);
        setNotes(nts);
      }
    },
    [householdId]
  );

  const loadWeekEntries = useCallback(async () => {
    const weekStart = getWeekStart(getToday());
    const weekEnd = getWeekEnd(weekStart);
    const { data } = await supabase
      .from('budget_daily')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', weekStart)
      .lte('date', weekEnd);
    if (data) setWeekEntries(data);
  }, [householdId]);

  const loadMonthEntries = useCallback(async () => {
    const monthStart = getMonthStart(getToday());
    const monthEnd = getMonthEnd(getToday());
    const { data } = await supabase
      .from('budget_daily')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', monthStart)
      .lte('date', monthEnd);
    if (data) setMonthEntries(data);
  }, [householdId]);

  const loadTrendData = useCallback(async () => {
    const startDate = getDaysAgo(30);
    const { data } = await supabase
      .from('budget_daily')
      .select('*')
      .eq('household_id', householdId)
      .gte('date', startDate)
      .lte('date', getToday());
    if (data) {
      const byDate: Record<string, number> = {};
      data.forEach((e) => {
        byDate[e.date] = (byDate[e.date] || 0) + e.amount;
      });
      const trend = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, total]) => ({ date: d, total }));
      setTrendData(trend);
    }
  }, [householdId]);

  const loadAll = useCallback(async () => {
    await loadCategories();
    await loadEntriesForDate(date);
    await loadWeekEntries();
    await loadMonthEntries();
    await loadTrendData();
  }, [loadCategories, loadEntriesForDate, date, loadWeekEntries, loadMonthEntries, loadTrendData]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadEntriesForDate(date);
  }, [date, loadEntriesForDate]);

  const handleSave = async () => {
    setSaving(true);
    for (const cat of categories) {
      const amount = amounts[cat.id] || 0;
      const note = notes[cat.id] || null;
      if (amount > 0 || note) {
        await supabase.from('budget_daily').upsert(
          {
            user_id: userId,
            household_id: householdId,
            date,
            category_id: cat.id,
            amount,
            notes: note,
          },
          { onConflict: 'household_id,date,category_id' }
        );
      }
    }
    await loadAll();
    setSaving(false);
  };

  const handleQuickAdd = async (catId: string) => {
    const amount = parseFloat(quickAddAmount);
    if (isNaN(amount) || amount <= 0) return;
    setQuickAddSaving(true);
    const today = getToday();
    // Fetch existing entry for today + this category to add to it
    const { data: existing } = await supabase
      .from('budget_daily')
      .select('amount')
      .eq('household_id', householdId)
      .eq('date', today)
      .eq('category_id', catId)
      .maybeSingle();
    const existingAmount = existing?.amount || 0;
    await supabase.from('budget_daily').upsert(
      {
        user_id: userId,
        household_id: householdId,
        date: today,
        category_id: catId,
        amount: existingAmount + amount,
        notes: quickAddNotes || null,
      },
      { onConflict: 'household_id,date,category_id' }
    );
    setQuickAddCat(null);
    setQuickAddAmount('');
    setQuickAddNotes('');
    setQuickAddSaving(false);
    await loadAll();
  };

  const addCategory = async () => {
    if (!newCatName.trim() || newCatAmount <= 0) return;
    await supabase.from('budget_categories').insert({
      user_id: userId,
      household_id: householdId,
      name: newCatName.trim(),
      monthly_amount: newCatAmount,
      sort_order: categories.length,
    });
    setNewCatName('');
    setNewCatAmount(0);
    await loadCategories();
  };

  const deleteCategory = async (catId: string) => {
    await supabase.from('budget_categories').delete().eq('id', catId);
    setDeleteConfirm(null);
    await loadAll();
  };

  const seedDefaults = async () => {
    const rows = DEFAULT_BUDGET_CATEGORIES.map((c, i) => ({
      user_id: userId,
      household_id: householdId,
      name: c.name,
      monthly_amount: c.monthly_amount,
      sort_order: i,
    }));
    await supabase.from('budget_categories').insert(rows);
    await loadAll();
  };

  const renameCategory = async (catId: string, newName: string) => {
    await supabase.from('budget_categories').update({ name: newName }).eq('id', catId);
    await loadCategories();
  };

  const updateCategoryAmount = async (catId: string, newAmount: number) => {
    await supabase
      .from('budget_categories')
      .update({ monthly_amount: newAmount })
      .eq('id', catId);
    await loadCategories();
  };

  const weekSumByCat = (catId: string) =>
    weekEntries.filter((e) => e.category_id === catId).reduce((s, e) => s + e.amount, 0);
  const weekEntriesByCat = (catId: string) =>
    weekEntries.filter((e) => e.category_id === catId && e.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const monthSumByCat = (catId: string) =>
    monthEntries.filter((e) => e.category_id === catId).reduce((s, e) => s + e.amount, 0);
  const todaySumByCat = (catId: string) =>
    entries.filter((e) => e.category_id === catId).reduce((s, e) => s + e.amount, 0);

  const getBudgetColor = (spent: number, target: number) => {
    if (target <= 0) return 'text-white';
    const pct = spent / target;
    if (pct > 1) return 'text-red-400';
    if (pct >= 0.9) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getBudgetBarColor = (spent: number, target: number) => {
    if (target <= 0) return 'bg-blue-500';
    const pct = spent / target;
    if (pct > 1) return 'bg-red-500';
    if (pct >= 0.9) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="space-y-6">
      {/* Settings toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          {showSettings ? 'Hide Settings' : 'Manage Categories'}
        </button>
      </div>

      {/* Category management */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Budget Categories</CardTitle>
          </CardHeader>

          {categories.length === 0 && (
            <div className="text-center py-6">
              <p className="text-zinc-400 mb-4">No categories yet.</p>
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
                <div
                  key={cat.id}
                  className="flex items-center justify-between bg-zinc-800 rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    <InlineEdit
                      value={cat.name}
                      onSave={(v) => renameCategory(cat.id, v)}
                      className="text-sm font-medium text-white"
                      disabled={!canEdit}
                    />
                    <InlineNumberEdit
                      value={cat.monthly_amount}
                      onSave={(v) => updateCategoryAmount(cat.id, v)}
                      className="text-xs text-zinc-400"
                      disabled={!canEdit}
                      format={(v) => `${formatCurrency(v)}/mo`}
                    />
                    <span className="text-xs text-zinc-500">
                      ({formatCurrency(Math.round(cat.monthly_amount / 4.333))}/wk)
                    </span>
                  </div>
                  {canEdit && (
                    <>
                      {deleteConfirm === cat.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">Delete?</span>
                          <button
                            onClick={() => deleteCategory(cat.id)}
                            className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(cat.id)}
                          className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new category */}
          {canEdit && (
            <div className="flex items-end gap-3 pt-3 border-t border-zinc-800">
              <InputField
                label="Category Name"
                type="text"
                value={newCatName}
                onChange={setNewCatName}
                placeholder="e.g. Groceries"
                className="flex-1"
              />
              <InputField
                label="Monthly Amount ($)"
                value={newCatAmount || ''}
                step="1"
                onChange={(v) => setNewCatAmount(parseFloat(v) || 0)}
                className="w-40"
              />
              <button
                onClick={addCategory}
                disabled={!newCatName.trim() || newCatAmount <= 0}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors h-[38px]"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Daily spending entry */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily Spending Entry</CardTitle>
          </CardHeader>
          <div className="mb-4">
            <InputField
              label="Date"
              type="date"
              value={date}
              onChange={setDate}
              className="w-48"
              disabled={!canEdit}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <div key={cat.id} className="bg-zinc-800 rounded-lg p-3 space-y-2">
                <div className="text-sm font-medium text-white">{cat.name}</div>
                <input
                  type="number"
                  step="0.01"
                  value={amounts[cat.id] || ''}
                  placeholder="0"
                  disabled={!canEdit}
                  onChange={(e) =>
                    setAmounts((a) => ({ ...a, [cat.id]: parseFloat(e.target.value) || 0 }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <input
                  type="text"
                  value={notes[cat.id] || ''}
                  placeholder="Notes (optional)"
                  disabled={!canEdit}
                  onChange={(e) => setNotes((n) => ({ ...n, [cat.id]: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="mt-4 flex justify-end">
              <SaveButton saving={saving} onClick={handleSave} />
            </div>
          )}
        </Card>
      )}

      {/* This Week - with expandable daily entries and quick add */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>This Week (Mon-Sun)</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {categories.map((cat) => {
              const spent = weekSumByCat(cat.id);
              const weeklyBudget = Math.round(cat.monthly_amount / 4.333);
              const pct = weeklyBudget > 0 ? Math.round((spent / weeklyBudget) * 100) : 0;
              const isExpanded = expandedCats.has(cat.id);
              const dailyEntries = weekEntriesByCat(cat.id);
              const budgetColor = getBudgetColor(spent, weeklyBudget);
              const barColor = getBudgetBarColor(spent, weeklyBudget);

              return (
                <div key={cat.id} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleExpanded(cat.id)}
                        className="text-zinc-400 hover:text-white transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-sm font-medium text-white">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-semibold', budgetColor)}>
                        {formatCurrency(spent)} / {formatCurrency(weeklyBudget)}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => setQuickAddCat(quickAddCat === cat.id ? null : cat.id)}
                          className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white transition-colors"
                          title="Quick add today's spending"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-zinc-700 rounded-full h-2 mb-1">
                    <div
                      className={cn('h-2 rounded-full transition-all', barColor)}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className={cn('text-xs', budgetColor)}>
                    {pct}% of weekly budget
                  </div>

                  {/* Quick add inline form */}
                  {quickAddCat === cat.id && (
                    <div className="mt-2 pt-2 border-t border-zinc-700 flex items-end gap-2">
                      <InputField
                        label="Amount ($)"
                        value={quickAddAmount}
                        step="0.01"
                        placeholder="0.00"
                        onChange={setQuickAddAmount}
                        className="w-28"
                      />
                      <InputField
                        label="Notes"
                        type="text"
                        value={quickAddNotes}
                        placeholder="Optional"
                        onChange={setQuickAddNotes}
                        className="flex-1"
                      />
                      <button
                        onClick={() => handleQuickAdd(cat.id)}
                        disabled={quickAddSaving || !quickAddAmount || parseFloat(quickAddAmount) <= 0}
                        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors h-[38px]"
                      >
                        {quickAddSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        Add
                      </button>
                    </div>
                  )}

                  {/* Expandable daily entries */}
                  {isExpanded && dailyEntries.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-zinc-700 space-y-1">
                      {dailyEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between text-xs py-1"
                        >
                          <span className="text-zinc-400">{formatDate(entry.date)}</span>
                          <div className="flex items-center gap-2">
                            {entry.notes && (
                              <span className="text-zinc-500 truncate max-w-[150px]">
                                {entry.notes}
                              </span>
                            )}
                            <span className="text-white font-medium">
                              {formatCurrency(entry.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isExpanded && dailyEntries.length === 0 && (
                    <div className="mt-2 pt-2 border-t border-zinc-700 text-xs text-zinc-500">
                      No entries this week.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Dashboard: This Month */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>This Month</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const spent = monthSumByCat(cat.id);
              const pct =
                cat.monthly_amount > 0
                  ? Math.round((spent / cat.monthly_amount) * 100)
                  : 0;
              const budgetColor = getBudgetColor(spent, cat.monthly_amount);
              const barColor = getBudgetBarColor(spent, cat.monthly_amount);
              return (
                <div key={cat.id} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-400">{cat.name}</span>
                    <span className="text-xs text-zinc-500">
                      {formatCurrency(cat.monthly_amount)}/mo
                    </span>
                  </div>
                  <div className={cn('text-lg font-semibold mb-1', budgetColor)}>
                    {formatCurrency(spent)}
                  </div>
                  <div className="w-full bg-zinc-700 rounded-full h-2">
                    <div
                      className={cn('h-2 rounded-full transition-all', barColor)}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className={cn('text-xs mt-1', budgetColor)}>
                    {pct}% of monthly budget
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Spending Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Spending Trend (Last 30 Days)</CardTitle>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value) => [formatCurrency(Number(value)), 'Total Spent']}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── CASH FLOW TAB ───────────────────────────────────────────────────────────

function CashFlowTab({
  userId,
  householdId,
  canEdit,
}: {
  userId: string;
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [date, setDate] = useState(getToday());
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [todayBalances, setTodayBalances] = useState<Record<string, number>>({});
  const [yesterdayBalances, setYesterdayBalances] = useState<Record<string, number>>({});
  const [trendData, setTrendData] = useState<(Record<string, unknown> & { date: string })[]>(
    []
  );
  const [newAccountName, setNewAccountName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order');
    if (data) setAccounts(data);
  }, [householdId]);

  const loadBalancesForDate = useCallback(
    async (d: string) => {
      const { data } = await supabase
        .from('account_balances')
        .select('*')
        .eq('household_id', householdId)
        .eq('date', d);
      if (data) {
        const bals: Record<string, number> = {};
        data.forEach((b: AccountBalance) => {
          bals[b.account_id] = b.balance;
        });
        return bals;
      }
      return {};
    },
    [householdId]
  );

  const loadDashboardData = useCallback(async () => {
    const today = getToday();
    const yesterday = getYesterday();
    const tBals = await loadBalancesForDate(today);
    const yBals = await loadBalancesForDate(yesterday);
    setTodayBalances(tBals);
    setYesterdayBalances(yBals);
  }, [loadBalancesForDate]);

  const loadTrendData = useCallback(async () => {
    const ninetyDaysAgo = getDaysAgo(90);
    const { data } = await supabase
      .from('account_balances')
      .select('*, accounts(name)')
      .eq('household_id', householdId)
      .gte('date', ninetyDaysAgo)
      .order('date');
    if (data) {
      const byDate: Record<string, Record<string, number>> = {};
      data.forEach((b: AccountBalance & { accounts: { name: string } | null }) => {
        if (!byDate[b.date]) byDate[b.date] = {};
        const accName = b.accounts?.name ?? b.account_id;
        byDate[b.date][accName] = b.balance;
      });
      const trend = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, bals]) => {
          const total = Object.values(bals).reduce((s, v) => s + v, 0);
          return { date: d, total, ...bals } as Record<string, unknown> & { date: string };
        });
      setTrendData(trend);
    }
  }, [householdId]);

  const loadFormBalances = useCallback(async () => {
    const bals = await loadBalancesForDate(date);
    setBalances(bals);
  }, [date, loadBalancesForDate]);

  const loadAll = useCallback(async () => {
    await loadAccounts();
    await loadFormBalances();
    await loadDashboardData();
    await loadTrendData();
  }, [loadAccounts, loadFormBalances, loadDashboardData, loadTrendData]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadFormBalances();
  }, [date, loadFormBalances]);

  const handleSave = async () => {
    setSaving(true);
    for (const acc of accounts) {
      const balance = balances[acc.id];
      if (balance !== undefined) {
        await supabase.from('account_balances').upsert(
          {
            user_id: userId,
            household_id: householdId,
            account_id: acc.id,
            date,
            balance,
          },
          { onConflict: 'household_id,account_id,date' }
        );
      }
    }
    await loadAll();
    setSaving(false);
  };

  const addAccount = async () => {
    if (!newAccountName.trim()) return;
    await supabase.from('accounts').insert({
      user_id: userId,
      household_id: householdId,
      name: newAccountName.trim(),
      sort_order: accounts.length,
    });
    setNewAccountName('');
    await loadAccounts();
  };

  const deleteAccount = async (accId: string) => {
    await supabase.from('accounts').delete().eq('id', accId);
    setDeleteConfirm(null);
    await loadAll();
  };

  const seedDefaults = async () => {
    const rows = DEFAULT_ACCOUNTS.map((name, i) => ({
      user_id: userId,
      household_id: householdId,
      name,
      sort_order: i,
    }));
    await supabase.from('accounts').insert(rows);
    await loadAll();
  };

  const renameAccount = async (accId: string, newName: string) => {
    await supabase.from('accounts').update({ name: newName }).eq('id', accId);
    await loadAccounts();
  };

  const totalToday = accounts.reduce((s, a) => s + (todayBalances[a.id] || 0), 0);
  const accountNames = accounts.map((a) => a.name);

  const lineColors = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ef4444',
    '#06b6d4',
    '#f97316',
    '#ec4899',
  ];

  return (
    <div className="space-y-6">
      {/* Settings toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          {showSettings ? 'Hide Settings' : 'Manage Accounts'}
        </button>
      </div>

      {/* Account management */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>

          {accounts.length === 0 && (
            <div className="text-center py-6">
              <p className="text-zinc-400 mb-4">No accounts yet.</p>
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

          {accounts.length > 0 && (
            <div className="space-y-2 mb-4">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between bg-zinc-800 rounded-lg p-3"
                >
                  <InlineEdit
                    value={acc.name}
                    onSave={(v) => renameAccount(acc.id, v)}
                    className="text-sm font-medium text-white"
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <>
                      {deleteConfirm === acc.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">Delete?</span>
                          <button
                            onClick={() => deleteAccount(acc.id)}
                            className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(acc.id)}
                          className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                        >
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
                label="Account Name"
                type="text"
                value={newAccountName}
                onChange={setNewAccountName}
                placeholder="e.g. Savings Account"
                className="flex-1"
              />
              <button
                onClick={addAccount}
                disabled={!newAccountName.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors h-[38px]"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Daily balance entry */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily Balance Entry</CardTitle>
          </CardHeader>
          <div className="mb-4">
            <InputField
              label="Date"
              type="date"
              value={date}
              onChange={setDate}
              className="w-48"
              disabled={!canEdit}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {accounts.map((acc) => (
              <InputField
                key={acc.id}
                label={acc.name}
                value={balances[acc.id] ?? ''}
                step="0.01"
                placeholder="0.00"
                disabled={!canEdit}
                onChange={(v) =>
                  setBalances((b) => ({ ...b, [acc.id]: parseFloat(v) || 0 }))
                }
              />
            ))}
          </div>
          {canEdit && (
            <div className="mt-4 flex justify-end">
              <SaveButton saving={saving} onClick={handleSave} />
            </div>
          )}
        </Card>
      )}

      {/* Dashboard: Account balances */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Account Balances</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
            {accounts.map((acc) => {
              const today = todayBalances[acc.id] || 0;
              const yesterday = yesterdayBalances[acc.id] || 0;
              const change = today - yesterday;
              return (
                <div key={acc.id} className="bg-zinc-800 rounded-lg p-3">
                  <div className="text-xs text-zinc-400 mb-1">{acc.name}</div>
                  <div className="text-lg font-semibold text-white">
                    {formatCurrencyDecimal(today)}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Yesterday: {formatCurrencyDecimal(yesterday)}
                  </div>
                  {change !== 0 && (
                    <div
                      className={cn(
                        'text-sm font-medium mt-1',
                        change > 0 ? 'text-emerald-400' : 'text-red-400'
                      )}
                    >
                      {change > 0 ? '+' : ''}
                      {formatCurrencyDecimal(change)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total liquid cash */}
          <div className="bg-zinc-800 border border-blue-600/30 rounded-lg p-4">
            <div className="text-sm text-zinc-400">Total Liquid Cash</div>
            <div className="text-3xl font-bold text-white">
              {formatCurrencyDecimal(totalToday)}
            </div>
          </div>
        </Card>
      )}

      {/* Total Cash Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Total Cash Trend (Last 90 Days)</CardTitle>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value) => [formatCurrencyDecimal(Number(value))]}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total Cash"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Individual Account Trends */}
      {trendData.length > 1 && accountNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Individual Account Trends (Last 90 Days)</CardTitle>
          </CardHeader>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value) => [formatCurrencyDecimal(Number(value))]}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />
                {accountNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={lineColors[i % lineColors.length]}
                    strokeWidth={1.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── REIMBURSEMENTS TAB ──────────────────────────────────────────────────────

function ReimbursementsTab({
  userId,
  householdId,
  canEdit,
}: {
  userId: string;
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [form, setForm] = useState({
    date: getToday(),
    amount: 0,
    reason: '',
    notes: '',
    paid: false,
  });

  const loadReimbursements = useCallback(async () => {
    const { data } = await supabase
      .from('reimbursements')
      .select('*')
      .eq('household_id', householdId)
      .order('date', { ascending: false });
    if (data) setReimbursements(data);
  }, [householdId]);

  useEffect(() => {
    loadReimbursements();
  }, [loadReimbursements]);

  const handleAdd = async () => {
    if (!form.reason || form.amount <= 0) return;
    setSaving(true);
    await supabase.from('reimbursements').insert({
      user_id: userId,
      household_id: householdId,
      date: form.date,
      amount: form.amount,
      reason: form.reason,
      notes: form.notes || null,
      paid: form.paid,
    });
    setForm({ date: getToday(), amount: 0, reason: '', notes: '', paid: false });
    await loadReimbursements();
    setSaving(false);
  };

  const togglePaid = async (id: string, currentPaid: boolean) => {
    await supabase.from('reimbursements').update({ paid: !currentPaid }).eq('id', id);
    await loadReimbursements();
  };

  const totalOutstanding = reimbursements
    .filter((r) => !r.paid)
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      {/* Outstanding total */}
      <Card className="border-amber-600/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-400">Total Outstanding</div>
            <div className="text-3xl font-bold text-amber-400">
              {formatCurrencyDecimal(totalOutstanding)}
            </div>
          </div>
          <Receipt className="w-10 h-10 text-amber-400/30" />
        </div>
      </Card>

      {/* Entry form */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>New Reimbursement</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <InputField
              label="Date"
              type="date"
              value={form.date}
              onChange={(v) => setForm((f) => ({ ...f, date: v }))}
            />
            <InputField
              label="Amount ($)"
              value={form.amount}
              step="0.01"
              onChange={(v) => setForm((f) => ({ ...f, amount: parseFloat(v) || 0 }))}
            />
            <InputField
              label="Reason"
              type="text"
              value={form.reason}
              onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
              className="col-span-2 sm:col-span-1"
            />
            <InputField
              label="Notes"
              type="text"
              value={form.notes}
              placeholder="Optional"
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.paid}
                onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))}
                className="rounded bg-zinc-800 border-zinc-700"
              />
              Already paid
            </label>
            <button
              onClick={handleAdd}
              disabled={saving || !form.reason || form.amount <= 0}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add
            </button>
          </div>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>All Reimbursements</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {reimbursements.map((r) => (
            <div
              key={r.id}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg',
                r.paid ? 'bg-zinc-800/50' : 'bg-zinc-800'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      r.paid ? 'text-zinc-500 line-through' : 'text-white'
                    )}
                  >
                    {r.reason}
                  </span>
                  {r.paid && (
                    <span className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full">
                      Paid
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {formatDate(r.date)}
                  {r.notes && <> &middot; {r.notes}</>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    r.paid ? 'text-zinc-500' : 'text-amber-400'
                  )}
                >
                  {formatCurrencyDecimal(r.amount)}
                </span>
                {canEdit && (
                  <button
                    onClick={() => togglePaid(r.id, r.paid)}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      r.paid
                        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-400'
                        : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400'
                    )}
                    title={r.paid ? 'Mark unpaid' : 'Mark paid'}
                  >
                    {r.paid ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
          {reimbursements.length === 0 && (
            <div className="text-center text-zinc-500 py-8">No reimbursements yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── NET WORTH TAB ───────────────────────────────────────────────────────────

function NetWorthTab({
  userId,
  householdId,
  canEdit,
}: {
  userId: string;
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [items, setItems] = useState<NetWorthItem[]>([]);
  const [currentEntries, setCurrentEntries] = useState<
    (NetWorthEntry & { net_worth_items: { name: string; type: string } | null })[]
  >([]);
  const [allEntries, setAllEntries] = useState<
    (NetWorthEntry & { net_worth_items: { type: string } | null })[]
  >([]);
  const [month, setMonth] = useState(getMonthStart(getToday()));
  const [values, setValues] = useState<Record<string, number>>({});
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<'asset' | 'liability'>('asset');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const assets = items.filter((i) => i.type === 'asset');
  const liabilities = items.filter((i) => i.type === 'liability');

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('net_worth_items')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order');
    if (data) setItems(data);
  }, [householdId]);

  const loadEntriesForMonth = useCallback(
    async (m: string) => {
      const { data } = await supabase
        .from('net_worth_entries')
        .select('*, net_worth_items(name, type)')
        .eq('household_id', householdId)
        .eq('month', m);
      if (data) {
        setCurrentEntries(data);
        const vals: Record<string, number> = {};
        data.forEach((e) => {
          vals[e.item_id] = e.value;
        });
        setValues(vals);
      }
    },
    [householdId]
  );

  const loadAllEntries = useCallback(async () => {
    const { data } = await supabase
      .from('net_worth_entries')
      .select('*, net_worth_items(type)')
      .eq('household_id', householdId)
      .order('month');
    if (data) setAllEntries(data);
  }, [householdId]);

  const loadAll = useCallback(async () => {
    await loadItems();
    await loadEntriesForMonth(month);
    await loadAllEntries();
  }, [loadItems, loadEntriesForMonth, month, loadAllEntries]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadEntriesForMonth(month);
  }, [month, loadEntriesForMonth]);

  const handleSave = async () => {
    setSaving(true);
    for (const item of items) {
      const value = values[item.id];
      if (value !== undefined) {
        await supabase.from('net_worth_entries').upsert(
          {
            user_id: userId,
            household_id: householdId,
            item_id: item.id,
            month,
            value,
          },
          { onConflict: 'household_id,item_id,month' }
        );
      }
    }
    await loadAll();
    setSaving(false);
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;
    const sameTypeItems = items.filter((i) => i.type === newItemType);
    await supabase.from('net_worth_items').insert({
      user_id: userId,
      household_id: householdId,
      type: newItemType,
      name: newItemName.trim(),
      sort_order: sameTypeItems.length,
    });
    setNewItemName('');
    await loadItems();
  };

  const deleteItem = async (itemId: string) => {
    await supabase.from('net_worth_items').delete().eq('id', itemId);
    setDeleteConfirm(null);
    await loadAll();
  };

  const seedDefaults = async () => {
    const assetRows = DEFAULT_NET_WORTH_ASSETS.map((name, i) => ({
      user_id: userId,
      household_id: householdId,
      type: 'asset' as const,
      name,
      sort_order: i,
    }));
    const liabilityRows = DEFAULT_NET_WORTH_LIABILITIES.map((name, i) => ({
      user_id: userId,
      household_id: householdId,
      type: 'liability' as const,
      name,
      sort_order: i,
    }));
    await supabase.from('net_worth_items').insert([...assetRows, ...liabilityRows]);
    await loadAll();
  };

  const renameItem = async (itemId: string, newName: string) => {
    await supabase.from('net_worth_items').update({ name: newName }).eq('id', itemId);
    await loadItems();
  };

  // Compute totals from current values
  const totalAssets = assets.reduce((s, a) => s + (values[a.id] || 0), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + (values[l.id] || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  // Compute trend chart data
  const trendData = (() => {
    const byMonth: Record<string, { assets: number; liabilities: number }> = {};
    allEntries.forEach((e) => {
      if (!byMonth[e.month]) byMonth[e.month] = { assets: 0, liabilities: 0 };
      const type = e.net_worth_items?.type;
      if (type === 'asset') {
        byMonth[e.month].assets += e.value;
      } else if (type === 'liability') {
        byMonth[e.month].liabilities += e.value;
      }
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, data]) => ({
        month: m.slice(0, 7),
        assets: data.assets,
        liabilities: data.liabilities,
        netWorth: data.assets - data.liabilities,
      }));
  })();

  const renderItemList = (itemList: NetWorthItem[], label: string, color: string) => (
    <div>
      <h4 className={cn('text-sm font-medium mb-3', color)}>{label}</h4>
      <div className="space-y-2">
        {itemList.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between bg-zinc-800 rounded-lg p-3"
          >
            <InlineEdit
              value={item.name}
              onSave={(v) => renameItem(item.id, v)}
              className="text-sm font-medium text-white"
              disabled={!canEdit}
            />
            {canEdit && (
              <>
                {deleteConfirm === item.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400">Delete?</span>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(item.id)}
                    className="p-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-zinc-400 mb-1">Total Assets</div>
          <div className="text-xl font-bold text-emerald-400">
            {formatCurrency(totalAssets)}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-zinc-400 mb-1">Total Liabilities</div>
          <div className="text-xl font-bold text-red-400">
            {formatCurrency(totalLiabilities)}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-zinc-400 mb-1">Net Worth</div>
          <div
            className={cn(
              'text-xl font-bold',
              netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {formatCurrency(netWorth)}
          </div>
        </Card>
      </div>

      {/* Settings toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          {showSettings ? 'Hide Settings' : 'Manage Items'}
        </button>
      </div>

      {/* Item management */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Net Worth Items</CardTitle>
          </CardHeader>

          {items.length === 0 && (
            <div className="text-center py-6">
              <p className="text-zinc-400 mb-4">No items yet.</p>
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

          {items.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
              {renderItemList(assets, 'Assets', 'text-emerald-400')}
              {renderItemList(liabilities, 'Liabilities', 'text-red-400')}
            </div>
          )}

          {/* Add new item */}
          {canEdit && (
            <div className="flex items-end gap-3 pt-3 border-t border-zinc-800">
              <InputField
                label="Item Name"
                type="text"
                value={newItemName}
                onChange={setNewItemName}
                placeholder="e.g. Real Estate"
                className="flex-1"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Type</label>
                <select
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value as 'asset' | 'liability')}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors"
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                </select>
              </div>
              <button
                onClick={addItem}
                disabled={!newItemName.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors h-[38px]"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Monthly snapshot entry */}
      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Snapshot</CardTitle>
          </CardHeader>
          <div className="mb-4">
            <InputField
              label="Month (YYYY-MM)"
              type="month"
              value={month.slice(0, 7)}
              onChange={(v) => {
                if (v) setMonth(v + '-01');
              }}
              className="w-48"
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assets */}
            <div>
              <h4 className="text-sm font-medium text-emerald-400 mb-3">Assets</h4>
              <div className="grid grid-cols-2 gap-3">
                {assets.map((item) => (
                  <InputField
                    key={item.id}
                    label={item.name}
                    value={values[item.id] ?? ''}
                    step="0.01"
                    placeholder="0.00"
                    disabled={!canEdit}
                    onChange={(v) =>
                      setValues((vals) => ({ ...vals, [item.id]: parseFloat(v) || 0 }))
                    }
                  />
                ))}
              </div>
            </div>

            {/* Liabilities */}
            <div>
              <h4 className="text-sm font-medium text-red-400 mb-3">Liabilities</h4>
              <div className="grid grid-cols-2 gap-3">
                {liabilities.map((item) => (
                  <InputField
                    key={item.id}
                    label={item.name}
                    value={values[item.id] ?? ''}
                    step="0.01"
                    placeholder="0.00"
                    disabled={!canEdit}
                    onChange={(v) =>
                      setValues((vals) => ({ ...vals, [item.id]: parseFloat(v) || 0 }))
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="mt-4 flex justify-end">
              <SaveButton saving={saving} onClick={handleSave} />
            </div>
          )}
        </Card>
      )}

      {/* Net worth trend chart */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Net Worth Trend</CardTitle>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 12 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value) => [formatCurrency(Number(value))]}
                />
                <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="netWorth"
                  name="Net Worth"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="assets"
                  name="Assets"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="liabilities"
                  name="Liabilities"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── INVESTMENTS TAB ─────────────────────────────────────────────────────────

function InvestmentsTab({
  userId,
  householdId,
  canEdit,
}: {
  userId: string;
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [holdings, setHoldings] = useState<Investment[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadHoldings = useCallback(async () => {
    const { data } = await supabase
      .from('investments')
      .select('*')
      .eq('household_id', householdId)
      .order('tier')
      .order('symbol');
    if (data) {
      setHoldings(data);
      const vals: Record<string, string> = {};
      data.forEach((h) => {
        vals[h.id] = h.current_value_cad.toString();
      });
      setEditValues(vals);
    }
  }, [householdId]);

  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  const seedHoldings = async () => {
    setSeeding(true);
    const rows = DEFAULT_HOLDINGS.map((h) => ({
      ...h,
      user_id: userId,
      household_id: householdId,
    }));
    await supabase.from('investments').insert(rows);
    await loadHoldings();
    setSeeding(false);
  };

  const updateValue = async (id: string) => {
    const val = parseFloat(editValues[id]);
    if (isNaN(val)) return;
    setSavingId(id);
    await supabase
      .from('investments')
      .update({ current_value_cad: val, last_updated: new Date().toISOString() })
      .eq('id', id);
    await loadHoldings();
    setSavingId(null);
  };

  const totalValue = holdings.reduce((s, h) => s + h.current_value_cad, 0);

  const tiers = Object.keys(TIER_LABELS) as Investment['tier'][];
  const grouped = tiers.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    target: TIER_TARGETS[tier],
    holdings: holdings.filter((h) => h.tier === tier),
    totalValue: holdings
      .filter((h) => h.tier === tier)
      .reduce((s, h) => s + h.current_value_cad, 0),
  }));

  const actualPieData = grouped.map((g) => ({
    name: g.label.split(' (')[0],
    value: totalValue > 0 ? (g.totalValue / totalValue) * 100 : 0,
    color: TIER_COLORS[g.tier],
  }));

  const targetPieData = grouped.map((g) => ({
    name: g.label.split(' (')[0],
    value: g.target * 100,
    color: TIER_COLORS[g.tier],
  }));

  if (holdings.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <PieIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 mb-4">No investment holdings yet.</p>
          {canEdit && (
            <button
              onClick={seedHoldings}
              disabled={seeding}
              className="flex items-center gap-2 mx-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {seeding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Seed Default Holdings
            </button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Total portfolio */}
      <Card className="border-blue-600/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-400">Total Portfolio Value</div>
            <div className="text-3xl font-bold text-white">
              {formatCurrencyDecimal(totalValue)}
            </div>
          </div>
          <PieIcon className="w-10 h-10 text-blue-400/30" />
        </div>
      </Card>

      {/* Allocation chart */}
      <Card>
        <CardHeader>
          <CardTitle>Allocation: Actual (Outer) vs Target (Inner)</CardTitle>
        </CardHeader>
        <div className="h-80 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* Inner ring: target */}
              <Pie
                data={targetPieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                strokeWidth={0}
                opacity={0.5}
              >
                {targetPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              {/* Outer ring: actual */}
              <Pie
                data={actualPieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={90}
                outerRadius={120}
                strokeWidth={0}
                label={({ name, value }) => `${name} ${value.toFixed(1)}%`}
              >
                {actualPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => <span className="text-zinc-300">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Holdings grouped by tier */}
      {grouped.map((g) => (
        <Card key={g.tier}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                <span style={{ color: TIER_COLORS[g.tier] }}>{g.label}</span>
              </CardTitle>
              <div className="text-sm text-zinc-400">
                {formatCurrencyDecimal(g.totalValue)}
                {totalValue > 0 && (
                  <span className="ml-2">
                    ({((g.totalValue / totalValue) * 100).toFixed(1)}% actual /{' '}
                    {(g.target * 100).toFixed(0)}% target)
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <div className="space-y-2">
            {g.holdings.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 bg-zinc-800 rounded-lg p-3"
              >
                <div className="w-16 text-sm font-mono font-semibold text-white">
                  {h.symbol}
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    step="0.01"
                    value={editValues[h.id] ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, [h.id]: e.target.value }))
                    }
                    onBlur={() => updateValue(h.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateValue(h.id);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="text-xs text-zinc-500 w-20 text-right">
                  Target: {h.target_pct}%
                </div>
                <div className="text-xs text-zinc-400 w-16 text-right">
                  {totalValue > 0
                    ? ((h.current_value_cad / totalValue) * 100).toFixed(1) + '%'
                    : '0%'}
                </div>
                {savingId === h.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
