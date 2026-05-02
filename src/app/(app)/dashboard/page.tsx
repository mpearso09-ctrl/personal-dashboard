'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { useHousehold } from '@/components/household-provider';
import { formatCurrency, getToday, getDayOfChallenge, cn } from '@/lib/utils';
import type {
  FitnessDaily, FitnessGoals, Account, AccountBalance,
  NetWorthEntry, NetWorthItem, BudgetDailyEntry, IncomeDailyEntry,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function avg(arr: (number | null)[]): number | null {
  const vals = arr.filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function trend(data: number[], higherIsBetter: boolean): 'up' | 'down' | 'flat' {
  if (data.length < 5) return 'flat';
  const mid = Math.floor(data.length / 2);
  const recent = avg(data.slice(mid));
  const older = avg(data.slice(0, mid));
  if (!recent || !older) return 'flat';
  const diff = (recent - older) / older;
  if (Math.abs(diff) < 0.02) return 'flat';
  const improving = higherIsBetter ? recent > older : recent < older;
  return improving ? 'up' : 'down';
}

function fmt(v: number | null, decimals = 0): string {
  if (v === null) return '—';
  return decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
}

function monthRange(monthsBack = 0): { start: string; end: string } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  const start = d.toISOString().split('T')[0];
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  return { start, end };
}

function monthLabel(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return d.toLocaleString('default', { month: 'short' });
}

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

interface FitnessData {
  entries: FitnessDaily[];
  prevEntries: FitnessDaily[];
  goals: FitnessGoals | null;
}

interface FinanceData {
  moneyIn: number;
  moneyOut: number;
  netWorthCurrent: number;
  netWorthPrev: number;
  netWorthHistory: { month: string; value: number }[];
  accounts: { account: Account; balance: number | null }[];
  monthlyFlow: { month: string; income: number; spending: number }[];
}

// ---------------------------------------------------------------------------
// Trend arrow
// ---------------------------------------------------------------------------

function TrendArrow({ direction, goodDirection }: { direction: 'up' | 'down' | 'flat'; goodDirection: 'up' | 'down' }) {
  if (direction === 'flat') return <span className="text-zinc-500 text-xs">→</span>;
  const good = direction === goodDirection;
  return (
    <span className={cn('text-xs font-bold', good ? 'text-emerald-400' : 'text-red-400')}>
      {direction === 'up' ? '↑' : '↓'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  dataKey,
  color,
  goal,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  color: string;
  goal?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        {goal !== undefined && (
          <ReferenceLine y={goal} stroke="#52525b" strokeDasharray="3 3" />
        )}
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          dot={false}
          strokeWidth={1.5}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <Link href={href} className="text-sm text-blue-400 hover:text-blue-300 transition-colors py-2 px-1 -my-2 -mx-1 inline-flex items-center min-h-[44px]">
          View Details →
        </Link>
      </div>
      {children}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-zinc-950 border border-zinc-800 rounded-lg p-4', className)}>
      {children}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={cn('text-xl font-bold', color ?? 'text-white')}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fitness Section
// ---------------------------------------------------------------------------

function FitnessSection({
  userId,
  householdUsers,
}: {
  userId: string;
  householdUsers: { id: string; displayName: string }[];
}) {
  const supabase = createClient();
  const [viewUserId, setViewUserId] = useState(userId);
  const [fitnessData, setFitnessData] = useState<FitnessData | null>(null);
  const [loading, setLoading] = useState(true);

  const otherUser = householdUsers.find((u) => u.id !== userId);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const today = getToday();
      const d30ago = new Date(today + 'T00:00:00');
      d30ago.setDate(d30ago.getDate() - 29);
      const start30 = d30ago.toISOString().split('T')[0];

      const d60ago = new Date(today + 'T00:00:00');
      d60ago.setDate(d60ago.getDate() - 59);
      const start60 = d60ago.toISOString().split('T')[0];
      const end60 = d30ago.toISOString().split('T')[0];

      const [recentRes, prevRes, goalsRes] = await Promise.all([
        supabase.from('fitness_daily').select('*').eq('user_id', viewUserId).gte('date', start30).lte('date', today).order('date'),
        supabase.from('fitness_daily').select('*').eq('user_id', viewUserId).gte('date', start60).lt('date', start30).order('date'),
        supabase.from('fitness_goals').select('*').eq('user_id', viewUserId).maybeSingle(),
      ]);

      setFitnessData({
        entries: recentRes.data ?? [],
        prevEntries: prevRes.data ?? [],
        goals: goalsRes.data,
      });
      setLoading(false);
    }
    load();
  }, [viewUserId]);

  if (loading) {
    return (
      <Section title="Fitness" href="/fitness">
        <p className="text-zinc-400 text-sm">Loading...</p>
      </Section>
    );
  }

  if (!fitnessData) return null;

  const { entries, prevEntries, goals } = fitnessData;

  // Challenge progress
  const challengeDay = goals?.challenge_start_date ? getDayOfChallenge(goals.challenge_start_date) : null;
  const challengeDayNum = challengeDay ? Math.min(challengeDay, goals!.challenge_days) : null;
  const challengePct = challengeDayNum && goals ? (challengeDayNum / goals.challenge_days) * 100 : 0;

  // Monthly averages
  const weights = entries.map((e) => e.weight_lbs);
  const bfPcts = entries.map((e) => e.body_fat_pct);
  const cals = entries.map((e) => e.calories_consumed);
  const proteins = entries.map((e) => e.protein_g);
  const steps = entries.map((e) => e.steps);
  const sleeps = entries.map((e) => e.sleep_hours);
  const burned = entries.map((e) => e.calories_burned);

  const avgWeight = avg(weights);
  const avgBf = avg(bfPcts);
  const avgCals = avg(cals);
  const avgProtein = avg(proteins);
  const avgSteps = avg(steps);
  const avgSleep = avg(sleeps);
  const avgBurned = avg(burned);

  // Trend directions (uses only non-null values from entries)
  const weightTrend = trend(weights.filter((v): v is number => v !== null), false);
  const calsTrend = trend(cals.filter((v): v is number => v !== null), false);
  const proteinTrend = trend(proteins.filter((v): v is number => v !== null), true);
  const stepsTrend = trend(steps.filter((v): v is number => v !== null), true);
  const sleepTrend = trend(sleeps.filter((v): v is number => v !== null), true);
  const burnedTrend = trend(burned.filter((v): v is number => v !== null), true);

  // Scorecard — days each goal was hit this month
  const days = entries.length;
  const hitProtein = goals ? entries.filter((e) => e.protein_g !== null && e.protein_g >= goals.protein_min).length : null;
  const hitSteps = goals ? entries.filter((e) => e.steps !== null && e.steps >= goals.steps_min).length : null;
  const hitCals = goals ? entries.filter((e) => e.calories_consumed !== null && e.calories_consumed <= goals.calories_max).length : null;
  const hitSleep = goals ? entries.filter((e) => e.sleep_hours !== null && e.sleep_hours >= goals.sleep_min).length : null;
  const hitBurned = goals ? entries.filter((e) => e.calories_burned !== null && e.calories_burned >= goals.calories_burned_min).length : null;
  const hitWorkout = entries.filter((e) => e.workout).length;

  // Sparkline data
  const weightChartData = entries
    .filter((e) => e.weight_lbs !== null)
    .map((e) => ({ date: e.date, weight: e.weight_lbs }));

  const stepsChartData = entries.map((e) => ({ date: e.date, steps: e.steps }));
  const calsChartData = entries.map((e) => ({ date: e.date, calories: e.calories_consumed }));

  const myName = householdUsers.find((u) => u.id === userId)?.displayName ?? 'Me';
  const viewingOther = viewUserId !== userId;

  return (
    <Section title="Fitness" href="/fitness">
      {/* User toggle */}
      {otherUser && (
        <div className="flex gap-2">
          <button
            onClick={() => setViewUserId(userId)}
            className={cn(
              'px-3 py-2.5 rounded-full text-sm font-medium transition-colors min-h-[44px]',
              !viewingOther ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white',
            )}
          >
            My Stats
          </button>
          <button
            onClick={() => setViewUserId(otherUser.id)}
            className={cn(
              'px-3 py-2.5 rounded-full text-sm font-medium transition-colors min-h-[44px]',
              viewingOther ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white',
            )}
          >
            {otherUser.displayName}
          </button>
          {viewingOther && (
            <span className="ml-auto text-xs text-zinc-500 self-center">Read-only</span>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          No fitness data in the last 30 days.{' '}
          <Link href="/fitness" className="text-blue-400 hover:underline">Log now</Link>
        </p>
      ) : (
        <>
          {/* Challenge progress */}
          {goals && challengeDayNum && (
            <Card>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-white">{goals.challenge_name}</span>
                <span className="text-xs text-zinc-400">
                  Day {challengeDayNum} of {goals.challenge_days}
                </span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${Math.min(challengePct, 100)}%` }}
                />
              </div>
            </Card>
          )}

          {/* Monthly averages */}
          <Card>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">30-Day Averages</p>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6">
              <MetricLine
                label="Weight"
                value={avgWeight ? `${fmt(avgWeight, 1)} lbs` : '—'}
                trendDir={weightTrend}
                goodDir="down"
                goalColor={avgWeight && goals?.goal_weight ? (avgWeight <= goals.goal_weight ? 'text-emerald-400' : 'text-red-400') : undefined}
              />
              <MetricLine
                label="Body Fat"
                value={avgBf ? `${fmt(avgBf, 1)}%` : '—'}
                trendDir={trend(bfPcts.filter((v): v is number => v !== null), false)}
                goodDir="down"
                goalColor={avgBf && goals?.goal_body_fat ? (avgBf <= goals.goal_body_fat ? 'text-emerald-400' : 'text-red-400') : undefined}
              />
              <MetricLine
                label="Calories"
                value={avgCals ? fmt(avgCals) : '—'}
                trendDir={calsTrend}
                goodDir="down"
                goalColor={avgCals && goals ? (avgCals <= goals.calories_max ? 'text-emerald-400' : 'text-red-400') : undefined}
              />
              <MetricLine
                label="Protein"
                value={avgProtein ? `${fmt(avgProtein)}g` : '—'}
                trendDir={proteinTrend}
                goodDir="up"
                goalColor={avgProtein && goals ? (avgProtein >= goals.protein_min ? 'text-emerald-400' : 'text-red-400') : undefined}
              />
              <MetricLine
                label="Steps"
                value={avgSteps ? fmt(avgSteps) : '—'}
                trendDir={stepsTrend}
                goodDir="up"
                goalColor={avgSteps && goals ? (avgSteps >= goals.steps_min ? 'text-emerald-400' : 'text-red-400') : undefined}
              />
              <MetricLine
                label="Sleep"
                value={avgSleep ? `${fmt(avgSleep, 1)}h` : '—'}
                trendDir={sleepTrend}
                goodDir="up"
                goalColor={avgSleep && goals ? (avgSleep >= goals.sleep_min ? 'text-emerald-400' : 'text-red-400') : undefined}
              />
              <MetricLine
                label="Cal Burned"
                value={avgBurned ? fmt(avgBurned) : '—'}
                trendDir={burnedTrend}
                goodDir="up"
                goalColor={avgBurned && goals ? (avgBurned >= goals.calories_burned_min ? 'text-emerald-400' : 'text-red-400') : undefined}
              />
            </div>
          </Card>

          {/* Scorecard */}
          {goals && (
            <Card>
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Goal Scorecard — last {days} days</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-6">
                <ScoreRow label="Protein" hit={hitProtein} total={days} />
                <ScoreRow label="Steps" hit={hitSteps} total={days} />
                <ScoreRow label="Calories" hit={hitCals} total={days} />
                <ScoreRow label="Sleep" hit={hitSleep} total={days} />
                <ScoreRow label="Cal Burned" hit={hitBurned} total={days} />
                <ScoreRow label="Workout" hit={hitWorkout} total={days} />
              </div>
            </Card>
          )}

          {/* Sparklines */}
          <div className="grid grid-cols-1 gap-3">
            {weightChartData.length > 1 && (
              <SparkCard label="Weight (lbs)" goal={goals?.goal_weight}>
                <Sparkline data={weightChartData} dataKey="weight" color="#60a5fa" goal={goals?.goal_weight} />
              </SparkCard>
            )}
            {stepsChartData.some((d) => d.steps !== null) && (
              <SparkCard label="Steps" goal={goals?.steps_min}>
                <Sparkline data={stepsChartData} dataKey="steps" color="#34d399" goal={goals?.steps_min} />
              </SparkCard>
            )}
            {calsChartData.some((d) => d.calories !== null) && (
              <SparkCard label="Calories Consumed" goal={goals?.calories_max}>
                <Sparkline data={calsChartData} dataKey="calories" color="#f87171" goal={goals?.calories_max} />
              </SparkCard>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

function MetricLine({
  label,
  value,
  trendDir,
  goodDir,
  goalColor,
}: {
  label: string;
  value: string;
  trendDir: 'up' | 'down' | 'flat';
  goodDir: 'up' | 'down';
  goalColor?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="flex items-center gap-1">
        <span className={cn('text-sm font-medium', goalColor ?? 'text-white')}>{value}</span>
        <TrendArrow direction={trendDir} goodDirection={goodDir} />
      </span>
    </div>
  );
}

function ScoreRow({ label, hit, total }: { label: string; hit: number | null; total: number }) {
  if (hit === null) return null;
  const pct = total > 0 ? (hit / total) * 100 : 0;
  const color = pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={cn('text-sm font-medium', color)}>
        {hit}/{total}
      </span>
    </div>
  );
}

function SparkCard({ label, goal, children }: { label: string; goal?: number; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 pt-3 pb-1">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-zinc-500">{label}</span>
        {goal !== undefined && <span className="text-xs text-zinc-600">Goal: {goal.toLocaleString()}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finance Section
// ---------------------------------------------------------------------------

function FinanceSection({ householdId }: { householdId: string }) {
  const supabase = createClient();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { start: monthStart, end: monthEnd } = monthRange(0);
      const { start: prevMonthStart, end: prevMonthEnd } = monthRange(1);

      // Build last 6 month boundaries for net worth history + flow
      const monthBoundaries = Array.from({ length: 6 }, (_, i) => monthRange(5 - i));

      const [
        budgetRes,
        incomeRes,
        prevBudgetRes,
        prevIncomeRes,
        accountsRes,
        balancesRes,
        nwEntriesRes,
        nwItemsRes,
      ] = await Promise.all([
        supabase.from('budget_daily').select('amount').eq('household_id', householdId).gte('date', monthStart).lte('date', monthEnd),
        supabase.from('income_daily').select('amount').eq('household_id', householdId).gte('date', monthStart).lte('date', monthEnd),
        supabase.from('budget_daily').select('amount').eq('household_id', householdId).gte('date', prevMonthStart).lte('date', prevMonthEnd),
        supabase.from('income_daily').select('amount').eq('household_id', householdId).gte('date', prevMonthStart).lte('date', prevMonthEnd),
        supabase.from('accounts').select('*').eq('household_id', householdId).order('sort_order'),
        supabase.from('account_balances').select('*').eq('household_id', householdId).order('date', { ascending: false }),
        supabase.from('net_worth_entries').select('*, net_worth_items(type)').eq('household_id', householdId).order('month', { ascending: false }),
        supabase.from('net_worth_items').select('*').eq('household_id', householdId),
      ]);

      const moneyOut = (budgetRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
      const moneyIn = (incomeRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0);

      // Net worth computation helper
      type NWEntry = NetWorthEntry & { net_worth_items: { type: string } | null };
      const allNwEntries: NWEntry[] = nwEntriesRes.data ?? [];

      function computeNetWorth(entries: NWEntry[]): number {
        const assets = entries.filter((e) => e.net_worth_items?.type === 'asset').reduce((s, e) => s + Number(e.value), 0);
        const liabilities = entries.filter((e) => e.net_worth_items?.type === 'liability').reduce((s, e) => s + Number(e.value), 0);
        return assets - liabilities;
      }

      // Current & prev net worth
      const latestMonth = allNwEntries[0]?.month ?? null;
      const latestEntries = latestMonth ? allNwEntries.filter((e) => e.month === latestMonth) : [];
      const netWorthCurrent = computeNetWorth(latestEntries);

      const months = [...new Set(allNwEntries.map((e) => e.month))].sort();
      const prevMonth = months[months.length - 2] ?? null;
      const prevEntries = prevMonth ? allNwEntries.filter((e) => e.month === prevMonth) : [];
      const netWorthPrev = computeNetWorth(prevEntries);

      // Last 6 months net worth history
      const netWorthHistory = months.slice(-6).map((m) => ({
        month: m.slice(0, 7),
        value: computeNetWorth(allNwEntries.filter((e) => e.month === m)),
      }));

      // Account balances — latest per account
      const allBalances: AccountBalance[] = balancesRes.data ?? [];
      const accts: Account[] = accountsRes.data ?? [];
      const latestBalances: { account: Account; balance: number | null }[] = accts.map((acct) => {
        const bal = allBalances.find((b) => b.account_id === acct.id);
        return { account: acct, balance: bal ? Number(bal.balance) : null };
      });

      // Last 3 months income vs spending (using budget_daily date ranges)
      const monthlyFlow = await Promise.all(
        [2, 1, 0].map(async (i) => {
          const { start, end } = monthRange(i);
          const [bRes, iRes] = await Promise.all([
            supabase.from('budget_daily').select('amount').eq('household_id', householdId).gte('date', start).lte('date', end),
            supabase.from('income_daily').select('amount').eq('household_id', householdId).gte('date', start).lte('date', end),
          ]);
          return {
            month: monthLabel(i),
            income: (iRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0),
            spending: (bRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0),
          };
        }),
      );

      setData({
        moneyIn,
        moneyOut,
        netWorthCurrent,
        netWorthPrev,
        netWorthHistory,
        accounts: latestBalances,
        monthlyFlow,
      });
      setLoading(false);
    }
    load();
  }, [householdId]);

  if (loading) {
    return (
      <Section title="Finances" href="/finances">
        <p className="text-zinc-400 text-sm">Loading...</p>
      </Section>
    );
  }

  if (!data) return null;

  const surplus = data.moneyIn - data.moneyOut;
  const nwChange = data.netWorthCurrent - data.netWorthPrev;
  const totalAccountBalance = data.accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const hasAccountData = data.accounts.some((a) => a.balance !== null);

  const nwChartData = data.netWorthHistory.map((h) => ({
    month: h.month.slice(5), // "MM"
    value: h.value,
  }));

  return (
    <Section title="Finances" href="/finances">
      {/* Monthly summary */}
      <Card>
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">This Month</p>
        <div className="grid grid-cols-3 gap-4">
          <StatBadge
            label="Money In"
            value={formatCurrency(data.moneyIn)}
            color="text-emerald-400"
          />
          <StatBadge
            label="Money Out"
            value={formatCurrency(data.moneyOut)}
            color="text-red-400"
          />
          <StatBadge
            label={surplus >= 0 ? 'Surplus' : 'Deficit'}
            value={formatCurrency(Math.abs(surplus))}
            color={surplus >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
        </div>
      </Card>

      {/* Net Worth */}
      <Card>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Net Worth</p>
            <p className={cn('text-2xl font-bold', data.netWorthCurrent >= 0 ? 'text-white' : 'text-red-400')}>
              {formatCurrency(data.netWorthCurrent)}
            </p>
            {data.netWorthPrev !== 0 && (
              <p className={cn('text-sm mt-1', nwChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {nwChange >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(nwChange))} vs last month
              </p>
            )}
          </div>
        </div>
        {nwChartData.length > 1 && (
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={nwChartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <Line
                type="monotone"
                dataKey="value"
                stroke="#60a5fa"
                dot={false}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                formatter={(v) => [formatCurrency(Number(v)), 'Net Worth']}
                labelFormatter={(l) => l}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        {nwChartData.length === 0 && (
          <p className="text-zinc-500 text-sm">
            No net worth snapshots yet.{' '}
            <Link href="/finances" className="text-blue-400 hover:underline">Add one</Link>
          </p>
        )}
      </Card>

      {/* Account Balances */}
      {hasAccountData ? (
        <Card>
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Accounts</p>
            <p className="text-sm font-semibold text-white">{formatCurrency(totalAccountBalance)}</p>
          </div>
          <div className="space-y-2">
            {data.accounts.map(({ account, balance }) => (
              <div key={account.id} className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">{account.name}</span>
                <span className={cn('text-sm font-medium', balance === null ? 'text-zinc-600' : balance >= 0 ? 'text-white' : 'text-red-400')}>
                  {balance === null ? '—' : formatCurrency(balance)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <p className="text-zinc-500 text-sm">
          No account balances yet.{' '}
          <Link href="/finances" className="text-blue-400 hover:underline">Add balances</Link>
        </p>
      )}

      {/* 3-month income vs spending bar chart */}
      {data.monthlyFlow.some((m) => m.income > 0 || m.spending > 0) && (
        <Card>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Last 3 Months — Income vs Spending</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={data.monthlyFlow} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                formatter={(v) => formatCurrency(Number(v))}
              />
              <Bar dataKey="income" name="Income" fill="#34d399" radius={[3, 3, 0, 0]} />
              <Bar dataKey="spending" name="Spending" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth();
  const { householdId, householdUsers, loading: hhLoading } = useHousehold();

  if (!user || hhLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{today}</p>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FitnessSection userId={user.id} householdUsers={householdUsers} />
        {householdId ? (
          <FinanceSection householdId={householdId} />
        ) : (
          <Section title="Finances" href="/finances">
            <p className="text-zinc-500 text-sm">No household found.</p>
          </Section>
        )}
      </div>
    </div>
  );
}
