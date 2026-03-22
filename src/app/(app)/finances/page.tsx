'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
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
  BudgetWeekly,
  CashflowDaily,
  Reimbursement,
  NetWorthMonthly,
  Investment,
} from '@/lib/types';
import { BUDGET_TARGETS, TIER_LABELS, TIER_TARGETS } from '@/lib/types';
import {
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
} from 'lucide-react';

const TABS = ['Budget', 'Cash Flow', 'Reimbursements', 'Net Worth', 'Investments'] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
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

const DEFAULT_HOLDINGS: Omit<Investment, 'id' | 'user_id' | 'last_updated'>[] = [
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

// ─── Input helpers ───────────────────────────────────────────────────────────

function InputField({
  label,
  value,
  onChange,
  type = 'number',
  step,
  placeholder,
  className,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  className?: string;
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
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors"
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

// ─── Main page ───────────────────────────────────────────────────────────────

export default function FinancesPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Budget');

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
      {activeTab === 'Budget' && <BudgetTab userId={user.id} />}
      {activeTab === 'Cash Flow' && <CashFlowTab userId={user.id} />}
      {activeTab === 'Reimbursements' && <ReimbursementsTab userId={user.id} />}
      {activeTab === 'Net Worth' && <NetWorthTab userId={user.id} />}
      {activeTab === 'Investments' && <InvestmentsTab userId={user.id} />}
    </div>
  );
}

// ─── BUDGET TAB ──────────────────────────────────────────────────────────────

function BudgetTab({ userId }: { userId: string }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [budgets, setBudgets] = useState<BudgetWeekly[]>([]);
  const [form, setForm] = useState({
    week_start: getWeekStart(getToday()),
    essentials: 0,
    investments: 0,
    savings: 0,
    debt: 0,
    fun: 0,
    money_in: 0,
    amex_balance: 0,
    notes: '',
  });

  const loadBudgets = useCallback(async () => {
    const { data } = await supabase
      .from('budget_weekly')
      .select('*')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(20);
    if (data) setBudgets(data);
  }, [userId]);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  // When week_start changes, load existing data for that week
  useEffect(() => {
    const existing = budgets.find((b) => b.week_start === form.week_start);
    if (existing) {
      setForm({
        week_start: existing.week_start,
        essentials: existing.essentials,
        investments: existing.investments,
        savings: existing.savings,
        debt: existing.debt,
        fun: existing.fun,
        money_in: existing.money_in,
        amex_balance: existing.amex_balance ?? 0,
        notes: existing.notes ?? '',
      });
    }
  }, [form.week_start, budgets]);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('budget_weekly').upsert(
      {
        user_id: userId,
        week_start: form.week_start,
        essentials: form.essentials,
        investments: form.investments,
        savings: form.savings,
        debt: form.debt,
        fun: form.fun,
        money_in: form.money_in,
        amex_balance: form.amex_balance || null,
        notes: form.notes || null,
      },
      { onConflict: 'user_id,week_start' }
    );
    await loadBudgets();
    setSaving(false);
  };

  // Current week budget vs actual
  const currentWeekStart = getWeekStart(getToday());
  const currentWeek = budgets.find((b) => b.week_start === currentWeekStart);

  // Month-to-date: sum all weeks in current month
  const currentMonth = getToday().slice(0, 7);
  const monthWeeks = budgets.filter((b) => b.week_start.startsWith(currentMonth));
  const mtd = {
    essentials: monthWeeks.reduce((s, b) => s + b.essentials, 0),
    investments: monthWeeks.reduce((s, b) => s + b.investments, 0),
    savings: monthWeeks.reduce((s, b) => s + b.savings, 0),
    debt: monthWeeks.reduce((s, b) => s + b.debt, 0),
    fun: monthWeeks.reduce((s, b) => s + b.fun, 0),
  };

  const categories = ['essentials', 'investments', 'savings', 'debt', 'fun'] as const;

  function varianceColor(actual: number, target: number, isSpending: boolean) {
    if (actual === 0) return 'text-zinc-400';
    if (isSpending) {
      return actual <= target ? 'text-emerald-400' : 'text-red-400';
    }
    // For investments/savings, meeting or exceeding target is good
    return actual >= target ? 'text-emerald-400' : 'text-amber-400';
  }

  const isSpendingCategory = (cat: string) => ['essentials', 'debt', 'fun'].includes(cat);

  return (
    <div className="space-y-6">
      {/* Entry form */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Budget Entry</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <InputField
            label="Week Start (Monday)"
            type="date"
            value={form.week_start}
            onChange={(v) => setForm((f) => ({ ...f, week_start: v }))}
          />
          {categories.map((cat) => (
            <InputField
              key={cat}
              label={`${cat.charAt(0).toUpperCase() + cat.slice(1)} ($)`}
              value={form[cat]}
              step="0.01"
              onChange={(v) => setForm((f) => ({ ...f, [cat]: parseFloat(v) || 0 }))}
            />
          ))}
          <InputField
            label="Money In ($)"
            value={form.money_in}
            step="0.01"
            onChange={(v) => setForm((f) => ({ ...f, money_in: parseFloat(v) || 0 }))}
          />
          <InputField
            label="Amex Balance ($)"
            value={form.amex_balance}
            step="0.01"
            onChange={(v) => setForm((f) => ({ ...f, amex_balance: parseFloat(v) || 0 }))}
          />
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <SaveButton saving={saving} onClick={handleSave} />
        </div>
      </Card>

      {/* Current week vs target */}
      <Card>
        <CardHeader>
          <CardTitle>This Week vs Target</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {categories.map((cat) => {
            const actual = currentWeek?.[cat] ?? 0;
            const target = BUDGET_TARGETS[cat].weekly;
            const variance = actual - target;
            return (
              <div key={cat} className="bg-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-400 capitalize mb-1">{cat}</div>
                <div className="text-lg font-semibold text-white">
                  {formatCurrency(actual)}
                </div>
                <div className="text-xs text-zinc-500">
                  Target: {formatCurrency(target)}
                </div>
                <div
                  className={cn(
                    'text-sm font-medium mt-1',
                    varianceColor(actual, target, isSpendingCategory(cat))
                  )}
                >
                  {variance >= 0 ? '+' : ''}
                  {formatCurrency(variance)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Month-to-date vs monthly target */}
      <Card>
        <CardHeader>
          <CardTitle>Month-to-Date vs Monthly Target</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {categories.map((cat) => {
            const actual = mtd[cat];
            const target = BUDGET_TARGETS[cat].monthly;
            const variance = actual - target;
            const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
            return (
              <div key={cat} className="bg-zinc-800 rounded-lg p-3">
                <div className="text-xs text-zinc-400 capitalize mb-1">{cat}</div>
                <div className="text-lg font-semibold text-white">
                  {formatCurrency(actual)}
                </div>
                <div className="text-xs text-zinc-500">
                  Target: {formatCurrency(target)}
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-2">
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      pct > 100 && isSpendingCategory(cat)
                        ? 'bg-red-500'
                        : pct > 100
                          ? 'bg-emerald-500'
                          : 'bg-blue-500'
                    )}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div
                  className={cn(
                    'text-xs mt-1',
                    varianceColor(actual, target, isSpendingCategory(cat))
                  )}
                >
                  {pct}% &middot; {variance >= 0 ? '+' : ''}
                  {formatCurrency(variance)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─── CASH FLOW TAB ───────────────────────────────────────────────────────────

function CashFlowTab({ userId }: { userId: string }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<CashflowDaily[]>([]);
  const [form, setForm] = useState({
    date: getToday(),
    personal_in: 0,
    personal_out: 0,
    savings_in: 0,
    savings_out: 0,
    frameworks_in: 0,
    frameworks_out: 0,
    frameworks_savings_in: 0,
    frameworks_savings_out: 0,
    notes: '',
  });

  const loadEntries = useCallback(async () => {
    const { data } = await supabase
      .from('cashflow_daily')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30);
    if (data) setEntries(data);
  }, [userId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Load existing entry when date changes
  useEffect(() => {
    const existing = entries.find((e) => e.date === form.date);
    if (existing) {
      setForm({
        date: existing.date,
        personal_in: existing.personal_in,
        personal_out: existing.personal_out,
        savings_in: existing.savings_in,
        savings_out: existing.savings_out,
        frameworks_in: existing.frameworks_in,
        frameworks_out: existing.frameworks_out,
        frameworks_savings_in: existing.frameworks_savings_in,
        frameworks_savings_out: existing.frameworks_savings_out,
        notes: existing.notes ?? '',
      });
    }
  }, [form.date, entries]);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('cashflow_daily').upsert(
      {
        user_id: userId,
        date: form.date,
        personal_in: form.personal_in,
        personal_out: form.personal_out,
        savings_in: form.savings_in,
        savings_out: form.savings_out,
        frameworks_in: form.frameworks_in,
        frameworks_out: form.frameworks_out,
        frameworks_savings_in: form.frameworks_savings_in,
        frameworks_savings_out: form.frameworks_savings_out,
        notes: form.notes || null,
      },
      { onConflict: 'user_id,date' }
    );
    await loadEntries();
    setSaving(false);
  };

  // Show last 14 days
  const last14 = entries.slice(0, 14);

  // Running balances (cumulative from oldest to newest)
  const sorted = [...entries].reverse();
  const runningBalances = new Map<
    string,
    { personal: number; savings: number; frameworks: number; frameworksSavings: number }
  >();
  let rPersonal = 0;
  let rSavings = 0;
  let rFrameworks = 0;
  let rFwSavings = 0;
  for (const e of sorted) {
    rPersonal += e.personal_in - e.personal_out;
    rSavings += e.savings_in - e.savings_out;
    rFrameworks += e.frameworks_in - e.frameworks_out;
    rFwSavings += e.frameworks_savings_in - e.frameworks_savings_out;
    runningBalances.set(e.date, {
      personal: rPersonal,
      savings: rSavings,
      frameworks: rFrameworks,
      frameworksSavings: rFwSavings,
    });
  }

  const flowFields = [
    'personal_in',
    'personal_out',
    'savings_in',
    'savings_out',
    'frameworks_in',
    'frameworks_out',
    'frameworks_savings_in',
    'frameworks_savings_out',
  ] as const;

  const fieldLabels: Record<string, string> = {
    personal_in: 'Personal In',
    personal_out: 'Personal Out',
    savings_in: 'Savings In',
    savings_out: 'Savings Out',
    frameworks_in: 'Frameworks In',
    frameworks_out: 'Frameworks Out',
    frameworks_savings_in: 'FW Savings In',
    frameworks_savings_out: 'FW Savings Out',
  };

  return (
    <div className="space-y-6">
      {/* Entry form */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Cash Flow Entry</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <InputField
            label="Date"
            type="date"
            value={form.date}
            onChange={(v) => setForm((f) => ({ ...f, date: v }))}
          />
          {flowFields.map((field) => (
            <InputField
              key={field}
              label={fieldLabels[field]}
              value={form[field]}
              step="0.01"
              onChange={(v) =>
                setForm((f) => ({ ...f, [field]: parseFloat(v) || 0 }))
              }
            />
          ))}
          <div className="col-span-2 sm:col-span-3 lg:col-span-5">
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <SaveButton saving={saving} onClick={handleSave} />
        </div>
      </Card>

      {/* Last 14 days table */}
      <Card>
        <CardHeader>
          <CardTitle>Last 14 Days</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-right py-2 px-2">Pers. In</th>
                <th className="text-right py-2 px-2">Pers. Out</th>
                <th className="text-right py-2 px-2">Sav. In</th>
                <th className="text-right py-2 px-2">Sav. Out</th>
                <th className="text-right py-2 px-2">FW In</th>
                <th className="text-right py-2 px-2">FW Out</th>
                <th className="text-right py-2 px-2">FWS In</th>
                <th className="text-right py-2 px-2">FWS Out</th>
                <th className="text-right py-2 px-2 border-l border-zinc-700">Pers. Bal</th>
                <th className="text-right py-2 px-2">Sav. Bal</th>
                <th className="text-right py-2 px-2">FW Bal</th>
                <th className="text-right py-2 px-2">FWS Bal</th>
              </tr>
            </thead>
            <tbody>
              {last14.map((e) => {
                const bal = runningBalances.get(e.date);
                return (
                  <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-2 px-2 text-white">{formatDate(e.date)}</td>
                    <td className="py-2 px-2 text-right text-emerald-400">
                      {e.personal_in > 0 ? formatCurrency(e.personal_in) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-red-400">
                      {e.personal_out > 0 ? formatCurrency(e.personal_out) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-400">
                      {e.savings_in > 0 ? formatCurrency(e.savings_in) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-red-400">
                      {e.savings_out > 0 ? formatCurrency(e.savings_out) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-400">
                      {e.frameworks_in > 0 ? formatCurrency(e.frameworks_in) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-red-400">
                      {e.frameworks_out > 0 ? formatCurrency(e.frameworks_out) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-400">
                      {e.frameworks_savings_in > 0 ? formatCurrency(e.frameworks_savings_in) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-red-400">
                      {e.frameworks_savings_out > 0
                        ? formatCurrency(e.frameworks_savings_out)
                        : '-'}
                    </td>
                    <td className="py-2 px-2 text-right border-l border-zinc-700 text-white font-medium">
                      {bal ? formatCurrency(bal.personal) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-white font-medium">
                      {bal ? formatCurrency(bal.savings) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-white font-medium">
                      {bal ? formatCurrency(bal.frameworks) : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-white font-medium">
                      {bal ? formatCurrency(bal.frameworksSavings) : '-'}
                    </td>
                  </tr>
                );
              })}
              {last14.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center text-zinc-500 py-8">
                    No cash flow entries yet.
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

// ─── REIMBURSEMENTS TAB ──────────────────────────────────────────────────────

function ReimbursementsTab({ userId }: { userId: string }) {
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
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (data) setReimbursements(data);
  }, [userId]);

  useEffect(() => {
    loadReimbursements();
  }, [loadReimbursements]);

  const handleAdd = async () => {
    if (!form.reason || form.amount <= 0) return;
    setSaving(true);
    await supabase.from('reimbursements').insert({
      user_id: userId,
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

function NetWorthTab({ userId }: { userId: string }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [snapshots, setSnapshots] = useState<NetWorthMonthly[]>([]);

  const currentMonth = getToday().slice(0, 7) + '-01';
  const [form, setForm] = useState({
    month: currentMonth,
    rbc_balance: 0,
    triangle_balance: 0,
    scotia_visa: 0,
    scotia_loc: 0,
    td_loan_tesla: 0,
    taxes_owed: 0,
    cash_investments: 0,
    business_assets: 0,
    protocase_shares: 0,
    vehicle_assets: 0,
  });

  const loadSnapshots = useCallback(async () => {
    const { data } = await supabase
      .from('net_worth_monthly')
      .select('*')
      .eq('user_id', userId)
      .order('month', { ascending: true });
    if (data) setSnapshots(data);
  }, [userId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  // Load existing data when month changes
  useEffect(() => {
    const existing = snapshots.find((s) => s.month === form.month);
    if (existing) {
      setForm({
        month: existing.month,
        rbc_balance: existing.rbc_balance,
        triangle_balance: existing.triangle_balance,
        scotia_visa: existing.scotia_visa,
        scotia_loc: existing.scotia_loc,
        td_loan_tesla: existing.td_loan_tesla,
        taxes_owed: existing.taxes_owed,
        cash_investments: existing.cash_investments,
        business_assets: existing.business_assets,
        protocase_shares: existing.protocase_shares,
        vehicle_assets: existing.vehicle_assets,
      });
    }
  }, [form.month, snapshots]);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from('net_worth_monthly').upsert(
      {
        user_id: userId,
        ...form,
      },
      { onConflict: 'user_id,month' }
    );
    await loadSnapshots();
    setSaving(false);
  };

  const liabilityFields = [
    'rbc_balance',
    'triangle_balance',
    'scotia_visa',
    'scotia_loc',
    'td_loan_tesla',
    'taxes_owed',
  ] as const;

  const assetFields = [
    'cash_investments',
    'business_assets',
    'protocase_shares',
    'vehicle_assets',
  ] as const;

  const liabilityLabels: Record<string, string> = {
    rbc_balance: 'RBC Balance',
    triangle_balance: 'Triangle Balance',
    scotia_visa: 'Scotia Visa',
    scotia_loc: 'Scotia LOC',
    td_loan_tesla: 'TD Loan (Tesla)',
    taxes_owed: 'Taxes Owed',
  };

  const assetLabels: Record<string, string> = {
    cash_investments: 'Cash & Investments',
    business_assets: 'Business Assets',
    protocase_shares: 'Protocase Shares',
    vehicle_assets: 'Vehicle Assets',
  };

  const totalLiabilities = liabilityFields.reduce(
    (s, f) => s + (form[f] || 0),
    0
  );
  const totalAssets = assetFields.reduce((s, f) => s + (form[f] || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  // Chart data
  const chartData = snapshots.map((s) => {
    const liabs =
      s.rbc_balance +
      s.triangle_balance +
      s.scotia_visa +
      s.scotia_loc +
      s.td_loan_tesla +
      s.taxes_owed;
    const assets =
      s.cash_investments + s.business_assets + s.protocase_shares + s.vehicle_assets;
    return {
      month: s.month.slice(0, 7),
      assets,
      liabilities: liabs,
      netWorth: assets - liabs,
    };
  });

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

      {/* Entry form */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Snapshot</CardTitle>
        </CardHeader>
        <div className="mb-4">
          <InputField
            label="Month (YYYY-MM-01)"
            type="date"
            value={form.month}
            onChange={(v) => {
              // Force to first of month
              const d = v.slice(0, 7) + '-01';
              setForm((f) => ({ ...f, month: d }));
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Liabilities */}
          <div>
            <h4 className="text-sm font-medium text-red-400 mb-3">Liabilities</h4>
            <div className="grid grid-cols-2 gap-3">
              {liabilityFields.map((field) => (
                <InputField
                  key={field}
                  label={liabilityLabels[field]}
                  value={form[field]}
                  step="0.01"
                  onChange={(v) =>
                    setForm((f) => ({ ...f, [field]: parseFloat(v) || 0 }))
                  }
                />
              ))}
            </div>
          </div>

          {/* Assets */}
          <div>
            <h4 className="text-sm font-medium text-emerald-400 mb-3">Assets</h4>
            <div className="grid grid-cols-2 gap-3">
              {assetFields.map((field) => (
                <InputField
                  key={field}
                  label={assetLabels[field]}
                  value={form[field]}
                  step="0.01"
                  onChange={(v) =>
                    setForm((f) => ({ ...f, [field]: parseFloat(v) || 0 }))
                  }
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <SaveButton saving={saving} onClick={handleSave} />
        </div>
      </Card>

      {/* Net worth trend chart */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Net Worth Trend</CardTitle>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
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
                <Legend
                  wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }}
                />
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

function InvestmentsTab({ userId }: { userId: string }) {
  const supabase = createClient();
  const [holdings, setHoldings] = useState<Investment[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadHoldings = useCallback(async () => {
    const { data } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId)
      .order('tier')
      .order('symbol');
    if (data) {
      setHoldings(data);
      // Init edit values
      const vals: Record<string, string> = {};
      data.forEach((h) => {
        vals[h.id] = h.current_value_cad.toString();
      });
      setEditValues(vals);
    }
  }, [userId]);

  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  const seedHoldings = async () => {
    setSeeding(true);
    const rows = DEFAULT_HOLDINGS.map((h) => ({
      ...h,
      user_id: userId,
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

  // Group by tier
  const tiers = Object.keys(TIER_LABELS) as Investment['tier'][];
  const grouped = tiers.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    target: TIER_TARGETS[tier],
    holdings: holdings.filter((h) => h.tier === tier),
    totalValue: holdings.filter((h) => h.tier === tier).reduce((s, h) => s + h.current_value_cad, 0),
  }));

  // Pie chart data
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
                    ({((g.totalValue / totalValue) * 100).toFixed(1)}% actual / {(g.target * 100).toFixed(0)}% target)
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
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, [h.id]: e.target.value }))
                    }
                    onBlur={() => updateValue(h.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateValue(h.id);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors"
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
