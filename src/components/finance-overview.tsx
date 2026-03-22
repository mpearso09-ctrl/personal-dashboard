'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getToday, getWeekStart, cn } from '@/lib/utils';
import type { BudgetCategory, BudgetDailyEntry, Account, AccountBalance, NetWorthItem, NetWorthEntry } from '@/lib/types';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { DollarSign, Wallet, Landmark, TrendingDown, TrendingUp, BarChart3 } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: 'Last 2 Months', value: '2m' },
  { label: 'Last 3 Months', value: '3m' },
  { label: 'Last 6 Months', value: '6m' },
  { label: 'Year to Date', value: 'ytd' },
  { label: 'All Time', value: 'all' },
] as const;

const GRANULARITIES = ['Weekly', 'Monthly'] as const;

const METRICS = [
  { label: 'Budget vs Actual', value: 'budget_vs_actual' },
  { label: 'Spending by Category', value: 'spending_pie' },
  { label: 'Net Worth Over Time', value: 'net_worth' },
  { label: 'Cash Flow Trend', value: 'cash_flow' },
  { label: 'Account Balances', value: 'account_balances' },
  { label: 'Debt Paydown', value: 'debt_paydown' },
  { label: 'Savings Growth', value: 'savings_growth' },
] as const;

type TimeRange = (typeof TIME_RANGES)[number]['value'];
type Granularity = (typeof GRANULARITIES)[number];
type Metric = (typeof METRICS)[number]['value'];

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

const ACCOUNT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStartDate(range: TimeRange): string {
  const now = new Date();
  switch (range) {
    case '2m': now.setMonth(now.getMonth() - 2); break;
    case '3m': now.setMonth(now.getMonth() - 3); break;
    case '6m': now.setMonth(now.getMonth() - 6); break;
    case 'ytd': return `${now.getFullYear()}-01-01`;
    case 'all': return '2020-01-01';
  }
  return now.toISOString().split('T')[0];
}

function getWeekLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return `${d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`;
}

function getMonthLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
}

function getMondayOfWeek(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().split('T')[0];
}

function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  householdId: string;
  onNavigate: (tab: string) => void;
}

export function FinanceOverview({ householdId, onNavigate }: Props) {
  const supabase = createClient();

  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [budgetEntries, setBudgetEntries] = useState<BudgetDailyEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [nwItems, setNwItems] = useState<NetWorthItem[]>([]);
  const [nwEntries, setNwEntries] = useState<NetWorthEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [timeRange, setTimeRange] = useState<TimeRange>('2m');
  const [granularity, setGranularity] = useState<Granularity>('Weekly');
  const [metric, setMetric] = useState<Metric>('budget_vs_actual');

  const startDate = getStartDate(timeRange);
  const today = getToday();

  const loadData = useCallback(async () => {
    const [catRes, budgetRes, accRes, balRes, nwItemRes, nwEntryRes] = await Promise.all([
      supabase.from('budget_categories').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('budget_daily').select('*').eq('household_id', householdId).gte('date', startDate).lte('date', today).order('date'),
      supabase.from('accounts').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('account_balances').select('*').eq('household_id', householdId).gte('date', startDate).lte('date', today).order('date'),
      supabase.from('net_worth_items').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('net_worth_entries').select('*').eq('household_id', householdId).order('month'),
    ]);

    setCategories(catRes.data ?? []);
    setBudgetEntries(budgetRes.data ?? []);
    setAccounts(accRes.data ?? []);
    setBalances(balRes.data ?? []);
    setNwItems(nwItemRes.data ?? []);
    setNwEntries(nwEntryRes.data ?? []);
    setLoading(false);
  }, [householdId, startDate, today]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived data ──

  const weekStart = getWeekStart(today);
  const weekEnd = (() => { const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + 6); return d.toISOString().split('T')[0]; })();

  const thisWeekSpending = budgetEntries
    .filter((e) => e.date >= weekStart && e.date <= weekEnd)
    .reduce((s, e) => s + Number(e.amount), 0);

  const totalWeeklyBudget = categories.reduce((s, c) => s + c.monthly_amount / 4.333, 0);
  const budgetRemaining = Math.round(totalWeeklyBudget) - thisWeekSpending;

  // Latest balance per account for total liquid cash
  const latestBalanceByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of balances) {
      if (!map[b.account_id] || b.date > (Object.keys(map).find(k => k === b.account_id) ? b.date : '')) {
        map[b.account_id] = Number(b.balance);
      }
    }
    // Actually get the latest by iterating in order (they're sorted by date)
    const latest: Record<string, number> = {};
    for (const b of balances) {
      latest[b.account_id] = Number(b.balance);
    }
    return latest;
  }, [balances]);

  const totalLiquidCash = Object.values(latestBalanceByAccount).reduce((s, v) => s + v, 0);

  // Net worth from latest month
  const latestNetWorth = useMemo(() => {
    if (nwEntries.length === 0) return { assets: 0, liabilities: 0, net: 0 };
    const months = [...new Set(nwEntries.map((e) => e.month))].sort();
    const latestMonth = months[months.length - 1];
    const latest = nwEntries.filter((e) => e.month === latestMonth);
    const assets = latest.filter((e) => nwItems.find((i) => i.id === e.item_id)?.type === 'asset').reduce((s, e) => s + Number(e.value), 0);
    const liabilities = latest.filter((e) => nwItems.find((i) => i.id === e.item_id)?.type === 'liability').reduce((s, e) => s + Number(e.value), 0);
    return { assets, liabilities, net: assets - liabilities };
  }, [nwEntries, nwItems]);

  // Category color map
  const catColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c, i) => { map[c.id] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]; });
    return map;
  }, [categories]);

  // ── Chart data builders ──

  const budgetVsActualData = useMemo(() => {
    const groupKey = granularity === 'Weekly' ? getMondayOfWeek : (d: string) => d.slice(0, 7) + '-01';
    const labelFn = granularity === 'Weekly' ? getWeekLabel : getMonthLabel;
    const divisor = granularity === 'Weekly' ? 4.333 : 1;

    const groups: Record<string, Record<string, number>> = {};
    for (const e of budgetEntries) {
      const key = groupKey(e.date);
      if (!groups[key]) groups[key] = {};
      groups[key][e.category_id] = (groups[key][e.category_id] || 0) + Number(e.amount);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, catTotals]) => {
        const row: Record<string, string | number> = { period: labelFn(key) };
        for (const cat of categories) {
          row[cat.name] = Math.round(catTotals[cat.id] || 0);
          row[cat.name + '_budget'] = Math.round(cat.monthly_amount / divisor);
        }
        return row;
      });
  }, [budgetEntries, categories, granularity]);

  const spendingPieData = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of budgetEntries) {
      totals[e.category_id] = (totals[e.category_id] || 0) + Number(e.amount);
    }
    return categories
      .map((c) => ({ name: c.name, value: Math.round(totals[c.id] || 0), fill: catColorMap[c.id] }))
      .filter((d) => d.value > 0);
  }, [budgetEntries, categories, catColorMap]);

  const netWorthChartData = useMemo(() => {
    const months = [...new Set(nwEntries.map((e) => e.month))].sort();
    return months.map((m) => {
      const monthEntries = nwEntries.filter((e) => e.month === m);
      const assets = monthEntries.filter((e) => nwItems.find((i) => i.id === e.item_id)?.type === 'asset').reduce((s, e) => s + Number(e.value), 0);
      const liabilities = monthEntries.filter((e) => nwItems.find((i) => i.id === e.item_id)?.type === 'liability').reduce((s, e) => s + Number(e.value), 0);
      return { period: getMonthLabel(m), assets, liabilities, netWorth: assets - liabilities };
    });
  }, [nwEntries, nwItems]);

  const cashFlowChartData = useMemo(() => {
    const groupKey = granularity === 'Weekly' ? getMondayOfWeek : (d: string) => d.slice(0, 7) + '-01';
    const labelFn = granularity === 'Weekly' ? getWeekLabel : getMonthLabel;
    const groups: Record<string, Record<string, number>> = {};

    for (const b of balances) {
      const key = groupKey(b.date);
      // Keep the latest balance per account per group
      if (!groups[key]) groups[key] = {};
      groups[key][b.account_id] = Number(b.balance);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, accBals]) => ({
        period: labelFn(key),
        total: Object.values(accBals).reduce((s, v) => s + v, 0),
      }));
  }, [balances, granularity]);

  const accountBalancesData = useMemo(() => {
    const groupKey = granularity === 'Weekly' ? getMondayOfWeek : (d: string) => d.slice(0, 7) + '-01';
    const labelFn = granularity === 'Weekly' ? getWeekLabel : getMonthLabel;
    const groups: Record<string, Record<string, number>> = {};

    for (const b of balances) {
      const key = groupKey(b.date);
      if (!groups[key]) groups[key] = {};
      const accName = accounts.find((a) => a.id === b.account_id)?.name ?? b.account_id;
      groups[key][accName] = Number(b.balance);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, accBals]) => ({ period: labelFn(key), ...accBals }));
  }, [balances, accounts, granularity]);

  const debtPaydownData = useMemo(() => {
    const liabilityItems = nwItems.filter((i) => i.type === 'liability');
    const months = [...new Set(nwEntries.map((e) => e.month))].sort();
    return months.map((m) => {
      const row: Record<string, string | number> = { period: getMonthLabel(m) };
      for (const item of liabilityItems) {
        const entry = nwEntries.find((e) => e.item_id === item.id && e.month === m);
        row[item.name] = entry ? Number(entry.value) : 0;
      }
      return row;
    });
  }, [nwEntries, nwItems]);

  const savingsGrowthData = useMemo(() => {
    const assetItems = nwItems.filter((i) => i.type === 'asset');
    const months = [...new Set(nwEntries.map((e) => e.month))].sort();
    return months.map((m) => {
      const row: Record<string, string | number> = { period: getMonthLabel(m) };
      for (const item of assetItems) {
        const entry = nwEntries.find((e) => e.item_id === item.id && e.month === m);
        row[item.name] = entry ? Number(entry.value) : 0;
      }
      return row;
    });
  }, [nwEntries, nwItems]);

  // Budget vs actual summary for table
  const budgetSummary = useMemo(() => {
    const monthStart = today.slice(0, 7) + '-01';
    const divisor = granularity === 'Weekly' ? 4.333 : 1;
    const rangeStart = granularity === 'Weekly' ? weekStart : monthStart;
    const rangeEnd = granularity === 'Weekly' ? weekEnd : today;
    const periodLabel = granularity === 'Weekly' ? 'This Week' : 'This Month';

    return categories.map((cat) => {
      const spent = budgetEntries
        .filter((e) => e.category_id === cat.id && e.date >= rangeStart && e.date <= rangeEnd)
        .reduce((s, e) => s + Number(e.amount), 0);
      const budget = Math.round(cat.monthly_amount / divisor);
      const variance = budget - spent;
      return { name: cat.name, spent, budget, variance, color: catColorMap[cat.id] };
    });
  }, [categories, budgetEntries, granularity, weekStart, weekEnd, today, catColorMap]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><span className="text-zinc-400">Loading...</span></div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button onClick={() => onNavigate('Budget')} className="text-left">
          <Card className="p-4 hover:border-blue-500/50 transition-colors">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <DollarSign size={16} />
              <span className="text-xs">This Week&apos;s Spending</span>
            </div>
            <p className="text-xl font-bold text-white">{formatCurrency(thisWeekSpending)}</p>
            <p className="text-xs text-zinc-500 mt-1">of {formatCurrency(Math.round(totalWeeklyBudget))} budget</p>
          </Card>
        </button>

        <button onClick={() => onNavigate('Budget')} className="text-left">
          <Card className="p-4 hover:border-blue-500/50 transition-colors">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              {budgetRemaining >= 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
              <span className="text-xs">Budget Remaining</span>
            </div>
            <p className={cn('text-xl font-bold', budgetRemaining >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {formatCurrency(Math.abs(budgetRemaining))}
            </p>
            <p className="text-xs text-zinc-500 mt-1">{budgetRemaining >= 0 ? 'under budget' : 'over budget'}</p>
          </Card>
        </button>

        <button onClick={() => onNavigate('Net Worth')} className="text-left">
          <Card className="p-4 hover:border-blue-500/50 transition-colors">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <Landmark size={16} />
              <span className="text-xs">Net Worth</span>
            </div>
            <p className={cn('text-xl font-bold', latestNetWorth.net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {formatCurrency(latestNetWorth.net)}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {formatCurrency(latestNetWorth.assets)} assets
            </p>
          </Card>
        </button>

        <button onClick={() => onNavigate('Cash Flow')} className="text-left">
          <Card className="p-4 hover:border-blue-500/50 transition-colors">
            <div className="flex items-center gap-2 text-zinc-400 mb-1">
              <Wallet size={16} />
              <span className="text-xs">Total Liquid Cash</span>
            </div>
            <p className="text-xl font-bold text-white">{formatCurrency(totalLiquidCash)}</p>
            <p className="text-xs text-zinc-500 mt-1">{accounts.length} accounts</p>
          </Card>
        </button>
      </div>

      {/* Chart Controls */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-zinc-800">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
          >
            {TIME_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          <div className="flex bg-zinc-800 rounded-lg p-0.5">
            {GRANULARITIES.map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={cn(
                  'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                  granularity === g ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                )}
              >
                {g}
              </button>
            ))}
          </div>

          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white flex-1 min-w-[200px]"
          >
            {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* Chart Area */}
        <div className="p-4">
          <div className="h-80">
            {metric === 'budget_vs_actual' && (
              <BudgetVsActualChart data={budgetVsActualData} categories={categories} colorMap={catColorMap} />
            )}
            {metric === 'spending_pie' && (
              <SpendingPieChart data={spendingPieData} />
            )}
            {metric === 'net_worth' && (
              <NetWorthChart data={netWorthChartData} />
            )}
            {metric === 'cash_flow' && (
              <CashFlowChart data={cashFlowChartData} />
            )}
            {metric === 'account_balances' && (
              <AccountBalancesChart data={accountBalancesData} accounts={accounts} />
            )}
            {metric === 'debt_paydown' && (
              <DebtPaydownChart data={debtPaydownData} items={nwItems.filter((i) => i.type === 'liability')} />
            )}
            {metric === 'savings_growth' && (
              <SavingsGrowthChart data={savingsGrowthData} items={nwItems.filter((i) => i.type === 'asset')} />
            )}
          </div>
        </div>
      </Card>

      {/* Budget Summary Table */}
      {budgetSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 size={18} className="text-blue-400" />
              {granularity === 'Weekly' ? 'This Week' : 'This Month'}: Budget vs Actual
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-400 font-medium py-2 px-3">Category</th>
                  <th className="text-right text-zinc-400 font-medium py-2 px-3">Budget</th>
                  <th className="text-right text-zinc-400 font-medium py-2 px-3">Actual</th>
                  <th className="text-right text-zinc-400 font-medium py-2 px-3">Variance</th>
                  <th className="text-left text-zinc-400 font-medium py-2 px-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {budgetSummary.map((row) => {
                  const pct = row.budget > 0 ? Math.min((row.spent / row.budget) * 100, 100) : 0;
                  const over = row.spent > row.budget;
                  return (
                    <tr key={row.name} className="border-b border-zinc-800/50">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                          <span className="text-white">{row.name}</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 px-3 text-zinc-400">{formatCurrency(row.budget)}</td>
                      <td className={cn('text-right py-2.5 px-3 font-medium', over ? 'text-red-400' : 'text-white')}>
                        {formatCurrency(row.spent)}
                      </td>
                      <td className={cn('text-right py-2.5 px-3 font-medium', row.variance >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {row.variance >= 0 ? '+' : ''}{formatCurrency(row.variance)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', over ? 'bg-red-500' : 'bg-emerald-500')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-medium">
                  <td className="py-2.5 px-3 text-zinc-300">Total</td>
                  <td className="text-right py-2.5 px-3 text-zinc-300">
                    {formatCurrency(budgetSummary.reduce((s, r) => s + r.budget, 0))}
                  </td>
                  <td className={cn('text-right py-2.5 px-3',
                    budgetSummary.reduce((s, r) => s + r.spent, 0) > budgetSummary.reduce((s, r) => s + r.budget, 0) ? 'text-red-400' : 'text-white'
                  )}>
                    {formatCurrency(budgetSummary.reduce((s, r) => s + r.spent, 0))}
                  </td>
                  <td className={cn('text-right py-2.5 px-3',
                    budgetSummary.reduce((s, r) => s + r.variance, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {(() => { const v = budgetSummary.reduce((s, r) => s + r.variance, 0); return `${v >= 0 ? '+' : ''}${formatCurrency(v)}`; })()}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Chart Components ────────────────────────────────────────────────────────

const TOOLTIP_STYLE = { backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' };
const AXIS_STYLE = { fill: '#a1a1aa', fontSize: 11 };

function BudgetVsActualChart({ data, categories, colorMap }: {
  data: Record<string, string | number>[];
  categories: BudgetCategory[];
  colorMap: Record<string, string>;
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v))]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {categories.map((cat) => (
          <Bar key={cat.id} dataKey={cat.name} fill={colorMap[cat.id]} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function SpendingPieChart({ data }: { data: { name: string; value: number; fill: string }[] }) {
  if (data.length === 0) return <EmptyChart />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={110}
          label={({ name, value }) => `${name}: ${((value / total) * 100).toFixed(0)}%`}
        >
          {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v))]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function NetWorthChart({ data }: { data: { period: string; assets: number; liabilities: number; netWorth: number }[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v))]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="assets" name="Assets" stroke="#10b981" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke="#ef4444" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CashFlowChart({ data }: { data: { period: string; total: number }[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v)), 'Total Cash']} />
        <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AccountBalancesChart({ data, accounts }: { data: Record<string, string | number>[]; accounts: Account[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v))]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {accounts.map((acc, i) => (
          <Line key={acc.id} type="monotone" dataKey={acc.name} stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]} strokeWidth={1.5} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function DebtPaydownChart({ data, items }: { data: Record<string, string | number>[]; items: NetWorthItem[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v))]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {items.map((item, i) => (
          <Line key={item.id} type="monotone" dataKey={item.name} stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]} strokeWidth={1.5} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function SavingsGrowthChart({ data, items }: { data: Record<string, string | number>[]; items: NetWorthItem[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v))]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {items.map((item, i) => (
          <Line key={item.id} type="monotone" dataKey={item.name} stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]} strokeWidth={1.5} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
      No data for this time range
    </div>
  );
}
