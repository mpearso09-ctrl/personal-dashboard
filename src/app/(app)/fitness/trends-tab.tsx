'use client';

import type { FitnessDaily, FitnessGoals } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Flame } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine, Cell, Legend } from 'recharts';
import { movingAvg, shortDate, totalDrinks, type NumField } from './fitness-lib';

type Streak = { label: string; current: number; best: number };

export function TrendsTab({ rangeData, goals, streaks, range, setRange }: {
  rangeData: FitnessDaily[]; goals: FitnessGoals | null; streaks: Streak[];
  range: 30 | 60 | 90; setRange: (r: 30 | 60 | 90) => void;
}) {
  const tooltipStyle = { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 };
  const axis = { stroke: '#52525b', fontSize: 11 };

  const render = () => {
    const series = (f: NumField) => movingAvg(rangeData.filter((d) => d[f] != null).map((d) => ({ date: d.date, v: d[f] as number })));
    const weight = series('weight_lbs'), bf = series('body_fat_pct'), vf = series('visceral_fat_pct');
    const balance = rangeData.filter((d) => d.calories_burned != null && d.calories_consumed != null)
      .map((d) => ({ date: d.date, v: (d.calories_burned as number) - (d.calories_consumed as number) }));
    const nutrition = rangeData.map((d) => ({ date: d.date, protein: d.protein_g, fiber: d.fiber_g }));
    const steps = rangeData.filter((d) => d.steps != null).map((d) => ({ date: d.date, v: d.steps as number }));
    const sleep = rangeData.filter((d) => d.sleep_hours != null).map((d) => ({ date: d.date, v: d.sleep_hours as number }));
    // alcohol by ISO week
    const weeks = new Map<string, { wine: number; beer: number; spirits: number; dry: number; logged: number }>();
    rangeData.forEach((d) => {
      const dt = new Date(d.date + 'T00:00:00'); const dow = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - dow);
      const k = dt.toISOString().split('T')[0];
      const w = weeks.get(k) ?? { wine: 0, beer: 0, spirits: 0, dry: 0, logged: 0 };
      w.wine += d.drinks_wine ?? 0; w.beer += d.drinks_beer ?? 0; w.spirits += d.drinks_spirits ?? 0; w.logged++; if (totalDrinks(d) === 0) w.dry++;
      weeks.set(k, w);
    });
    const alcohol = [...weeks.entries()].sort().map(([k, w]) => ({ week: shortDate(k), ...w }));
    const dryStreak = streaks.find((s) => s.label === 'Dry Days');

    const Chart = ({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) => (
      <Card className="p-4">
        <div className="text-sm font-medium text-white mb-2">{title}</div>
        {empty ? <p className="text-zinc-500 text-sm py-8 text-center">No data in range</p> : <div className="h-52">{children}</div>}
      </Card>
    );

    return (
      <div className="space-y-4">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
          {([30, 60, 90] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={cn('px-4 h-9 rounded-lg text-sm font-medium', range === r ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white')}>{r}d</button>
          ))}
        </div>

        <Chart title="Weight & Body Fat (7-day avg)" empty={!weight.length && !bf.length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weight.map((w) => ({ date: w.date, weight: w.v, weightMa: w.ma, bf: bf.find((b) => b.date === w.date)?.v ?? null }))} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={30} />
              <YAxis yAxisId="w" domain={['auto', 'auto']} {...axis} />
              <YAxis yAxisId="bf" orientation="right" domain={['auto', 'auto']} {...axis} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => formatDate(String(v))} />
              {goals && <ReferenceLine yAxisId="w" y={goals.goal_weight} stroke="#10b981" strokeDasharray="4 4" />}
              <Line yAxisId="w" type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={1} dot={false} name="Weight" opacity={0.5} />
              <Line yAxisId="w" type="monotone" dataKey="weightMa" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="Weight 7d" />
              <Line yAxisId="bf" type="monotone" dataKey="bf" stroke="#f59e0b" strokeWidth={2} dot={false} name="Body Fat %" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Visceral Fat %" empty={!vf.length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={vf} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={30} />
              <YAxis domain={['auto', 'auto']} {...axis} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => formatDate(String(v))} />
              {goals?.goal_visceral_fat != null && <ReferenceLine y={goals.goal_visceral_fat} stroke="#10b981" strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="v" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 2 }} name="Visceral %" />
            </LineChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Calorie Balance (burned − consumed)" empty={!balance.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={balance} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={30} />
              <YAxis {...axis} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => formatDate(String(v))} />
              <ReferenceLine y={0} stroke="#52525b" />
              <Bar dataKey="v" name="Balance" radius={[3, 3, 0, 0]}>{balance.map((b) => <Cell key={b.date} fill={b.v >= 0 ? '#10b981' : '#ef4444'} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        <Chart title="Protein & Fiber" empty={!nutrition.some((n) => n.protein != null || n.fiber != null)}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={nutrition} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={30} />
              <YAxis yAxisId="p" {...axis} /><YAxis yAxisId="f" orientation="right" {...axis} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => formatDate(String(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {goals && <ReferenceLine yAxisId="p" y={goals.protein_min} stroke="#ef4444" strokeDasharray="4 4" />}
              {goals && <ReferenceLine yAxisId="f" y={goals.fiber_min} stroke="#10b981" strokeDasharray="4 4" />}
              <Line yAxisId="p" type="monotone" dataKey="protein" stroke="#ef4444" strokeWidth={2} dot={false} name="Protein g" connectNulls />
              <Line yAxisId="f" type="monotone" dataKey="fiber" stroke="#10b981" strokeWidth={2} dot={false} name="Fiber g" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Chart>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Chart title="Steps" empty={!steps.length}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={steps} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={30} /><YAxis {...axis} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => formatDate(String(v))} />
                {goals && <ReferenceLine y={goals.steps_min} stroke="#10b981" strokeDasharray="4 4" />}
                <Bar dataKey="v" name="Steps" radius={[3, 3, 0, 0]}>{steps.map((s) => <Cell key={s.date} fill={goals && s.v >= goals.steps_min ? '#10b981' : '#3b82f6'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Chart>
          <Chart title="Sleep" empty={!sleep.length}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sleep} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} {...axis} minTickGap={30} /><YAxis domain={[0, 10]} {...axis} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => formatDate(String(v))} />
                {goals && <ReferenceLine y={goals.sleep_min} stroke="#10b981" strokeDasharray="4 4" />}
                <Bar dataKey="v" name="Hours" radius={[3, 3, 0, 0]}>{sleep.map((s) => <Cell key={s.date} fill={goals && s.v >= goals.sleep_min ? '#10b981' : '#6366f1'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Chart>
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-white">Alcohol by Week</div>
            {dryStreak && <span className="text-xs text-emerald-400 flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-orange-400" />{dryStreak.current}-day dry streak</span>}
          </div>
          {!alcohol.length ? <p className="text-zinc-500 text-sm py-8 text-center">No data in range</p> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={alcohol} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="week" {...axis} /><YAxis {...axis} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="wine" stackId="a" fill="#f43f5e" name="Wine" />
                  <Bar dataKey="beer" stackId="a" fill="#f59e0b" name="Beer" />
                  <Bar dataKey="spirits" stackId="a" fill="#0ea5e9" name="Spirits" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    );
  };

  return render();
}
