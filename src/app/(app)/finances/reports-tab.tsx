'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, cn, getToday } from '@/lib/utils';
import type { MonthlyReport, ReportData, ReportRecipient, ReportMonthlyTrend } from '@/lib/types';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import {
  FileText, Send, Settings, Plus, Trash2, Check, X,
  Loader2, RefreshCw, Printer, ChevronLeft, TrendingUp,
  TrendingDown, Minus, Mail, AlertCircle,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonthEnd(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
}

function getPrevMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getLastNMonths(n: number, fromMonth: string): string[] {
  const months: string[] = [];
  let cur = fromMonth;
  for (let i = 0; i < n; i++) {
    months.unshift(cur);
    cur = getPrevMonthStr(cur);
  }
  return months;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
}

function monthLabelFull(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

// ── Report Generation ─────────────────────────────────────────────────────────

async function generateReportData(
  supabase: ReturnType<typeof createClient>,
  householdId: string,
  month: string, // "YYYY-MM"
  isPartial: boolean
): Promise<ReportData> {
  const today = getToday();
  const monthStart = month + '-01';
  const monthEnd = getMonthEnd(monthStart);
  const effectiveEnd = isPartial ? (today < monthEnd ? today : monthEnd) : monthEnd;
  const prevMonth = getPrevMonthStr(month);
  const prevMonthStart = prevMonth + '-01';
  const prevMonthEnd = getMonthEnd(prevMonthStart);

  // Parallel fetch core data
  const [
    { data: incomeEntries },
    { data: incomeCategories },
    { data: budgetEntries },
    { data: budgetCategories },
    { data: nwItems },
    { data: nwCurr },
    { data: nwPrev },
    { data: accounts },
    { data: balancesCurr },
    { data: balancesPrev },
  ] = await Promise.all([
    supabase.from('income_daily').select('*').eq('household_id', householdId).gte('date', monthStart).lte('date', effectiveEnd),
    supabase.from('income_categories').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('budget_daily').select('*').eq('household_id', householdId).gte('date', monthStart).lte('date', effectiveEnd),
    supabase.from('budget_categories').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('net_worth_items').select('*').eq('household_id', householdId),
    supabase.from('net_worth_entries').select('*').eq('household_id', householdId).eq('month', monthStart),
    supabase.from('net_worth_entries').select('*').eq('household_id', householdId).eq('month', prevMonthStart),
    supabase.from('accounts').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('account_balances').select('*').eq('household_id', householdId).gte('date', monthStart).lte('date', effectiveEnd).order('date', { ascending: false }),
    supabase.from('account_balances').select('*').eq('household_id', householdId).gte('date', prevMonthStart).lte('date', prevMonthEnd).order('date', { ascending: false }),
  ]);

  // Income totals
  const incomeTotal = (incomeEntries ?? []).reduce((s, e) => s + e.amount, 0);
  const incomeBreakdown = (incomeCategories ?? []).map((c) => ({
    name: c.name,
    amount: (incomeEntries ?? []).filter((e) => e.category_id === c.id).reduce((s, e) => s + e.amount, 0),
  })).filter((b) => b.amount > 0);

  // Spending totals
  const spendingTotal = (budgetEntries ?? []).reduce((s, e) => s + e.amount, 0);
  const FREQ_MULT: Record<string, number> = { monthly: 1, weekly: 4.333, biweekly: 2.167, annual: 1 / 12 };
  const spendingBreakdown = (budgetCategories ?? [])
    .map((c) => {
      const budgeted = Math.round(c.monthly_amount * (FREQ_MULT[c.frequency ?? 'monthly'] ?? 1));
      const actual = Math.round((budgetEntries ?? []).filter((e) => e.category_id === c.id).reduce((s, e) => s + e.amount, 0));
      return { name: c.name, budgeted, actual, variance: budgeted - actual };
    })
    .sort((a, b) => a.variance - b.variance); // worst overspend first

  // Net worth
  const nwEntryMap = (entries: { item_id: string; value: number }[]) => {
    const m: Record<string, number> = {};
    for (const e of (entries ?? [])) m[e.item_id] = e.value;
    return m;
  };
  const currMap = nwEntryMap(nwCurr ?? []);
  const prevMap = nwEntryMap(nwPrev ?? []);

  const assets = (nwItems ?? []).filter((i) => i.type === 'asset').map((i) => ({
    name: i.name,
    prev: prevMap[i.id] ?? 0,
    current: currMap[i.id] ?? 0,
    change: (currMap[i.id] ?? 0) - (prevMap[i.id] ?? 0),
  }));
  const liabilities = (nwItems ?? []).filter((i) => i.type === 'liability').map((i) => ({
    name: i.name,
    prev: prevMap[i.id] ?? 0,
    current: currMap[i.id] ?? 0,
    change: (currMap[i.id] ?? 0) - (prevMap[i.id] ?? 0),
  }));

  const totalAssets = assets.reduce((s, a) => s + a.current, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.current, 0);
  const netWorthCurrent = totalAssets - totalLiabilities;
  const prevTotalAssets = assets.reduce((s, a) => s + a.prev, 0);
  const prevTotalLiab = liabilities.reduce((s, l) => s + l.prev, 0);
  const netWorthPrevMonth = prevTotalAssets - prevTotalLiab;
  const netWorthChange = netWorthCurrent - netWorthPrevMonth;

  // Cash accounts — latest balance per account within month
  const latestBalanceForAccount = (balances: { account_id: string; balance: number }[], acctId: string) =>
    (balances ?? []).find((b) => b.account_id === acctId)?.balance ?? 0;

  const cashAccounts = (accounts ?? []).map((a) => ({
    name: a.name,
    balance: latestBalanceForAccount(balancesCurr ?? [], a.id),
    prevBalance: latestBalanceForAccount(balancesPrev ?? [], a.id),
  }));

  // 6-month trends
  const trendMonths = getLastNMonths(6, month);
  const trendStart = trendMonths[0] + '-01';
  const trendEnd = monthEnd;

  const [
    { data: trendIncome },
    { data: trendBudget },
    { data: trendNW },
    { data: trendBalances },
  ] = await Promise.all([
    supabase.from('income_daily').select('date,amount,category_id').eq('household_id', householdId).gte('date', trendStart).lte('date', trendEnd),
    supabase.from('budget_daily').select('date,amount,category_id').eq('household_id', householdId).gte('date', trendStart).lte('date', trendEnd),
    supabase.from('net_worth_entries').select('item_id,value,month').eq('household_id', householdId).gte('month', trendStart).lte('month', trendEnd),
    supabase.from('account_balances').select('account_id,balance,date').eq('household_id', householdId).gte('date', trendStart).lte('date', trendEnd).order('date', { ascending: false }),
  ]);

  const monthlyTrends: ReportMonthlyTrend[] = trendMonths.map((m) => {
    const mStart = m + '-01';
    const mEnd = getMonthEnd(mStart);
    const income = (trendIncome ?? []).filter((e) => e.date >= mStart && e.date <= mEnd).reduce((s, e) => s + e.amount, 0);
    const spending = (trendBudget ?? []).filter((e) => e.date >= mStart && e.date <= mEnd).reduce((s, e) => s + e.amount, 0);

    // Net worth for this month
    const mnwMap: Record<string, number> = {};
    for (const e of (trendNW ?? []).filter((e) => e.month === mStart)) mnwMap[e.item_id] = e.value;
    const mAssets = (nwItems ?? []).filter((i) => i.type === 'asset').reduce((s, i) => s + (mnwMap[i.id] ?? 0), 0);
    const mLiab = (nwItems ?? []).filter((i) => i.type === 'liability').reduce((s, i) => s + (mnwMap[i.id] ?? 0), 0);
    const nw = mAssets - mLiab;

    // Total debt
    const totalDebt = mLiab;

    // Total cash: latest balance per account up to mEnd
    const cashMap: Record<string, number> = {};
    for (const b of (trendBalances ?? []).filter((b) => b.date >= mStart && b.date <= mEnd)) {
      if (!(b.account_id in cashMap)) cashMap[b.account_id] = b.balance;
    }
    const totalCash = Object.values(cashMap).reduce((s, v) => s + v, 0);

    // Spending by category
    const spendingByCategory = (budgetCategories ?? []).map((c) => ({
      name: c.name,
      amount: (trendBudget ?? []).filter((e) => e.category_id === c.id && e.date >= mStart && e.date <= mEnd).reduce((s, e) => s + e.amount, 0),
    })).filter((b) => b.amount > 0);

    return {
      month: m,
      label: monthLabel(m),
      income,
      spending,
      netIncome: income - spending,
      netWorth: nw || 0,
      totalDebt,
      totalCash,
      spendingByCategory,
    };
  });

  return {
    month,
    generatedAt: new Date().toISOString(),
    isPartial,
    incomeTotal: Math.round(incomeTotal),
    spendingTotal: Math.round(spendingTotal),
    netIncome: Math.round(incomeTotal - spendingTotal),
    netWorthCurrent: Math.round(netWorthCurrent),
    netWorthPrevMonth: Math.round(netWorthPrevMonth),
    netWorthChange: Math.round(netWorthChange),
    incomeBreakdown,
    spendingBreakdown,
    assets,
    liabilities,
    cashAccounts,
    monthlyTrends,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', color: '#fff', fontSize: 12 },
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

function StatBig({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      <div className={cn('text-3xl font-bold', color ?? 'text-white')}>{value}</div>
      {sub && <div className="text-xs text-zinc-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4">{children}</div>;
}

function TrendArrow({ val }: { val: number }) {
  if (val > 0) return <TrendingUp className="w-4 h-4 text-emerald-400 inline" />;
  if (val < 0) return <TrendingDown className="w-4 h-4 text-red-400 inline" />;
  return <Minus className="w-4 h-4 text-zinc-500 inline" />;
}

// ── Report View ───────────────────────────────────────────────────────────────

function ReportView({ report, onBack }: { report: MonthlyReport; onBack: () => void }) {
  const d = report.report_data;
  const netPositive = d.netIncome >= 0;
  const nwPositive = d.netWorthChange >= 0;

  const verdict = (() => {
    if (netPositive && nwPositive)
      return `You earned more than you spent and grew net worth by ${formatCurrency(Math.abs(d.netWorthChange))}.`;
    if (!netPositive && nwPositive)
      return `Spending exceeded income by ${formatCurrency(Math.abs(d.netIncome))}, but net worth still grew by ${formatCurrency(Math.abs(d.netWorthChange))}.`;
    if (netPositive && !nwPositive)
      return `Positive cash flow of ${formatCurrency(d.netIncome)}, but net worth declined by ${formatCurrency(Math.abs(d.netWorthChange))}.`;
    return `Spending exceeded income by ${formatCurrency(Math.abs(d.netIncome))} and net worth declined by ${formatCurrency(Math.abs(d.netWorthChange))}.`;
  })();

  const underBudgetCount = d.spendingBreakdown.filter((b) => b.variance >= 0).length;
  const totalCash = d.cashAccounts.reduce((s, a) => s + a.balance, 0);
  const prevTotalCash = d.cashAccounts.reduce((s, a) => s + a.prevBalance, 0);

  const incomeVsSpendData = [
    { name: 'Income', value: d.incomeTotal, fill: '#10b981' },
    { name: 'Spending', value: d.spendingTotal, fill: '#ef4444' },
  ];

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Back + actions */}
      <div className="flex items-center gap-3 print:hidden">
        <button onClick={onBack} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="text-xs text-zinc-400">Pearson Household Financial Report</div>
          <h2 className="text-xl font-bold text-white">
            {monthLabelFull(d.month)}
            {d.isPartial && <span className="ml-2 text-sm text-zinc-400 font-normal">(Mid-Month)</span>}
          </h2>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 min-h-[44px]"
        >
          <Printer className="w-4 h-4" /> Print / PDF
        </button>
      </div>

      {/* Print header (only shows when printing) */}
      <div className="hidden print:block mb-6">
        <div className="text-sm text-zinc-400">Pearson Household Financial Report</div>
        <h1 className="text-2xl font-bold">{monthLabelFull(d.month)}{d.isPartial ? ' (Mid-Month)' : ''}</h1>
        <div className="text-xs text-zinc-500">Generated {new Date(d.generatedAt).toLocaleDateString()}</div>
      </div>

      {/* Section 1: Bottom Line */}
      <Card>
        <SectionTitle>The Bottom Line</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
          <StatBig
            label="Net Income"
            value={(netPositive ? '+' : '') + formatCurrency(d.netIncome)}
            color={netPositive ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatBig
            label="Net Worth"
            value={formatCurrency(d.netWorthCurrent)}
            sub={`${nwPositive ? '▲' : '▼'} ${formatCurrency(Math.abs(d.netWorthChange))} vs last month`}
            color="text-white"
          />
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xs text-zinc-400 mb-1">Money In / Out</div>
            <div className="text-lg font-semibold text-emerald-400">{formatCurrency(d.incomeTotal)}</div>
            <div className="text-lg font-semibold text-red-400">{formatCurrency(d.spendingTotal)}</div>
          </div>
        </div>
        <div className="bg-zinc-800 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed">
          {verdict}
        </div>
      </Card>

      {/* Section 2: Income vs Spending */}
      <Card>
        <SectionTitle>Income vs Spending</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {/* Bar chart */}
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeVsSpendData} barCategoryGap="30%">
                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), '']} />
                <Bar dataKey="value" fill="#8884d8" radius={[6, 6, 0, 0]}>
                  {incomeVsSpendData.map((e, i) => (
                    <rect key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Last 3 months comparison */}
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.monthlyTrends.slice(-3)} barCategoryGap="25%">
                <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), '']} />
                <Bar dataKey="income" name="Income" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="spending" name="Spending" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Income breakdown */}
        <div className="mb-4">
          <div className="text-xs font-medium text-zinc-400 mb-2">Income Sources</div>
          <div className="space-y-1.5">
            {d.incomeBreakdown.map((b, i) => {
              const pct = d.incomeTotal > 0 ? (b.amount / d.incomeTotal) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-300 w-36 shrink-0 truncate">{b.name}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-emerald-400 w-24 text-right shrink-0">{formatCurrency(b.amount)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 3 spending categories */}
        <div>
          <div className="text-xs font-medium text-zinc-400 mb-2">Spending Breakdown</div>
          <div className="space-y-1.5">
            {[...d.spendingBreakdown].sort((a, b) => b.actual - a.actual).map((b, i) => {
              const pct = d.spendingTotal > 0 ? (b.actual / d.spendingTotal) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-300 w-36 shrink-0 truncate">{b.name}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2">
                    <div className="h-2 rounded-full bg-red-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-red-400 w-24 text-right shrink-0">{formatCurrency(b.actual)}</span>
                  <span className="text-xs text-zinc-500 w-10 text-right shrink-0">{Math.round(pct)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Section 3: Budget Performance */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Budget Performance</SectionTitle>
          <span className="text-xs text-zinc-400">
            Under budget in <span className="text-emerald-400 font-semibold">{underBudgetCount}</span>/{d.spendingBreakdown.length} categories
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                <th className="text-left py-2 pr-4 font-medium">Category</th>
                <th className="text-right py-2 px-2 font-medium">Budgeted</th>
                <th className="text-right py-2 px-2 font-medium">Actual</th>
                <th className="text-right py-2 pl-2 font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {d.spendingBreakdown.map((b, i) => {
                const over = b.variance < 0;
                const close = b.variance >= 0 && b.variance < b.budgeted * 0.1;
                const icon = over ? '✗' : close ? '⚠' : '✓';
                const varColor = over ? 'text-red-400' : close ? 'text-amber-400' : 'text-emerald-400';
                return (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="py-2.5 pr-4 text-zinc-200">{b.name}</td>
                    <td className="py-2.5 px-2 text-right text-zinc-400">{formatCurrency(b.budgeted)}</td>
                    <td className="py-2.5 px-2 text-right text-zinc-200">{formatCurrency(b.actual)}</td>
                    <td className={cn('py-2.5 pl-2 text-right font-semibold', varColor)}>
                      {b.variance >= 0 ? '+' : ''}{formatCurrency(b.variance)} {icon}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-zinc-700">
                <td className="py-2.5 pr-4 font-semibold text-white">Total</td>
                <td className="py-2.5 px-2 text-right font-semibold text-zinc-300">
                  {formatCurrency(d.spendingBreakdown.reduce((s, b) => s + b.budgeted, 0))}
                </td>
                <td className="py-2.5 px-2 text-right font-semibold text-zinc-200">{formatCurrency(d.spendingTotal)}</td>
                <td className={cn('py-2.5 pl-2 text-right font-bold',
                  d.spendingBreakdown.reduce((s, b) => s + b.variance, 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {(() => { const v = d.spendingBreakdown.reduce((s, b) => s + b.variance, 0); return (v >= 0 ? '+' : '') + formatCurrency(v); })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 4: Net Worth Movement */}
      {(d.assets.length > 0 || d.liabilities.length > 0) && (
        <Card>
          <SectionTitle>Debt & Assets Movement</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {d.assets.length > 0 && (
              <div>
                <div className="text-xs font-medium text-zinc-400 mb-2">Assets</div>
                <div className="space-y-2">
                  {d.assets.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300 truncate mr-2">{a.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-zinc-500">{formatCurrency(a.prev)}</span>
                        <span className="text-zinc-600">→</span>
                        <span className="text-white font-medium">{formatCurrency(a.current)}</span>
                        <span className={cn('text-xs', a.change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {a.change >= 0 ? '+' : ''}{formatCurrency(a.change)}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-semibold border-t border-zinc-800 pt-2">
                    <span className="text-white">Total Assets</span>
                    <span className="text-emerald-400">{formatCurrency(d.assets.reduce((s, a) => s + a.current, 0))}</span>
                  </div>
                </div>
              </div>
            )}
            {d.liabilities.length > 0 && (
              <div>
                <div className="text-xs font-medium text-zinc-400 mb-2">Liabilities</div>
                <div className="space-y-2">
                  {d.liabilities.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300 truncate mr-2">{l.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-zinc-500">{formatCurrency(l.prev)}</span>
                        <span className="text-zinc-600">→</span>
                        <span className="text-white font-medium">{formatCurrency(l.current)}</span>
                        <span className={cn('text-xs', l.change <= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {l.change >= 0 ? '+' : ''}{formatCurrency(l.change)}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-semibold border-t border-zinc-800 pt-2">
                    <span className="text-white">Total Debt</span>
                    <span className="text-red-400">{formatCurrency(d.liabilities.reduce((s, l) => s + l.current, 0))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Net Worth</span>
            <span className={cn('text-lg font-bold', nwPositive ? 'text-emerald-400' : 'text-red-400')}>
              {formatCurrency(d.netWorthCurrent)}
              <span className="text-sm font-normal ml-2">
                ({nwPositive ? '+' : ''}{formatCurrency(d.netWorthChange)} vs last month)
              </span>
            </span>
          </div>
        </Card>
      )}

      {/* Section 5: Cash Position */}
      {d.cashAccounts.some((a) => a.balance > 0) && (
        <Card>
          <SectionTitle>Cash Position</SectionTitle>
          <div className="space-y-2">
            {d.cashAccounts.filter((a) => a.balance > 0).map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{a.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium">{formatCurrency(a.balance)}</span>
                  {a.prevBalance > 0 && (
                    <span className={cn('text-xs', a.balance - a.prevBalance >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {a.balance - a.prevBalance >= 0 ? '+' : ''}{formatCurrency(a.balance - a.prevBalance)}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm font-semibold border-t border-zinc-800 pt-2">
              <span className="text-white">Total Liquid Cash</span>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-white">{formatCurrency(totalCash)}</span>
                {prevTotalCash > 0 && (
                  <span className={cn('text-sm', totalCash - prevTotalCash >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {totalCash - prevTotalCash >= 0 ? '+' : ''}{formatCurrency(totalCash - prevTotalCash)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Section 6: 6-Month Trends */}
      {d.monthlyTrends.length > 1 && (
        <Card>
          <SectionTitle>Month-over-Month Trends (6 Months)</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div>
              <div className="text-xs text-zinc-400 mb-2">Net Income Trend</div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), 'Net Income']} />
                    <Line type="monotone" dataKey="netIncome" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-400 mb-2">Net Worth Trend</div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), 'Net Worth']} />
                    <Line type="monotone" dataKey="netWorth" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Stacked spending by category */}
          <div className="mb-6">
            <div className="text-xs text-zinc-400 mb-2">Spending by Category</div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.monthlyTrends} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), '']} />
                  <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 11 }} />
                  {d.spendingBreakdown.map((b, i) => (
                    <Bar key={b.name} dataKey={`spendingByCategory[${i}].amount`} name={b.name} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === d.spendingBreakdown.length - 1 ? [3, 3, 0, 0] : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Key metrics table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left py-2 pr-3 font-medium">Metric</th>
                  {d.monthlyTrends.map((t) => (
                    <th key={t.month} className="text-right py-2 px-1 font-medium whitespace-nowrap">{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Net Income', key: 'netIncome' as keyof ReportMonthlyTrend, color: (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Total Spend', key: 'spending' as keyof ReportMonthlyTrend, color: () => 'text-zinc-200' },
                  { label: 'Net Worth', key: 'netWorth' as keyof ReportMonthlyTrend, color: () => 'text-white' },
                  { label: 'Total Debt', key: 'totalDebt' as keyof ReportMonthlyTrend, color: () => 'text-zinc-200' },
                  { label: 'Total Cash', key: 'totalCash' as keyof ReportMonthlyTrend, color: () => 'text-zinc-200' },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 text-zinc-400 font-medium">{row.label}</td>
                    {d.monthlyTrends.map((t, ti) => {
                      const val = t[row.key] as number;
                      const prev = ti > 0 ? d.monthlyTrends[ti - 1][row.key] as number : null;
                      return (
                        <td key={t.month} className={cn('py-2 px-1 text-right', row.color(val))}>
                          {formatCurrency(Math.round(val))}
                          {prev !== null && val !== prev && (
                            <span className="ml-0.5">{val > prev ? '↑' : '↓'}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Recipients Modal ──────────────────────────────────────────────────────────

function RecipientsModal({ householdId, onClose }: { householdId: string; onClose: () => void }) {
  const supabase = createClient();
  const [recipients, setRecipients] = useState<ReportRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('report_recipients').select('*').eq('household_id', householdId).order('created_at');
    if (data) setRecipients(data);
    setLoading(false);
  }, [householdId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setSaving(true);
    await supabase.from('report_recipients').insert({ household_id: householdId, name: newName.trim(), email: newEmail.trim() });
    setNewName(''); setNewEmail('');
    setSaving(false);
    await load();
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from('report_recipients').update({ is_active: active }).eq('id', id);
    await load();
  };

  const remove = async (id: string) => {
    await supabase.from('report_recipients').delete().eq('id', id);
    await load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h3 className="text-base font-semibold text-white">Manage Recipients</h3>
          <button onClick={onClose} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-zinc-400 mx-auto" /> : (
            <>
              {recipients.map((r) => (
                <div key={r.id} className="flex items-center gap-3 bg-zinc-800 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{r.name}</div>
                    <div className="text-xs text-zinc-400 truncate">{r.email}</div>
                  </div>
                  <button
                    onClick={() => toggle(r.id, !r.is_active)}
                    className={cn('text-xs px-2 py-1 rounded-full font-medium transition-colors', r.is_active ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' : 'bg-zinc-700 text-zinc-500 hover:bg-zinc-600')}
                  >
                    {r.is_active ? 'Active' : 'Off'}
                  </button>
                  <button onClick={() => remove(r.id)} className="p-1.5 rounded text-zinc-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {recipients.length === 0 && <p className="text-sm text-zinc-400 text-center py-2">No recipients yet.</p>}
            </>
          )}
        </div>
        <div className="p-5 border-t border-zinc-800 space-y-3">
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[40px]" />
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" type="email" className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[40px]" />
            <button onClick={add} disabled={saving || !newName.trim() || !newEmail.trim()} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm font-medium transition-colors min-h-[40px]">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ReportsTab ───────────────────────────────────────────────────────────

export function ReportsTab({
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

  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingReport, setViewingReport] = useState<MonthlyReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [showRecipients, setShowRecipients] = useState(false);
  const [activeRecipientCount, setActiveRecipientCount] = useState(0);

  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from('monthly_reports')
      .select('*')
      .eq('household_id', householdId)
      .order('month', { ascending: false });
    if (data) setReports(data);
    setLoading(false);
  }, [householdId]);

  const loadRecipientCount = useCallback(async () => {
    const { count } = await supabase.from('report_recipients').select('*', { count: 'exact', head: true }).eq('household_id', householdId).eq('is_active', true);
    setActiveRecipientCount(count ?? 0);
  }, [householdId]);

  useEffect(() => {
    loadReports();
    loadRecipientCount();
  }, [loadReports, loadRecipientCount]);

  // Auto-generate last month's report if it doesn't exist
  useEffect(() => {
    if (loading || !canEdit) return;
    const lastMonth = getPrevMonthStr(currentMonth);
    const lastMonthStart = lastMonth + '-01';
    const exists = reports.some((r) => r.month === lastMonthStart && !r.is_partial);
    if (!exists) handleGenerate(lastMonth, false, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleGenerate = async (month: string, isPartial: boolean, silent = false) => {
    if (!silent) setGenerating(true);
    try {
      const data = await generateReportData(supabase, householdId, month, isPartial);
      const monthStart = month + '-01';
      await supabase.from('monthly_reports').upsert(
        {
          household_id: householdId,
          month: monthStart,
          report_data: data,
          status: 'ready',
          is_partial: isPartial,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'household_id,month,is_partial' }
      );
      await loadReports();
      if (!silent) {
        // Open the just-generated report
        const { data: fresh } = await supabase.from('monthly_reports').select('*').eq('household_id', householdId).eq('month', monthStart).eq('is_partial', isPartial).single();
        if (fresh) setViewingReport(fresh);
      }
    } finally {
      if (!silent) setGenerating(false);
    }
  };

  const handleSend = async (report: MonthlyReport) => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/reports/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id, householdId }),
      });
      const json = await res.json();
      if (json.setupRequired) {
        setSendResult('setup');
      } else if (json.ok) {
        setSendResult(`Sent to ${json.sent} recipient${json.sent !== 1 ? 's' : ''} ✓`);
        await loadReports();
        if (viewingReport?.id === report.id) {
          const { data: fresh } = await supabase.from('monthly_reports').select('*').eq('id', report.id).single();
          if (fresh) setViewingReport(fresh);
        }
      } else {
        setSendResult(`Error: ${json.error}`);
      }
    } finally {
      setSending(false);
    }
  };

  if (viewingReport) {
    return (
      <div>
        <div className="print:hidden flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div /> {/* spacer — back button is inside ReportView */}
          {canEdit && (
            <div className="flex items-center gap-3">
              {sendResult === 'setup' ? (
                <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-600/10 border border-amber-600/30 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Add <code className="text-amber-300">RESEND_API_KEY</code> to env vars. <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline">resend.com</a></span>
                </div>
              ) : sendResult ? (
                <span className="text-sm text-emerald-400">{sendResult}</span>
              ) : null}
              <button
                onClick={() => handleSend(viewingReport)}
                disabled={sending || activeRecipientCount === 0}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors min-h-[44px]',
                  viewingReport.status === 'sent'
                    ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20',
                  (sending || activeRecipientCount === 0) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {viewingReport.status === 'sent' ? `Resend (sent ${viewingReport.sent_at ? new Date(viewingReport.sent_at).toLocaleDateString() : ''})` : 'Send Report'}
              </button>
              {activeRecipientCount === 0 && (
                <button onClick={() => setShowRecipients(true)} className="text-xs text-zinc-400 hover:text-white underline">Add recipients first</button>
              )}
            </div>
          )}
        </div>
        <ReportView report={viewingReport} onBack={() => setViewingReport(null)} />
        {showRecipients && <RecipientsModal householdId={householdId} onClose={() => { setShowRecipients(false); loadRecipientCount(); }} />}
      </div>
    );
  }

  // Archive list
  const prevMonth = getPrevMonthStr(currentMonth);

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white">Financial Reports</h2>
          <p className="text-sm text-zinc-400">Monthly P&amp;L summaries for the Pearson household</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowRecipients(true)}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 min-h-[44px]"
          >
            <Settings className="w-4 h-4" />
            Recipients {activeRecipientCount > 0 && <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{activeRecipientCount}</span>}
          </button>
          {canEdit && (
            <button
              onClick={() => handleGenerate(currentMonth, true)}
              disabled={generating}
              className="flex items-center gap-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-2 rounded-lg transition-colors min-h-[44px]"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Generate Now
            </button>
          )}
        </div>
      </div>

      {/* Report archive */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 mb-2">No reports generated yet.</p>
            <p className="text-sm text-zinc-500 mb-4">Reports auto-generate on the 1st of each month for the previous month.</p>
            {canEdit && (
              <button
                onClick={() => handleGenerate(prevMonth, false)}
                disabled={generating}
                className="flex items-center gap-2 mx-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Generate {monthLabelFull(prevMonth)} Report
              </button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const rMonth = r.month.slice(0, 7);
            const d = r.report_data;
            const netPos = d.netIncome >= 0;
            const isLatest = reports[0]?.id === r.id && !r.is_partial;
            return (
              <div
                key={r.id}
                className={cn(
                  'bg-zinc-900 border rounded-xl p-4 transition-colors hover:border-zinc-600 cursor-pointer',
                  isLatest && r.status !== 'sent' ? 'border-blue-600/50 shadow-lg shadow-blue-500/5' : 'border-zinc-800'
                )}
                onClick={() => setViewingReport(r)}
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base font-semibold text-white">{monthLabelFull(rMonth)}</span>
                      {r.is_partial && <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full">Mid-Month</span>}
                      {isLatest && r.status !== 'sent' && (
                        <span className="text-xs bg-blue-600/20 text-blue-400 border border-blue-600/30 px-2 py-0.5 rounded-full animate-pulse">New</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">Generated {new Date(r.generated_at).toLocaleDateString()}</div>
                  </div>

                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="text-center">
                      <div className="text-xs text-zinc-500 mb-0.5">Net Income</div>
                      <div className={cn('text-sm font-bold', netPos ? 'text-emerald-400' : 'text-red-400')}>
                        <TrendArrow val={d.netIncome} /> {netPos ? '+' : ''}{formatCurrency(d.netIncome)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-zinc-500 mb-0.5">Spent</div>
                      <div className="text-sm font-semibold text-zinc-200">{formatCurrency(d.spendingTotal)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-zinc-500 mb-0.5">Net Worth</div>
                      <div className="text-sm font-semibold text-white">{formatCurrency(d.netWorthCurrent)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.status === 'sent' ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-600/10 px-2.5 py-1.5 rounded-full">
                        <Check className="w-3 h-3" /> Sent
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Not sent</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewingReport(r); }}
                      className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors min-h-[40px]"
                    >
                      <FileText className="w-3.5 h-3.5" /> View
                    </button>
                    {canEdit && isLatest && r.status !== 'sent' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setViewingReport(r); }}
                        className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg font-semibold transition-colors shadow-lg shadow-emerald-500/20 min-h-[40px]"
                      >
                        <Send className="w-3.5 h-3.5" /> Send
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showRecipients && (
        <RecipientsModal householdId={householdId} onClose={() => { setShowRecipients(false); loadRecipientCount(); }} />
      )}
    </div>
  );
}
