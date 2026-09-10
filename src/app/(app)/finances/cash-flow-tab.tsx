'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrencyDecimal, formatDate, getToday, cn, fetchAllRows } from '@/lib/utils';
import type { Account, AccountCurrency, AccountType, AccountScope, AccountBalance } from '@/lib/types';
import { useUsdCad, convert, toCad } from '@/lib/fx';
import { DEFAULT_ACCOUNTS, ACCOUNT_TYPE_LABELS, ACCOUNT_SCOPE_LABELS } from '@/lib/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Plus, Check, X, Trash2, Settings } from 'lucide-react';
import { CashView, CashViewToggle, InlineEdit, InputField, SCOPE_COLORS, SaveButton, TYPE_COLORS, TrendRow, getDaysAgo, getYesterday } from './shared';

export function CashFlowTab({
  userId,
  householdId,
  canEdit,
}: {
  userId: string;
  householdId: string;
  canEdit: boolean;
}) {
  const supabase = createClient();
  const fx = useUsdCad();
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [date, setDate] = useState(getToday());
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [todayBalances, setTodayBalances] = useState<Record<string, number>>({});
  const [yesterdayBalances, setYesterdayBalances] = useState<Record<string, number>>({});
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [newAccount, setNewAccount] = useState<{
    name: string;
    currency: AccountCurrency;
    account_type: AccountType;
    scope: AccountScope;
  }>({ name: '', currency: 'CAD', account_type: 'chequing', scope: 'personal' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // Per-balance display currency override (defaults to the account's native currency)
  const [displayCcy, setDisplayCcy] = useState<Record<string, AccountCurrency>>({});
  const [cashView, setCashView] = useState<CashView>('total');

  const loadAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order');
    if (data) setAccounts(data);
  }, [householdId]);

  const loadBalancesForDate = useCallback(
    async (d: string) => {
      const { data } = await supabase
        .from('account_balances')
        .select('*')
        .eq('household_id', householdId)
        .eq('date', d);
      if (data) {
        const bals: Record<string, number> = {};
        data.forEach((b: AccountBalance) => {
          bals[b.account_id] = b.balance;
        });
        return bals;
      }
      return {};
    },
    [householdId]
  );

  const loadDashboardData = useCallback(async () => {
    const today = getToday();
    const yesterday = getYesterday();
    const tBals = await loadBalancesForDate(today);
    const yBals = await loadBalancesForDate(yesterday);
    setTodayBalances(tBals);
    setYesterdayBalances(yBals);
  }, [loadBalancesForDate]);

  const loadTrendData = useCallback(async () => {
    const ninetyDaysAgo = getDaysAgo(90);
    // 90 days × all accounts can exceed Supabase's 1000-row cap — page through it
    const rows = await fetchAllRows<TrendRow>((from, to) =>
      supabase
        .from('account_balances')
        .select('*, accounts(name,currency,scope,account_type)')
        .eq('household_id', householdId)
        .gte('date', ninetyDaysAgo)
        .order('date')
        .order('id')
        .range(from, to)
    );
    setTrendRows(rows);
  }, [householdId]);

  const loadFormBalances = useCallback(async () => {
    const bals = await loadBalancesForDate(date);
    setBalances(bals);
  }, [date, loadBalancesForDate]);

  const loadAll = useCallback(async () => {
    await loadAccounts();
    await loadFormBalances();
    await loadDashboardData();
    await loadTrendData();
  }, [loadAccounts, loadFormBalances, loadDashboardData, loadTrendData]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadFormBalances();
  }, [date, loadFormBalances]);

  const handleSave = async () => {
    setSaving(true);
    for (const acc of accounts) {
      const balance = balances[acc.id];
      if (balance !== undefined) {
        await supabase.from('account_balances').upsert(
          {
            user_id: userId,
            household_id: householdId,
            account_id: acc.id,
            date,
            balance,
          },
          { onConflict: 'household_id,account_id,date' }
        );
      }
    }
    await loadAll();
    setSaving(false);
  };

  const addAccount = async () => {
    if (!newAccount.name.trim()) return;
    await supabase.from('accounts').insert({
      user_id: userId,
      household_id: householdId,
      name: newAccount.name.trim(),
      sort_order: accounts.length,
      currency: newAccount.currency,
      account_type: newAccount.account_type,
      scope: newAccount.scope,
    });
    setNewAccount({ name: '', currency: 'CAD', account_type: 'chequing', scope: 'personal' });
    await loadAccounts();
  };

  const deleteAccount = async (accId: string) => {
    await supabase.from('accounts').delete().eq('id', accId);
    setDeleteConfirm(null);
    await loadAll();
  };

  const seedDefaults = async () => {
    const rows = DEFAULT_ACCOUNTS.map((acc, i) => ({
      user_id: userId,
      household_id: householdId,
      name: acc.name,
      sort_order: i,
      currency: acc.currency,
      account_type: acc.account_type,
      scope: acc.scope,
    }));
    await supabase.from('accounts').insert(rows);
    await loadAll();
  };

  const updateAccount = async (accId: string, patch: Partial<Account>) => {
    await supabase.from('accounts').update(patch).eq('id', accId);
    await loadAll();
  };

  // ── Derived (all totals converted to CAD) ──

  const balCad = useCallback(
    (acc: Account, bals: Record<string, number>) => toCad(bals[acc.id] || 0, acc.currency, fx.rate),
    [fx.rate]
  );

  const totalTodayCad = accounts.reduce((s, a) => s + balCad(a, todayBalances), 0);

  const subtotals = useMemo(() => {
    const byScope: Record<AccountScope, number> = { business: 0, personal: 0 };
    const byType: Record<AccountType, number> = { chequing: 0, savings: 0, investments: 0 };
    const byScopeType: Record<AccountScope, Record<AccountType, number>> = {
      business: { chequing: 0, savings: 0, investments: 0 },
      personal: { chequing: 0, savings: 0, investments: 0 },
    };
    for (const acc of accounts) {
      const v = balCad(acc, todayBalances);
      byScope[acc.scope] += v;
      byType[acc.account_type] += v;
      byScopeType[acc.scope][acc.account_type] += v;
    }
    return { byScope, byType, byScopeType };
  }, [accounts, todayBalances, balCad]);

  // Accounts shown in the balances grid / individual trends for the selected view
  const visibleAccounts = useMemo(
    () => (cashView === 'personal' || cashView === 'business' ? accounts.filter((a) => a.scope === cashView) : accounts),
    [accounts, cashView]
  );

  // Trend chart data — all values in CAD, with scope/type breakouts
  const trendData = useMemo(() => {
    const byDate: Record<
      string,
      { total: number; business: number; personal: number; chequing: number; savings: number; investments: number; perAccount: Record<string, number> }
    > = {};
    for (const b of trendRows) {
      const meta = b.accounts;
      const cad = toCad(Number(b.balance), meta?.currency ?? 'CAD', fx.rate);
      if (!byDate[b.date]) {
        byDate[b.date] = { total: 0, business: 0, personal: 0, chequing: 0, savings: 0, investments: 0, perAccount: {} };
      }
      const d = byDate[b.date];
      d.total += cad;
      d[meta?.scope ?? 'personal'] += cad;
      d[meta?.account_type ?? 'chequing'] += cad;
      d.perAccount[meta?.name ?? b.account_id] = cad;
      const stKey = `${meta?.scope ?? 'personal'}:${meta?.account_type ?? 'chequing'}`;
      d.perAccount[stKey] = (d.perAccount[stKey] ?? 0) + cad;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => ({
        date: d,
        total: v.total,
        Business: v.business,
        Personal: v.personal,
        Chequing: v.chequing,
        Savings: v.savings,
        Investments: v.investments,
        ...v.perAccount,
      })) as (Record<string, unknown> & { date: string })[];
  }, [trendRows, fx.rate]);

  const accountNames = visibleAccounts.map((a) => a.name);

  const lineColors = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ef4444',
    '#06b6d4',
    '#f97316',
    '#ec4899',
  ];

  const trendLines: { key: string; name: string; color: string }[] =
    cashView === 'personal' || cashView === 'business'
      ? [
          { key: cashView === 'personal' ? 'Personal' : 'Business', name: `${cashView === 'personal' ? 'Personal' : 'Business'} total`, color: SCOPE_COLORS[cashView] },
          { key: `${cashView}:chequing`, name: 'Chequing', color: TYPE_COLORS.chequing },
          { key: `${cashView}:savings`, name: 'Savings', color: TYPE_COLORS.savings },
          { key: `${cashView}:investments`, name: 'Investments', color: TYPE_COLORS.investments },
        ]
      : cashView === 'type'
        ? [
            { key: 'Chequing', name: 'Chequing', color: TYPE_COLORS.chequing },
            { key: 'Savings', name: 'Savings', color: TYPE_COLORS.savings },
            { key: 'Investments', name: 'Investments', color: TYPE_COLORS.investments },
          ]
        : [{ key: 'total', name: 'Total Cash', color: '#3b82f6' }];

  const fxNote = `USD→CAD ${fx.rate.toFixed(4)}${fx.isLive ? ' · live' : fx.asOf ? ` · as of ${fx.asOf}` : ' · offline default'}`;

  const selectCls =
    'px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-xs text-white focus:outline-none focus:border-blue-500';

  return (
    <div className="space-y-6">
      {/* Settings toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors min-h-[44px] px-2"
        >
          <Settings className="w-4 h-4" />
          {showSettings ? 'Hide Settings' : 'Manage Accounts'}
        </button>
      </div>

      {/* Account management */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>

          {accounts.length === 0 && (
            <div className="text-center py-6">
              <p className="text-zinc-400 mb-4">No accounts yet.</p>
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

          {accounts.length > 0 && (
            <div className="space-y-2 mb-4">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex flex-wrap items-center justify-between gap-2 bg-zinc-800 rounded-lg p-3"
                >
                  <InlineEdit
                    value={acc.name}
                    onSave={(v) => updateAccount(acc.id, { name: v })}
                    className="text-sm font-medium text-white"
                    disabled={!canEdit}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {canEdit ? (
                      <>
                        <select
                          value={acc.scope}
                          onChange={(e) => updateAccount(acc.id, { scope: e.target.value as AccountScope })}
                          className={selectCls}
                        >
                          {Object.entries(ACCOUNT_SCOPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                        <select
                          value={acc.account_type}
                          onChange={(e) => updateAccount(acc.id, { account_type: e.target.value as AccountType })}
                          className={selectCls}
                        >
                          {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                        <select
                          value={acc.currency}
                          onChange={(e) => updateAccount(acc.id, { currency: e.target.value as AccountCurrency })}
                          className={selectCls}
                        >
                          <option value="CAD">CAD</option>
                          <option value="USD">USD</option>
                        </select>
                      </>
                    ) : (
                      <span className="text-xs text-zinc-400">
                        {ACCOUNT_SCOPE_LABELS[acc.scope]} · {ACCOUNT_TYPE_LABELS[acc.account_type]} · {acc.currency}
                      </span>
                    )}
                    {canEdit && (
                      <>
                        {deleteConfirm === acc.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400">Delete?</span>
                            <button
                              onClick={() => deleteAccount(acc.id)}
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
                            onClick={() => setDeleteConfirm(acc.id)}
                            className="p-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-zinc-800">
              <InputField
                label="Account Name"
                type="text"
                value={newAccount.name}
                onChange={(v) => setNewAccount((a) => ({ ...a, name: v }))}
                placeholder="e.g. Savings Account"
                className="flex-1 min-w-[180px]"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Owner</label>
                <select
                  value={newAccount.scope}
                  onChange={(e) => setNewAccount((a) => ({ ...a, scope: e.target.value as AccountScope }))}
                  className={cn(selectCls, 'py-2.5 min-h-[44px]')}
                >
                  {Object.entries(ACCOUNT_SCOPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Type</label>
                <select
                  value={newAccount.account_type}
                  onChange={(e) => setNewAccount((a) => ({ ...a, account_type: e.target.value as AccountType }))}
                  className={cn(selectCls, 'py-2.5 min-h-[44px]')}
                >
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Currency</label>
                <select
                  value={newAccount.currency}
                  onChange={(e) => setNewAccount((a) => ({ ...a, currency: e.target.value as AccountCurrency }))}
                  className={cn(selectCls, 'py-2.5 min-h-[44px]')}
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <button
                onClick={addAccount}
                disabled={!newAccount.name.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Daily balance entry */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily Balance Entry</CardTitle>
          </CardHeader>
          <div className="mb-4">
            <InputField
              label="Date"
              type="date"
              value={date}
              onChange={setDate}
              className="w-48"
              disabled={!canEdit}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {accounts.map((acc) => (
              <InputField
                key={acc.id}
                label={acc.currency === 'USD' ? `${acc.name} (USD)` : acc.name}
                value={balances[acc.id] ?? ''}
                step="0.01"
                placeholder="0.00"
                disabled={!canEdit}
                onChange={(v) =>
                  setBalances((b) => ({ ...b, [acc.id]: parseFloat(v) || 0 }))
                }
              />
            ))}
          </div>
          {canEdit && (
            <div className="mt-4 flex justify-end">
              <SaveButton saving={saving} onClick={handleSave} />
            </div>
          )}
        </Card>
      )}

      {/* Dashboard: Account balances */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>Account Balances</span>
              <span className="text-xs font-normal text-zinc-500">{fxNote}</span>
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
            {visibleAccounts.map((acc) => {
              const shown = displayCcy[acc.id] ?? acc.currency;
              const today = convert(todayBalances[acc.id] || 0, acc.currency, shown, fx.rate);
              const yesterday = convert(yesterdayBalances[acc.id] || 0, acc.currency, shown, fx.rate);
              const change = today - yesterday;
              return (
                <div key={acc.id} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="text-xs text-zinc-400 truncate">{acc.name}</div>
                    <div className="flex rounded-md bg-zinc-900 p-0.5 shrink-0">
                      {(['CAD', 'USD'] as const).map((c) => (
                        <button
                          key={c}
                          onClick={() => setDisplayCcy((d) => ({ ...d, [acc.id]: c }))}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                            shown === c ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-white'
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-white">
                    {formatCurrencyDecimal(today)}
                    {shown !== acc.currency && (
                      <span className="text-[10px] font-normal text-zinc-500 ml-1">
                        ≈ from {acc.currency}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Yesterday: {formatCurrencyDecimal(yesterday)}
                  </div>
                  {change !== 0 && (
                    <div
                      className={cn(
                        'text-sm font-medium mt-1',
                        change > 0 ? 'text-emerald-400' : 'text-red-400'
                      )}
                    >
                      {change > 0 ? '+' : ''}
                      {formatCurrencyDecimal(change)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total liquid cash (always CAD) */}
          <div className="bg-zinc-800 border border-blue-600/30 rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="text-sm text-zinc-400">Total Liquid Cash (CAD)</div>
              <CashViewToggle view={cashView} onChange={setCashView} />
            </div>
            {cashView === 'total' && (
              <div className="text-3xl font-bold text-white">
                {formatCurrencyDecimal(totalTodayCad)}
              </div>
            )}
            {(cashView === 'personal' || cashView === 'business') && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">{cashView === 'personal' ? 'Personal' : 'Business'} total</div>
                  <div className="text-xl font-bold" style={{ color: SCOPE_COLORS[cashView] }}>
                    {formatCurrencyDecimal(subtotals.byScope[cashView])}
                  </div>
                </div>
                {(['chequing', 'savings', 'investments'] as const).map((t) => (
                  <div key={t}>
                    <div className="text-xs text-zinc-500 mb-0.5">{ACCOUNT_TYPE_LABELS[t]}</div>
                    <div className="text-xl font-bold" style={{ color: TYPE_COLORS[t] }}>
                      {formatCurrencyDecimal(subtotals.byScopeType[cashView][t])}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {cashView === 'type' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Chequing</div>
                  <div className="text-xl font-bold" style={{ color: TYPE_COLORS.chequing }}>
                    {formatCurrencyDecimal(subtotals.byType.chequing)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Savings</div>
                  <div className="text-xl font-bold" style={{ color: TYPE_COLORS.savings }}>
                    {formatCurrencyDecimal(subtotals.byType.savings)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Investments</div>
                  <div className="text-xl font-bold" style={{ color: TYPE_COLORS.investments }}>
                    {formatCurrencyDecimal(subtotals.byType.investments)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-0.5">Total</div>
                  <div className="text-xl font-bold text-white">
                    {formatCurrencyDecimal(totalTodayCad)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Total Cash Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>Total Cash Trend (Last 90 Days, CAD)</span>
              <CashViewToggle view={cashView} onChange={setCashView} />
            </CardTitle>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => v.slice(5)}
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
                  formatter={(value) => [formatCurrencyDecimal(Number(value))]}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                {trendLines.length > 1 && <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />}
                {trendLines.map((l) => (
                  <Line
                    key={l.key}
                    type="monotone"
                    dataKey={l.key}
                    name={l.name}
                    stroke={l.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Individual Account Trends */}
      {trendData.length > 1 && accountNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Individual Account Trends (Last 90 Days, CAD)</CardTitle>
          </CardHeader>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={{ stroke: '#3f3f46' }}
                  tickLine={false}
                  tickFormatter={(v) => v.slice(5)}
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
                  formatter={(value) => [formatCurrencyDecimal(Number(value))]}
                  labelFormatter={(label) => formatDate(String(label))}
                />
                <Legend wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }} />
                {accountNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={lineColors[i % lineColors.length]}
                    strokeWidth={1.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
