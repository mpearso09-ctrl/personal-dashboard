'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getToday, getWeekStart, getDayOfChallenge, getStatusColor, cn } from '@/lib/utils';
import type { FitnessDaily, FitnessGoals, BudgetWeekly, NetWorthMonthly } from '@/lib/types';
import { BUDGET_TARGETS } from '@/lib/types';
import { Dumbbell, DollarSign, TrendingUp, Target, Flame, Footprints, Moon, Zap } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [todayEntry, setTodayEntry] = useState<FitnessDaily | null>(null);
  const [goals, setGoals] = useState<FitnessGoals | null>(null);
  const [weekBudget, setWeekBudget] = useState<BudgetWeekly | null>(null);
  const [latestNetWorth, setLatestNetWorth] = useState<NetWorthMonthly | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const today = getToday();
      const weekStart = getWeekStart(today);

      const [fitRes, goalRes, budgetRes, nwRes] = await Promise.all([
        supabase.from('fitness_daily').select('*').eq('user_id', user!.id).eq('date', today).maybeSingle(),
        supabase.from('fitness_goals').select('*').eq('user_id', user!.id).maybeSingle(),
        supabase.from('budget_weekly').select('*').eq('user_id', user!.id).eq('week_start', weekStart).maybeSingle(),
        supabase.from('net_worth_monthly').select('*').eq('user_id', user!.id).order('month', { ascending: false }).limit(1).maybeSingle(),
      ]);

      setTodayEntry(fitRes.data);
      setGoals(goalRes.data);
      setWeekBudget(budgetRes.data);
      setLatestNetWorth(nwRes.data);
      setLoading(false);
    }

    load();
  }, [user]);

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  const challengeDay = goals ? getDayOfChallenge(goals.challenge_start_date) : null;

  // Net worth calculation
  const totalAssets = latestNetWorth
    ? (latestNetWorth.cash_investments + latestNetWorth.business_assets + latestNetWorth.protocase_shares + latestNetWorth.vehicle_assets)
    : 0;
  const totalLiabilities = latestNetWorth
    ? (latestNetWorth.rbc_balance + latestNetWorth.triangle_balance + latestNetWorth.scotia_visa + latestNetWorth.scotia_loc + latestNetWorth.td_loan_tesla + latestNetWorth.taxes_owed)
    : 0;
  const netWorth = totalAssets - totalLiabilities;

  // Budget totals
  const weeklySpent = weekBudget
    ? weekBudget.essentials + weekBudget.investments + weekBudget.savings + weekBudget.debt + weekBudget.fun
    : 0;
  const weeklyBudget = BUDGET_TARGETS.essentials.weekly + BUDGET_TARGETS.investments.weekly + BUDGET_TARGETS.savings.weekly + BUDGET_TARGETS.debt.weekly + BUDGET_TARGETS.fun.weekly;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        {challengeDay && goals && (
          <div className="bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg font-medium">
            {goals.challenge_name}: Day {Math.min(challengeDay, goals.challenge_days)} of {goals.challenge_days}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickStat
          icon={<Flame size={20} />}
          label="Calories"
          value={todayEntry?.calories_consumed?.toString() ?? '—'}
          target={goals ? `< ${goals.calories_max}` : undefined}
          color={todayEntry && goals ? getStatusColor(todayEntry.calories_consumed, undefined, goals.calories_max) : undefined}
        />
        <QuickStat
          icon={<Target size={20} />}
          label="Protein"
          value={todayEntry?.protein_g ? `${todayEntry.protein_g}g` : '—'}
          target={goals ? `> ${goals.protein_min}g` : undefined}
          color={todayEntry && goals ? getStatusColor(todayEntry.protein_g, goals.protein_min) : undefined}
        />
        <QuickStat
          icon={<Footprints size={20} />}
          label="Steps"
          value={todayEntry?.steps?.toLocaleString() ?? '—'}
          target={goals ? `> ${goals.steps_min.toLocaleString()}` : undefined}
          color={todayEntry && goals ? getStatusColor(todayEntry.steps, goals.steps_min) : undefined}
        />
        <QuickStat
          icon={<Moon size={20} />}
          label="Sleep"
          value={todayEntry?.sleep_hours ? `${todayEntry.sleep_hours}h` : '—'}
          target={goals ? `> ${goals.sleep_min}h` : undefined}
          color={todayEntry && goals ? getStatusColor(todayEntry.sleep_hours, goals.sleep_min) : undefined}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Fitness */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell size={20} className="text-blue-400" />
              Today&apos;s Fitness
            </CardTitle>
          </CardHeader>
          {todayEntry ? (
            <div className="space-y-3">
              <MetricRow label="Calories Burned" value={todayEntry.calories_burned?.toLocaleString() ?? '—'} color={goals ? getStatusColor(todayEntry.calories_burned, goals.calories_burned_min) : undefined} />
              <MetricRow label="Carbs" value={todayEntry.carbs_g ? `${todayEntry.carbs_g}g` : '—'} color={goals ? getStatusColor(todayEntry.carbs_g, goals.carbs_min, goals.carbs_max) : undefined} />
              <MetricRow label="Fat" value={todayEntry.fat_g ? `${todayEntry.fat_g}g` : '—'} color={goals ? getStatusColor(todayEntry.fat_g, goals.fat_min, goals.fat_max) : undefined} />
              <MetricRow label="Fiber" value={todayEntry.fiber_g ? `${todayEntry.fiber_g}g` : '—'} color={goals ? getStatusColor(todayEntry.fiber_g, goals.fiber_min, goals.fiber_max) : undefined} />
              <MetricRow label="Workout" value={todayEntry.workout ? 'Yes' : 'No'} color={todayEntry.workout ? 'text-emerald-400' : 'text-zinc-400'} />
              <MetricRow label="Training Quality" value={todayEntry.training_quality?.toString() ?? '—'} />
              <MetricRow label="Mobility" value={todayEntry.mobility ? 'Done' : 'Not yet'} color={todayEntry.mobility ? 'text-emerald-400' : 'text-zinc-400'} />
              {todayEntry.notes && <p className="text-sm text-zinc-400 pt-2 border-t border-zinc-800">{todayEntry.notes}</p>}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No entry yet today. <a href="/fitness" className="text-blue-400 hover:underline">Log now</a></p>
          )}
        </Card>

        {/* Weekly Budget */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign size={20} className="text-emerald-400" />
              This Week&apos;s Budget
            </CardTitle>
          </CardHeader>
          {weekBudget ? (
            <div className="space-y-3">
              <BudgetRow label="Essentials" actual={weekBudget.essentials} target={BUDGET_TARGETS.essentials.weekly} />
              <BudgetRow label="Investments" actual={weekBudget.investments} target={BUDGET_TARGETS.investments.weekly} />
              <BudgetRow label="Savings" actual={weekBudget.savings} target={BUDGET_TARGETS.savings.weekly} />
              <BudgetRow label="Debt" actual={weekBudget.debt} target={BUDGET_TARGETS.debt.weekly} />
              <BudgetRow label="Fun" actual={weekBudget.fun} target={BUDGET_TARGETS.fun.weekly} />
              <div className="pt-3 border-t border-zinc-800 flex justify-between font-medium">
                <span className="text-zinc-300">Total</span>
                <span className={cn(weeklySpent <= weeklyBudget ? 'text-emerald-400' : 'text-red-400')}>
                  {formatCurrency(weeklySpent)} / {formatCurrency(weeklyBudget)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No budget entry this week. <a href="/finances" className="text-blue-400 hover:underline">Enter now</a></p>
          )}
        </Card>

        {/* Net Worth */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={20} className="text-amber-400" />
              Net Worth
            </CardTitle>
          </CardHeader>
          {latestNetWorth ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-sm text-zinc-400">Total Assets</p>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalAssets)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-zinc-400">Total Liabilities</p>
                <p className="text-xl font-bold text-red-400">{formatCurrency(totalLiabilities)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-zinc-400">Net Worth</p>
                <p className={cn('text-xl font-bold', netWorth >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatCurrency(netWorth)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No net worth data yet. <a href="/finances" className="text-blue-400 hover:underline">Add snapshot</a></p>
          )}
        </Card>
      </div>
    </div>
  );
}

function QuickStat({
  icon,
  label,
  value,
  target,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  target?: string;
  color?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-zinc-400 mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold', color || 'text-white')}>{value}</p>
      {target && <p className="text-xs text-zinc-500 mt-1">Target: {target}</p>}
    </Card>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={cn('text-sm font-medium', color || 'text-white')}>{value}</span>
    </div>
  );
}

function BudgetRow({ label, actual, target }: { label: string; actual: number; target: number }) {
  const pct = target > 0 ? (actual / target) * 100 : 0;
  const over = actual > target;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{label}</span>
        <span className={cn(over ? 'text-red-400' : 'text-emerald-400')}>
          {formatCurrency(actual)} / {formatCurrency(target)}
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', over ? 'bg-red-500' : 'bg-emerald-500')}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
