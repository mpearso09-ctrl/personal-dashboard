'use client';

import { useState, useEffect, useCallback } from 'react';

import { createClient } from '@/lib/supabase-browser';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrencyDecimal, formatDate, getToday, cn } from '@/lib/utils';
import type { Reimbursement } from '@/lib/types';

import { Receipt, Plus, Check, X, Loader2 } from 'lucide-react';
import { InputField } from './shared';

export function ReimbursementsTab({
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
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [form, setForm] = useState({
    date: getToday(),
    amount: 0,
    reason: '',
    notes: '',
    paid: false,
  });

  const loadReimbursements = useCallback(async () => {
    const { data } = await supabase
      .from('reimbursements')
      .select('*')
      .eq('household_id', householdId)
      .order('date', { ascending: false });
    if (data) setReimbursements(data);
  }, [householdId]);

  useEffect(() => {
    loadReimbursements();
  }, [loadReimbursements]);

  const handleAdd = async () => {
    if (!form.reason || form.amount <= 0) return;
    setSaving(true);
    await supabase.from('reimbursements').insert({
      user_id: userId,
      household_id: householdId,
      date: form.date,
      amount: form.amount,
      reason: form.reason,
      notes: form.notes || null,
      paid: form.paid,
    });
    setForm({ date: getToday(), amount: 0, reason: '', notes: '', paid: false });
    await loadReimbursements();
    setSaving(false);
  };

  const togglePaid = async (id: string, currentPaid: boolean) => {
    await supabase.from('reimbursements').update({ paid: !currentPaid }).eq('id', id);
    await loadReimbursements();
  };

  const totalOutstanding = reimbursements
    .filter((r) => !r.paid)
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      {/* Outstanding total */}
      <Card className="border-amber-600/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-400">Total Outstanding</div>
            <div className="text-3xl font-bold text-amber-400">
              {formatCurrencyDecimal(totalOutstanding)}
            </div>
          </div>
          <Receipt className="w-10 h-10 text-amber-400/30" />
        </div>
      </Card>

      {/* Entry form */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>New Reimbursement</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <InputField
              label="Date"
              type="date"
              value={form.date}
              onChange={(v) => setForm((f) => ({ ...f, date: v }))}
            />
            <InputField
              label="Amount ($)"
              value={form.amount}
              step="0.01"
              onChange={(v) => setForm((f) => ({ ...f, amount: parseFloat(v) || 0 }))}
            />
            <InputField
              label="Reason"
              type="text"
              value={form.reason}
              onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
              className="col-span-2 sm:col-span-1"
            />
            <InputField
              label="Notes"
              type="text"
              value={form.notes}
              placeholder="Optional"
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.paid}
                onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))}
                className="rounded bg-zinc-800 border-zinc-700"
              />
              Already paid
            </label>
            <button
              onClick={handleAdd}
              disabled={saving || !form.reason || form.amount <= 0}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add
            </button>
          </div>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>All Reimbursements</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {reimbursements.map((r) => (
            <div
              key={r.id}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg',
                r.paid ? 'bg-zinc-800/50' : 'bg-zinc-800'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      r.paid ? 'text-zinc-500 line-through' : 'text-white'
                    )}
                  >
                    {r.reason}
                  </span>
                  {r.paid && (
                    <span className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full">
                      Paid
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {formatDate(r.date)}
                  {r.notes && <> &middot; {r.notes}</>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    r.paid ? 'text-zinc-500' : 'text-amber-400'
                  )}
                >
                  {formatCurrencyDecimal(r.amount)}
                </span>
                {canEdit && (
                  <button
                    onClick={() => togglePaid(r.id, r.paid)}
                    className={cn(
                      'p-2.5 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center',
                      r.paid
                        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-400'
                        : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400'
                    )}
                    title={r.paid ? 'Mark unpaid' : 'Mark paid'}
                  >
                    {r.paid ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}
          {reimbursements.length === 0 && (
            <div className="text-center text-zinc-500 py-8">No reimbursements yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
