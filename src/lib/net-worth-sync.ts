import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils';
import { fetchUsdCadRate, toCad } from '@/lib/fx';

// Net Worth "Cash + Investments" is filled automatically from the daily account
// balances: for each month, the last balance of every personal account (business
// accounts have their own Net Worth line), USD converted to CAD at today's rate.
// Months before AUTO_FROM keep the values entered by hand.
export const CASH_INV_ITEM_NAME = 'Cash + Investments';
export const CASH_INV_AUTO_FROM = '2026-09-01';

function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
}

export async function syncCashInvestments(
  supabase: SupabaseClient,
  householdId: string,
  userId: string
): Promise<void> {
  try {
    const { data: item } = await supabase
      .from('net_worth_items')
      .select('id')
      .eq('household_id', householdId)
      .eq('name', CASH_INV_ITEM_NAME)
      .maybeSingle();
    if (!item) return;

    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, currency, scope')
      .eq('household_id', householdId)
      .eq('scope', 'personal');
    if (!accounts?.length) return;
    const currency: Record<string, string> = {};
    accounts.forEach((a) => { currency[a.id] = a.currency ?? 'CAD'; });

    const balances = await fetchAllRows<{ account_id: string; date: string; balance: number }>((from, to) =>
      supabase
        .from('account_balances')
        .select('account_id, date, balance')
        .in('account_id', accounts.map((a) => a.id))
        .gte('date', CASH_INV_AUTO_FROM)
        .order('date')
        .range(from, to)
    );
    if (!balances.length) return;

    const { rate } = await fetchUsdCadRate();
    const today = new Date().toISOString().slice(0, 10);
    const rows: { user_id: string; household_id: string; item_id: string; month: string; value: number }[] = [];
    for (let m = CASH_INV_AUTO_FROM; m <= today; m = nextMonth(m)) {
      const end = nextMonth(m);
      const last: Record<string, number> = {};
      for (const b of balances) {
        if (b.date < end) last[b.account_id] = Number(b.balance); // ordered by date, so the last one wins
      }
      if (!balances.some((b) => b.date >= m && b.date < end)) continue;
      const value = Object.entries(last).reduce(
        (s, [id, bal]) => s + toCad(bal, (currency[id] ?? 'CAD') as 'CAD' | 'USD', rate),
        0
      );
      rows.push({ user_id: userId, household_id: householdId, item_id: item.id, month: m, value: Math.round(value * 100) / 100 });
    }
    if (rows.length) {
      await supabase.from('net_worth_entries').upsert(rows, { onConflict: 'household_id,item_id,month' });
    }
  } catch {
    // Best effort: the Net Worth screen still works with the last saved values.
  }
}
