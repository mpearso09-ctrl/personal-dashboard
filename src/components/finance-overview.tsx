'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getToday, getWeekStart, cn } from '@/lib/utils';
import type {
  BudgetCategory,
  BudgetDailyEntry,
  Account,
  AccountBalance,
  NetWorthItem,
  NetWorthEntry,
  IncomeCategory,
  IncomeDailyEntry,
} from '@/lib/types';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  DollarSign, Wallet, Landmark, TrendingDown, TrendingUp,
  BarChart3, ArrowUpRight, ArrowDownRight, Receipt, PiggyBank,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: 'Last 2 Months', value: '2m' },
  { label: 'Last 3 Months', value: '3m' },
  { label: 'Last 6 Months', value: '6m' },
  { label: 'Year to Date', value: 'ytd' },
  { label: 'All Time', value: 'all' },
] as const;

const GRANULARITIES = ['Monthly', 'Weekly'] as const;

const CHART_VIEWS = [
  { label: 'Income vs Spending', value: 'income_vs_spending' },
  { label: 'Spending by Category', value: 'spending_pie' },
  { label: 'Net Worth Over Time', value: 'net_worth' },
  { label: 'Cash Flow Trend', value: 'cash_flow' },
  { label: 'Individual Account Balances', value: 'account_balances' },
  { label: 'Debt Paydown', value: 'debt_paydown' },
  { label: 'Savings Growth', value: 'savings_growth' },
] as const;

type TimeRange = (typeof TIME_RANGES)[number]['value'];
type Granularity = (typeof GRANULARITIES)[number];
type ChartView = (typeof CHART_VIEWS)[number]['value'];

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
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
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

function getMonthStart(): string {
  const today = getToday();
  return today.slice(0, 7) + '-01';
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FinanceOverview({ householdId }: { householdId: string }) {
  const supabase = createClient();

  // State
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [budgetEntries, setBudgetEntries] = useState<BudgetDailyEntry[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<IncomeCategory[]>([]);
  const [incomeEntries, setIncomeEntries] = useState<IncomeDailyEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [allBalances, setAllBalances] = useState<AccountBalance[]>([]);
  const [nwItems, setNwItems] = useState<NetWorthItem[]>([]);
  const [nwEntries, setNwEntries] = useState<NetWorthEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [timeRange, setTimeRange] = useState<TimeRange>('2m');
  const [granularity, setGranularity] = useState<Granularity>('Monthly');
  const [chartView, setChartView] = useState<ChartView>('income_vs_spending');

  const startDate = getStartDate(timeRange);
  const today = getToday();
  const monthStart = getMonthStart();
  const yesterday = getYesterday();

  const loadData = useCallback(async () => {
    const [
      catRes, budgetRes, incCatRes, incRes,
      accRes, balRes, allBalRes, nwItemRes, nwEntryRes,
    ] = await Promise.all([
      supabase.from('budget_categories').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('budget_daily').select('*').eq('household_id', householdId).order('date'),
      supabase.from('income_categories').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('income_daily').select('*').eq('household_id', householdId).order('date'),
      supabase.from('accounts').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('account_balances').select('*').eq('household_id', householdId).gte('date', startDate).lte('date', today).order('date'),
      supabase.from('account_balances').select('*').eq('household_id', householdId).order('date'),
      supabase.from('net_worth_items').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('net_worth_entries').select('*').eq('household_id', householdId).order('month'),
    ]);

    setCategories(catRes.data ?? []);
    setBudgetEntries(budgetRes.data ?? []);
    setIncomeCategories(incCatRes.data ?? []);
    setIncomeEntries(incRes.data ?? []);
    setAccounts(accRes.data ?? []);
    setBalances(balRes.data ?? []);
    setAllBalances(allBalRes.data ?? []);
    setNwItems(nwItemRes.data ?? []);
    setNwEntries(nwEntryRes.data ?? []);
    setLoading(false);
  }, [householdId, startDate, today]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived: Summary Card Values ──

  const monthlySpending = useMemo(() => {
    return budgetEntries
      .filter((e) => e.date >= monthStart && e.date <= today)
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [budgetEntries, monthStart, today]);

  const monthlyBudget = useMemo(() => {
    return categories.reduce((s, c) => s + c.monthly_amount, 0);
  }, [categories]);

  const budgetVariance = monthlyBudget - monthlySpending;

  const monthlyIncome = useMemo(() => {
    return incomeEntries
      .filter((e) => e.date >= monthStart && e.date <= today)
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [incomeEntries, monthStart, today]);

  const surplusDeficit = monthlyIncome - monthlySpending;

  const latestNetWorth = useMemo(() => {
    if (nwEntries.length === 0) return { assets: 0, liabilities: 0, net: 0 };
    const months = [...new Set(nwEntries.map((e) => e.month))].sort();
    const latestMonth = months[months.length - 1];
    const latest = nwEntries.filter((e) => e.month === latestMonth);
    const assets = latest
      .filter((e) => nwItems.find((i) => i.id === e.item_id)?.type === 'asset')
      .reduce((s, e) => s + Number(e.value), 0);
    const liabilities = latest
      .filter((e) => nwItems.find((i) => i.id === e.item_id)?.type === 'liability')
      .reduce((s, e) => s + Number(e.value), 0);
    return { assets, liabilities, net: assets - liabilities };
  }, [nwEntries, nwItems]);

  // Latest balance per account (from ALL balances, not time-filtered)
  const latestBalanceByAccount = useMemo(() => {
    const latest: Record<string, { balance: number; date: string }> = {};
    for (const b of allBalances) {
      if (!latest[b.account_id] || b.date >= latest[b.account_id].date) {
        latest[b.account_id] = { balance: Number(b.balance), date: b.date };
      }
    }
    return latest;
  }, [allBalances]);

  const totalCash = useMemo(() => {
    return Object.values(latestBalanceByAccount).reduce((s, v) => s + v.balance, 0);
  }, [latestBalanceByAccount]);

  // Yesterday's balance per account for daily change
  const yesterdayBalanceByAccount = useMemo(() => {
    const yBal: Record<string, number> = {};
    for (const b of allBalances) {
      if (b.date <= yesterday) {
        yBal[b.account_id] = Number(b.balance);
      }
    }
    return yBal;
  }, [allBalances, yesterday]);

  // Account balances list for display
  const accountBalancesList = useMemo(() => {
    return accounts.map((acc) => {
      const latest = latestBalanceByAccount[acc.id];
      const balance = latest?.balance ?? 0;
      const yBal = yesterdayBalanceByAccount[acc.id];
      const dailyChange = yBal !== undefined ? balance - yBal : null;
      return { id: acc.id, name: acc.name, balance, dailyChange };
    });
  }, [accounts, latestBalanceByAccount, yesterdayBalanceByAccount]);

  // Category color map
  const catColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c, i) => { map[c.id] = CATEGORY_COLORS[i % CATEGORY_COLORS.length]; });
    return map;
  }, [categories]);

  // ── Chart Data Builders ──

  const incomeVsSpendingData = useMemo(() => {
    const groupKey = granularity === 'Weekly' ? getMondayOfWeek : (d: string) => d.slice(0, 7) + '-01';
    const labelFn = granularity === 'Weekly' ? getWeekLabel : getMonthLabel;

    const spendGroups: Record<string, number> = {};
    for (const e of budgetEntries.filter((e) => e.date >= startDate && e.date <= today)) {
      const key = groupKey(e.date);
      spendGroups[key] = (spendGroups[key] || 0) + Number(e.amount);
    }

    const incomeGroups: Record<string, number> = {};
    for (const e of incomeEntries.filter((e) => e.date >= startDate && e.date <= today)) {
      const key = groupKey(e.date);
      incomeGroups[key] = (incomeGroups[key] || 0) + Number(e.amount);
    }

    const allKeys = [...new Set([...Object.keys(spendGroups), ...Object.keys(incomeGroups)])].sort();
    return allKeys.map((key) => ({
      period: labelFn(key),
      Income: Math.round(incomeGroups[key] || 0),
      Spending: Math.round(spendGroups[key] || 0),
    }));
  }, [budgetEntries, incomeEntries, granularity, startDate, today]);

  const spendingPieData = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of budgetEntries.filter((e) => e.date >= startDate && e.date <= today)) {
      totals[e.category_id] = (totals[e.category_id] || 0) + Number(e.amount);
    }
    return categories
      .map((c) => ({ name: c.name, value: Math.round(totals[c.id] || 0), fill: catColorMap[c.id] }))
      .filter((d) => d.value > 0);
  }, [budgetEntries, categories, catColorMap, startDate, today]);

  const netWorthChartData = useMemo(() => {
    const months = [...new Set(nwEntries.map((e) => e.month))].sort();
    return months.map((m) => {
      const monthEntries = nwEntries.filter((e) => e.month === m);
      const assets = monthEntries
        .filter((e) => nwItems.find((i) => i.id === e.item_id)?.type === 'asset')
        .reduce((s, e) => s + Number(e.value), 0);
      const liabilities = monthEntries
        .filter((e) => nwItems.find((i) => i.id === e.item_id)?.type === 'liability')
        .reduce((s, e) => s + Number(e.value), 0);
      return { period: getMonthLabel(m), assets, liabilities, netWorth: assets - liabilities };
    });
  }, [nwEntries, nwItems]);

  const cashFlowChartData = useMemo(() => {
    const groupKey = granularity === 'Weekly' ? getMondayOfWeek : (d: string) => d.slice(0, 7) + '-01';
    const labelFn = granularity === 'Weekly' ? getWeekLabel : getMonthLabel;
    const groups: Record<string, Record<string, number>> = {};

    for (const b of balances) {
      const key = groupKey(b.date);
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

  const accountBalancesChartData = useMemo(() => {
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
    // Filter to savings/investment type accounts from account_balances
    const savingsKeywords = ['saving', 'invest', 'trade', 'crypto', 'kraken'];
    const savingsAccounts = accounts.filter((a) =>
      savingsKeywords.some((kw) => a.name.toLowerCase().includes(kw))
    );

    if (savingsAccounts.length === 0) {
      // Fallback to asset net worth items
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
    }

    const groupKey = granularity === 'Weekly' ? getMondayOfWeek : (d: string) => d.slice(0, 7) + '-01';
    const labelFn = granularity === 'Weekly' ? getWeekLabel : getMonthLabel;
    const groups: Record<string, Record<string, number>> = {};

    for (const b of balances) {
      const acc = savingsAccounts.find((a) => a.id === b.account_id);
      if (!acc) continue;
      const key = groupKey(b.date);
      if (!groups[key]) groups[key] = {};
      groups[key][acc.name] = Number(b.balance);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, accBals]) => ({ period: labelFn(key), ...accBals }));
  }, [balances, accounts, nwItems, nwEntries, granularity]);

  // Budget vs actual summary table
  const budgetSummary = useMemo(() => {
    return categories.map((cat) => {
      const spent = budgetEntries
        .filter((e) => e.category_id === cat.id && e.date >= monthStart && e.date <= today)
        .reduce((s, e) => s + Number(e.amount), 0);
      const budget = cat.monthly_amount;
      const variance = budget - spent;
      const pctUsed = budget > 0 ? (spent / budget) * 100 : 0;
      return { name: cat.name, spent, budget, variance, pctUsed, color: catColorMap[cat.id] };
    });
  }, [categories, budgetEntries, monthStart, today, catColorMap]);

  // Savings accounts for chart
  const savingsAccountNames = useMemo(() => {
    const savingsKeywords = ['saving', 'invest', 'trade', 'crypto', 'kraken'];
    return accounts.filter((a) =>
      savingsKeywords.some((kw) => a.name.toLowerCase().includes(kw))
    );
  }, [accounts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-zinc-400">Loading overview...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          icon={<Receipt size={16} />}
          label="Monthly Spending"
          value={formatCurrency(monthlySpending)}
          valueColor="text-white"
          subtitle={`${new Date(monthStart + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long' })}`}
        />
        <SummaryCard
          icon={<DollarSign size={16} />}
          label="Monthly Budget"
          value={formatCurrency(monthlyBudget)}
          valueColor="text-white"
          subtitle={
            budgetVariance >= 0
              ? `${formatCurrency(budgetVariance)} remaining`
              : `${formatCurrency(Math.abs(budgetVariance))} over budget`
          }
          subtitleColor={budgetVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <SummaryCard
          icon={<TrendingUp size={16} />}
          label="Monthly Income"
          value={formatCurrency(monthlyIncome)}
          valueColor="text-white"
          subtitle={`${new Date(monthStart + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long' })}`}
        />
        <SummaryCard
          icon={surplusDeficit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          label="Surplus / Deficit"
          value={formatCurrency(Math.abs(surplusDeficit))}
          valueColor={surplusDeficit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          subtitle={surplusDeficit >= 0 ? 'surplus this month' : 'deficit this month'}
        />
        <SummaryCard
          icon={<Landmark size={16} />}
          label="Net Worth"
          value={formatCurrency(latestNetWorth.net)}
          valueColor={latestNetWorth.net >= 0 ? 'text-emerald-400' : 'text-red-400'}
          subtitle={`${formatCurrency(latestNetWorth.assets)} assets`}
        />
        <SummaryCard
          icon={<Wallet size={16} />}
          label="Total Cash"
          value={formatCurrency(totalCash)}
          valueColor="text-white"
          subtitle={`${accounts.length} accounts`}
        />
      </div>

      {/* ── Account Balances Section ── */}
      {accountBalancesList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <Wallet size={18} className="text-blue-400" />
                Account Balances
              </div>
              <span className="text-lg font-bold text-white">{formatCurrency(totalCash)}</span>
            </CardTitle>
          </CardHeader>
          <div className="space-y-1">
            {accountBalancesList.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                <span className="text-sm text-white">{acc.name}</span>
                <div className="flex items-center gap-3">
                  {acc.dailyChange !== null && acc.dailyChange !== 0 && (
                    <span
                      className={cn(
                        'flex items-center gap-0.5 text-xs font-medium',
                        acc.dailyChange > 0 ? 'text-emerald-400' : 'text-red-400'
                      )}
                    >
                      {acc.dailyChange > 0 ? (
                        <ArrowUpRight size={12} />
                      ) : (
                        <ArrowDownRight size={12} />
                      )}
                      {formatCurrency(Math.abs(acc.dailyChange))}
                    </span>
                  )}
                  <span className="text-sm font-medium text-zinc-300 tabular-nums w-28 text-right">
                    {formatCurrency(acc.balance)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Charts Section ── */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-zinc-800">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
          >
            {TIME_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
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
            value={chartView}
            onChange={(e) => setChartView(e.target.value as ChartView)}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white flex-1 min-w-[200px]"
          >
            {CHART_VIEWS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="p-4">
          <div className="h-80">
            {chartView === 'income_vs_spending' && (
              <IncomeVsSpendingChart data={incomeVsSpendingData} />
            )}
            {chartView === 'spending_pie' && (
              <SpendingPieChart data={spendingPieData} />
            )}
            {chartView === 'net_worth' && (
              <NetWorthChart data={netWorthChartData} />
            )}
            {chartView === 'cash_flow' && (
              <CashFlowChart data={cashFlowChartData} />
            )}
            {chartView === 'account_balances' && (
              <AccountBalancesChart data={accountBalancesChartData} accounts={accounts} />
            )}
            {chartView === 'debt_paydown' && (
              <DebtPaydownChart data={debtPaydownData} items={nwItems.filter((i) => i.type === 'liability')} />
            )}
            {chartView === 'savings_growth' && (
              <SavingsGrowthChart
                data={savingsGrowthData}
                accounts={savingsAccountNames}
                items={nwItems.filter((i) => i.type === 'asset')}
              />
            )}
          </div>
        </div>
      </Card>

      {/* ── Budget vs Actual Table ── */}
      {budgetSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 size={18} className="text-blue-400" />
              Budget vs Actual (This Month)
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-400 font-medium py-2 px-3">Category</th>
                  <th className="text-right text-zinc-400 font-medium py-2 px-3">Monthly Budget</th>
                  <th className="text-right text-zinc-400 font-medium py-2 px-3">MTD Actual</th>
                  <th className="text-right text-zinc-400 font-medium py-2 px-3">Variance</th>
                  <th className="text-right text-zinc-400 font-medium py-2 px-3">% Used</th>
                  <th className="text-left text-zinc-400 font-medium py-2 px-3 w-36"></th>
                </tr>
              </thead>
              <tbody>
                {budgetSummary.map((row) => {
                  const barPct = Math.min(row.pctUsed, 100);
                  const over = row.pctUsed > 100;
                  const nearLimit = row.pctUsed >= 90 && row.pctUsed <= 100;
                  const barColor = over ? 'bg-red-500' : nearLimit ? 'bg-amber-500' : 'bg-emerald-500';
                  const pctColor = over ? 'text-red-400' : nearLimit ? 'text-amber-400' : 'text-emerald-400';

                  return (
                    <tr key={row.name} className="border-b border-zinc-800/50">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                          <span className="text-white">{row.name}</span>
                        </div>
                      </td>
                      <td className="text-right py-2.5 px-3 text-zinc-400 tabular-nums">
                        {formatCurrency(row.budget)}
                      </td>
                      <td className={cn('text-right py-2.5 px-3 font-medium tabular-nums', over ? 'text-red-400' : 'text-white')}>
                        {formatCurrency(row.spent)}
                      </td>
                      <td className={cn('text-right py-2.5 px-3 font-medium tabular-nums', row.variance >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {row.variance >= 0 ? '+' : ''}{formatCurrency(row.variance)}
                      </td>
                      <td className={cn('text-right py-2.5 px-3 font-medium tabular-nums', pctColor)}>
                        {Math.round(row.pctUsed)}%
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', barColor)}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-medium">
                  <td className="py-2.5 px-3 text-zinc-300">Total</td>
                  <td className="text-right py-2.5 px-3 text-zinc-300 tabular-nums">
                    {formatCurrency(budgetSummary.reduce((s, r) => s + r.budget, 0))}
                  </td>
                  <td className={cn(
                    'text-right py-2.5 px-3 tabular-nums',
                    budgetSummary.reduce((s, r) => s + r.spent, 0) > budgetSummary.reduce((s, r) => s + r.budget, 0)
                      ? 'text-red-400'
                      : 'text-white'
                  )}>
                    {formatCurrency(budgetSummary.reduce((s, r) => s + r.spent, 0))}
                  </td>
                  <td className={cn(
                    'text-right py-2.5 px-3 tabular-nums',
                    budgetSummary.reduce((s, r) => s + r.variance, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {(() => {
                      const v = budgetSummary.reduce((s, r) => s + r.variance, 0);
                      return `${v >= 0 ? '+' : ''}${formatCurrency(v)}`;
                    })()}
                  </td>
                  <td className="text-right py-2.5 px-3 text-zinc-300 tabular-nums">
                    {(() => {
                      const totalBudget = budgetSummary.reduce((s, r) => s + r.budget, 0);
                      const totalSpent = budgetSummary.reduce((s, r) => s + r.spent, 0);
                      return totalBudget > 0 ? `${Math.round((totalSpent / totalBudget) * 100)}%` : '0%';
                    })()}
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

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  valueColor = 'text-white',
  subtitle,
  subtitleColor = 'text-zinc-500',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  subtitle: string;
  subtitleColor?: string;
}) {
  return (
    <button className="text-left w-full">
      <Card className="p-4 hover:border-blue-500/50 transition-colors cursor-pointer">
        <div className="flex items-center gap-2 text-zinc-400 mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className={cn('text-xl font-bold', valueColor)}>{value}</p>
        <p className={cn('text-xs mt-1', subtitleColor)}>{subtitle}</p>
      </Card>
    </button>
  );
}

// ─── Chart Components ───────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '8px',
  color: '#fff',
};
const AXIS_STYLE = { fill: '#a1a1aa', fontSize: 11 };

function IncomeVsSpendingChart({ data }: { data: { period: string; Income: number; Spending: number }[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v))]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Income" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Spending" fill="#ef4444" radius={[3, 3, 0, 0]} />
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
          <Line
            key={acc.id}
            type="monotone"
            dataKey={acc.name}
            stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
          />
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
          <Line
            key={item.id}
            type="monotone"
            dataKey={item.name}
            stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function SavingsGrowthChart({
  data,
  accounts,
  items,
}: {
  data: Record<string, string | number>[];
  accounts: Account[];
  items: NetWorthItem[];
}) {
  if (data.length === 0) return <EmptyChart />;
  // Use account names if available, otherwise net worth item names
  const lineNames = accounts.length > 0
    ? accounts.map((a) => a.name)
    : items.map((i) => i.name);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(Number(v))]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lineNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
          />
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
