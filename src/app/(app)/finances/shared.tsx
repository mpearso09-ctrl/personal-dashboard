'use client';

import { useState } from 'react';
import { cn, getToday } from '@/lib/utils';
import type {
  BudgetCategory,
  AccountCurrency,
  AccountType,
  AccountScope,
  AccountBalance,
  Investment,
} from '@/lib/types';
import { Save, Loader2 } from 'lucide-react';

export const TIER_COLORS: Record<Investment['tier'], string> = {
  growth_engine: '#3b82f6',
  innovation_satellite: '#8b5cf6',
  stability_liquidity: '#10b981',
  asymmetric_upside: '#f59e0b',
};

export const DEFAULT_HOLDINGS: Omit<Investment, 'id' | 'user_id' | 'household_id' | 'last_updated'>[] = [
  { tier: 'growth_engine', symbol: 'VTI', current_value_cad: 0, target_pct: 35 },
  { tier: 'growth_engine', symbol: 'VEA', current_value_cad: 0, target_pct: 20 },
  { tier: 'innovation_satellite', symbol: 'ARKQ', current_value_cad: 0, target_pct: 4 },
  { tier: 'innovation_satellite', symbol: 'BOTZ', current_value_cad: 0, target_pct: 4 },
  { tier: 'innovation_satellite', symbol: 'ROBO', current_value_cad: 0, target_pct: 4 },
  { tier: 'innovation_satellite', symbol: 'ARTY', current_value_cad: 0, target_pct: 3 },
  { tier: 'stability_liquidity', symbol: 'VSB', current_value_cad: 0, target_pct: 15 },
  { tier: 'stability_liquidity', symbol: 'CGL', current_value_cad: 0, target_pct: 10 },
  { tier: 'asymmetric_upside', symbol: 'BTC', current_value_cad: 0, target_pct: 2 },
  { tier: 'asymmetric_upside', symbol: 'ETH', current_value_cad: 0, target_pct: 1 },
  { tier: 'asymmetric_upside', symbol: 'LINK', current_value_cad: 0, target_pct: 1 },
  { tier: 'asymmetric_upside', symbol: 'XRP', current_value_cad: 0, target_pct: 1 },
];

// ─── InlineEdit component ────────────────────────────────────────────────────────────

export function InlineEdit({
  value,
  onSave,
  className,
  disabled,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing || disabled) {
    return (
      <span
        onClick={() => !disabled && setEditing(true)}
        className={cn(
          'cursor-pointer hover:text-blue-400',
          disabled && 'cursor-default hover:text-inherit',
          className
        )}
      >
        {value}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== value) onSave(draft.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (draft.trim() && draft !== value) onSave(draft.trim());
          setEditing(false);
        }
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="px-2 py-1 bg-zinc-800 border border-blue-500 rounded text-sm text-white focus:outline-none"
    />
  );
}

export function InlineNumberEdit({
  value,
  onSave,
  className,
  disabled,
  format,
}: {
  value: number;
  onSave: (v: number) => void;
  className?: string;
  disabled?: boolean;
  format?: (v: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toString());

  const displayValue = format ? format(value) : value.toString();

  if (!editing || disabled) {
    return (
      <span
        onClick={() => {
          if (!disabled) {
            setDraft(value.toString());
            setEditing(true);
          }
        }}
        className={cn(
          'cursor-pointer hover:text-blue-400',
          disabled && 'cursor-default hover:text-inherit',
          className
        )}
      >
        {displayValue}
      </span>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      step="1"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseFloat(draft);
        if (!isNaN(parsed) && parsed !== value) onSave(parsed);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const parsed = parseFloat(draft);
          if (!isNaN(parsed) && parsed !== value) onSave(parsed);
          setEditing(false);
        }
        if (e.key === 'Escape') {
          setDraft(value.toString());
          setEditing(false);
        }
      }}
      className="px-2 py-1 bg-zinc-800 border border-blue-500 rounded text-sm text-white focus:outline-none w-28"
    />
  );
}

// ─── Input helpers ──────────────────────────────────────────────────────────────────

export function InputField({
  label,
  value,
  onChange,
  type = 'number',
  step,
  placeholder,
  className,
  disabled,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-xs text-zinc-400">{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
      />
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-zinc-400">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors resize-none"
      />
    </div>
  );
}

export function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
    >
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {saving ? 'Saving...' : 'Save'}
    </button>
  );
}

// ─── Date helpers ───────────────────────────────────────────────────────────────────

export function getMonthStart(date: string): string {
  return date.slice(0, 7) + '-01';
}

export function getMonthEnd(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().split('T')[0];
}

export function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

export function getDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export function getYesterday(): string {
  return getDaysAgo(1);
}

// Helper: get Monday of the week containing `date` (ISO string)
export function getMondayOfWeek(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

// Helper: format a Mon–Sun range for display
export function formatWeekLabel(monday: string): string {
  const start = new Date(monday + 'T00:00:00');
  const end = new Date(monday + 'T00:00:00');
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Generate list of past N week-Monday strings (most-recent first)
export function getPastWeekMondays(n: number): string[] {
  const mondays: string[] = [];
  const today = getToday();
  let mon = getMondayOfWeek(today);
  for (let i = 0; i < n; i++) {
    mondays.push(mon);
    const d = new Date(mon + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    mon = d.toISOString().split('T')[0];
  }
  return mondays;
}

// ─── Get 3 month labels (most-recent last)
export function getLast3Months(): { label: string; start: string; end: string }[] {
  const result = [];
  const today = new Date();
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const start = d.toISOString().split('T')[0];
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
    result.push({ label, start, end });
  }
  return result;
}

// ─── BUDGET helpers ────────────────────────────────────────────────────────────────

export type BudgetFrequency = 'monthly' | 'weekly' | 'biweekly' | 'annual';

export const FREQ_MULTIPLIERS: Record<BudgetFrequency, number> = {
  monthly: 1,
  weekly: 4.333,
  biweekly: 2.167,
  annual: 1 / 12,
};

export const FREQ_LABELS: Record<BudgetFrequency, string> = {
  monthly: '/mo',
  weekly: '/wk',
  biweekly: '/2wk',
  annual: '/yr',
};

export function monthlyEquiv(cat: BudgetCategory): number {
  return cat.monthly_amount * FREQ_MULTIPLIERS[(cat.frequency ?? 'monthly') as BudgetFrequency];
}

export function getWeeksInMonth(month: string): string[] {
  const mStart = month + '-01';
  const mEnd = getMonthEnd(mStart);
  const weeks: string[] = [];
  let mon = getMondayOfWeek(mStart);
  while (mon <= mEnd) {
    weeks.push(mon);
    const d = new Date(mon + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    mon = d.toISOString().split('T')[0];
  }
  return weeks;
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function getPastMonths(n: number): string[] {
  const months: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

// ─── CASH FLOW shared ──────────────────────────────────────────────────────────────

export const CASH_VIEWS = [
  { label: 'Total', value: 'total' },
  { label: 'Personal', value: 'personal' },
  { label: 'Business', value: 'business' },
  { label: 'By Type', value: 'type' },
] as const;
export type CashView = (typeof CASH_VIEWS)[number]['value'];

export function CashViewToggle({ view, onChange }: { view: CashView; onChange: (v: CashView) => void }) {
  return (
    <div className="flex bg-zinc-800 rounded-lg p-0.5">
      {CASH_VIEWS.map((v) => (
        <button
          key={v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            'px-3 py-2 rounded-md text-xs font-medium transition-colors min-h-[36px]',
            view === v.value ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

export const SCOPE_COLORS: Record<AccountScope, string> = {
  business: '#f59e0b',
  personal: '#3b82f6',
};
export const TYPE_COLORS: Record<AccountType, string> = {
  chequing: '#3b82f6',
  savings: '#10b981',
  investments: '#8b5cf6',
};

export type TrendRow = AccountBalance & {
  accounts: { name: string; currency: AccountCurrency; scope: AccountScope; account_type: AccountType } | null;
};
