'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import {
  dayTotals,
  formatMacro,
  macroStatus,
  normalizeItem,
  normalizeSettings,
  nutritionQueryMessage,
  type NutritionItem,
  type NutritionSettings,
  type NutritionTotal,
} from '@/lib/nutrition';
import { cn, latestTimestamp } from '@/lib/utils';
import { UpdatedAgo } from '@/components/updated-ago';

export function NutritionSummary({ userId, date, compact = false }: { userId: string; date: string; compact?: boolean }) {
  const supabase = createClient();
  const [items, setItems] = useState<NutritionItem[] | null>(null);
  const [settings, setSettings] = useState<NutritionSettings | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    async function load() {
      const [itemRes, settingRes] = await Promise.all([
        supabase.from('nutrition_items').select('*').eq('user_id', userId).eq('date', date).order('created_at'),
        supabase.from('nutrition_settings').select('tracked, targets').eq('user_id', userId).maybeSingle(),
      ]);
      if (cancel) return;
      const loadError = nutritionQueryMessage([itemRes.error, settingRes.error]);
      if (loadError) {
        setError(loadError);
        setItems([]);
        setUpdatedAt(null);
        setSettings(normalizeSettings(null));
        return;
      }
      setError('');
      const rows = (itemRes.data ?? []) as Record<string, unknown>[];
      setItems(rows.map(normalizeItem));
      setUpdatedAt(latestTimestamp(rows.map((row) => {
        const updated = typeof row.updated_at === 'string' ? row.updated_at : null;
        const created = typeof row.created_at === 'string' ? row.created_at : null;
        return updated ?? created;
      })));
      setSettings(normalizeSettings(settingRes.data));
    }
    load();
    return () => { cancel = true; };
  }, [userId, date]);

  const totals = items && settings ? dayTotals(items, settings) : [];

  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-xl', compact ? 'p-4' : 'p-5')}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Today&apos;s food</h2>
          <UpdatedAgo at={updatedAt} />
        </div>
        <Link href="/nutrition" className="text-sm text-blue-400 hover:text-blue-300">Log food</Link>
      </div>
      {items == null ? (
        <p className="text-sm text-zinc-500">Loading food log…</p>
      ) : error ? (
        <p className="text-sm text-zinc-500">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing logged for this day. Tell the food log what you ate.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {totals.map((total) => <Total key={total.key} total={total} />)}
        </div>
      )}
    </div>
  );
}

function Total({ total }: { total: NutritionTotal }) {
  const status = macroStatus(total);
  const width = total.target && total.value != null
    ? Math.min(100, Math.round((total.value / total.target) * 100))
    : null;
  return (
    <div>
      <div className="text-xs text-zinc-500">{total.label}</div>
      <div className={cn('text-sm font-medium', status === 'off' ? 'text-amber-300' : 'text-white')}>
        {formatMacro(total.key, total.value)}
        {total.target != null && <span className="text-zinc-500 font-normal"> / {formatMacro(total.key, total.target)}</span>}
        <span className="text-zinc-500 font-normal"> {total.unit}</span>
      </div>
      {width != null && (
        <div className="mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
          <div className={cn('h-full', status === 'off' ? 'bg-amber-400' : 'bg-emerald-500')} style={{ width: `${width}%` }} />
        </div>
      )}
    </div>
  );
}
