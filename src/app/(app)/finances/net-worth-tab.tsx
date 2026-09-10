'use client';

import { useState, useEffect, useCallback } from 'react';

import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getToday, cn } from '@/lib/utils';
import type { NetWorthItem, NetWorthEntry } from '@/lib/types';

import { DEFAULT_NET_WORTH_ASSETS, DEFAULT_NET_WORTH_LIABILITIES } from '@/lib/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Plus, Check, X, Trash2, Settings } from 'lucide-react';
import { InlineEdit, InputField, SaveButton, getMonthStart } from './shared';

export function NetWorthTab({
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
                      className="p-2.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(item.id)}
                    className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
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
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 sm:gap-4">
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
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors min-h-[44px] px-2"
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
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors min-h-[44px]"
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                </select>
              </div>
              <button
                onClick={addItem}
                disabled={!newItemName.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
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
