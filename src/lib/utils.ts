export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyDecimal(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export function getWeekStart(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export function getDayOfChallenge(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

export function getStatusColor(value: number | null, min?: number, max?: number): string {
  if (value === null || value === undefined) return 'text-zinc-400';
  if (min !== undefined && max !== undefined) {
    if (value >= min && value <= max) return 'text-emerald-400';
    const rangeSize = max - min;
    if (value < min - rangeSize * 0.1 || value > max + rangeSize * 0.1) return 'text-red-400';
    return 'text-amber-400';
  }
  if (min !== undefined) {
    if (value >= min) return 'text-emerald-400';
    if (value >= min * 0.9) return 'text-amber-400';
    return 'text-red-400';
  }
  if (max !== undefined) {
    if (value <= max) return 'text-emerald-400';
    if (value <= max * 1.1) return 'text-amber-400';
    return 'text-red-400';
  }
  return 'text-zinc-400';
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
