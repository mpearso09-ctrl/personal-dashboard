'use client';

import { useState, useEffect, useCallback } from 'react';

import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrencyDecimal } from '@/lib/utils';
import type { Investment } from '@/lib/types';

import { TIER_LABELS, TIER_TARGETS } from '@/lib/types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PieChart as PieIcon, Plus, Loader2 } from 'lucide-react';
import { DEFAULT_HOLDINGS, TIER_COLORS } from './shared';

export function InvestmentsTab({
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
                className="flex items-center gap-2 bg-zinc-800 rounded-lg p-3"
              >
                <div className="w-12 text-sm font-mono font-semibold text-white shrink-0">
                  {h.symbol}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="number"
                    inputMode="decimal"
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
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  />
                </div>
                <div className="hidden sm:block text-xs text-zinc-500 w-20 text-right shrink-0">
                  Target: {h.target_pct}%
                </div>
                <div className="text-xs text-zinc-400 w-12 text-right shrink-0">
                  {totalValue > 0
                    ? ((h.current_value_cad / totalValue) * 100).toFixed(1) + '%'
                    : '0%'}
                </div>
                {savingId === h.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
