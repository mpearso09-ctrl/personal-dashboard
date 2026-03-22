'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { useHousehold } from '@/components/household-provider';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getToday, getWeekStart, getDayOfChallenge, getStatusColor, cn } from '@/lib/utils';
import type { FitnessDaily, FitnessGoals, BudgetCategory, BudgetDailyEntry, NetWorthItem, NetWorthEntry } from '@/lib/types';
import { Dumbbell, DollarSign, TrendingUp, Target, Flame, Footprints, Moon, Scale } from 'lucide-react';

interface WeekBudgetSummary {
  category: BudgetCategory;
  spent: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const supabase = createClient();

  const [todayEntry, setTodayEntry] = useState<FitnessDaily | null>(null);
  const [goals, setGoals] = useState<FitnessGoals | null>(null);
  const [weekBudgetSummary, setWeekBudgetSummary] = useState<WeekBudgetSummary[]>([]);
  const [netWorthData, setNetWorthData] = useState<{ totalAssets: number; totalLiabilities: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !householdId) return;

    async function load() {
      const today = getToday();
      const weekStart = getWeekStart(today);

      // Get Sunday end of week
      const weekEnd = new Date(weekStart + 'T00:00:00');
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      const [fitRes, goalRes, catsRes, weekEntriesRes, nwItemsRes, nwEntriesRes] = await Promise.all([
        supabase.from('fitness_daily').select('*').eq('user_id', user!.id).eq('date', today).maybeSingle(),
        supabase.from('fitness_goals').select('*').eq('user_id', user!.id).maybeSingle(),
        supabase.from('budget_categories').select('*').eq('household_id', householdId).order('sort_order'),
        supabase.from('budget_daily').select('*').eq('household_id', householdId).gte('date', weekStart).lte('date', weekEndStr),
        supabase.from('net_worth_items').select('*').eq('household_id', householdId),
        supabase.from('net_worth_entries').select('*, net_worth_items(type)').eq('household_id', householdId).order('month', { ascending: false }),
      ]);

      setTodayEntry(fitRes.data);
      setGoals(goalRes.data);

      // Build weekly budget summary
      const cats: BudgetCategory[] = catsRes.data ?? [];
      const weekEntries: BudgetDailyEntry[] = weekEntriesRes.data ?? [];
      const summary = cats.map((cat) => ({
        category: cat,
        spent: weekEntries.filter((e) => e.category_id === cat.id).reduce((sum, e) => sum + Number(e.amount), 0),
      }));
      setWeekBudgetSummary(summary);

      // Build net worth from latest month's entries
      const nwItems: NetWorthItem[] = nwItemsRes.data ?? [];
      const allEntries: (NetWorthEntry & { net_worth_items: { type: string } })[] = nwEntriesRes.data ?? [];
      if (allEntries.length > 0) {
        const latestMonth = allEntries[0].month;
        const latestEntries = allEntries.filter((e) => e.month === latestMonth);
        const totalAssets = latestEntries
          .filter((e) => e.net_worth_items?.type === 'asset')
          .reduce((sum, e) => sum + Number(e.value), 0);
        const totalLiabilities = latestEntries
          .filter((e) => e.net_worth_items?.type === 'liability')
          .reduce((sum, e) => sum + Number(e.value), 0);
        setNetWorthData({ totalAssets, totalLiabilities });
      }

      setLoading(false);
    }

    load();
  }, [user, householdId]);

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  const challengeDay = goals ? getDayOfChallenge(goals.challenge_start_date) : null;
  const netWorth = netWorthData ? netWorthData.totalAssets - netWorthData.totalLiabilities : 0;
  const totalWeeklyBudget = weekBudgetSummary.reduce((sum, s) => sum + s.category.monthly_amount / 4.333, 0);
  const totalWeeklySpent = weekBudgetSummary.reduce((sum, s) => sum + s.spent, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        {challengeDay && goals && (
          <div className="bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg font-medium text-sm">
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
              {todayEntry.weight_lbs && (
                <MetricRow label="Weight" value={`${todayEntry.weight_lbs} lbs`} icon={<Scale size={14} />} />
              )}
              {todayEntry.body_fat_pct && (
                <MetricRow label="Body Fat" value={`${todayEntry.body_fat_pct}%`} />
              )}
              <MetricRow label="Calories Burned" value={todayEntry.calories_burned?.toLocaleString() ?? '—'} color={goals ? getStatusColor(todayEntry.calories_burned, goals.calories_burned_min) : undefined} />
              <MetricRow label="Carbs" value={todayEntry.carbs_g ? `${todayEntry.carbs_g}g` : '—'} color={goals ? getStatusColor(todayEntry.carbs_g, goals.carbs_min, goals.carbs_max) : undefined} />
              <MetricRow label="Fat" value={todayEntry.fat_g ? `${todayEntry.fat_g}g` : '—'} color={goals ? getStatusColor(todayEntry.fat_g, goals.fat_min, goals.fat_max) : undefined} />
              <MetricRow label="Fiber" value={todayEntry.fiber_g ? `${todayEntry.fiber_g}g` : '—'} color={goals ? getStatusColor(todayEntry.fiber_g, goals.fiber_min, goals.fiber_max) : undefined} />
              <MetricRow label="Workout" value={todayEntry.workout ? 'Yes' : 'No'} color={todayEntry.workout ? 'text-emerald-400' : 'text-zinc-400'} />
              <MetricRow label="Mobility" value={todayEntry.mobility ? 'Done' : 'Not yet'} color={todayEntry.mobility ? 'text-emerald-400' : 'text-zinc-400'} />
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
          {weekBudgetSummary.length > 0 ? (
            <div className="space-y-3">
              {weekBudgetSummary.map((s) => (
                <BudgetRow
                  key={s.category.id}
                  label={s.category.name}
                  actual={s.spent}
                  target={Math.round(s.category.monthly_amount / 4.333)}
                />
              ))}
              <div className="pt-3 border-t border-zinc-800 flex justify-between font-medium">
                <span className="text-zinc-300">Total</span>
                <span className={cn(totalWeeklySpent <= totalWeeklyBudget ? 'text-emerald-400' : 'text-red-400')}>
                  {formatCurrency(totalWeeklySpent)} / {formatCurrency(Math.round(totalWeeklyBudget))}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">No budget categories set up. <a href="/finances" className="text-blue-400 hover:underline">Set up now</a></p>
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
          {netWorthData ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-sm text-zinc-400">Total Assets</p>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(netWorthData.totalAssets)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-zinc-400">Total Liabilities</p>
                <p className="text-xl font-bold text-red-400">{formatCurrency(netWorthData.totalLiabilities)}</p>
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

function MetricRow({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-zinc-400 flex items-center gap-1.5">{icon}{label}</span>
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
