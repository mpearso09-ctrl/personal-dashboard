import { toNumber } from '@/lib/utils';

export const NUTRITION_MACROS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', digits: 0, direction: 'max' },
  { key: 'protein_g', label: 'Protein', unit: 'g', digits: 1, direction: 'min' },
  { key: 'fat_g', label: 'Fat', unit: 'g', digits: 1, direction: 'max' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g', digits: 1, direction: 'max' },
  { key: 'fiber_g', label: 'Fiber', unit: 'g', digits: 1, direction: 'min' },
  { key: 'sugar_g', label: 'Sugar', unit: 'g', digits: 1, direction: 'max' },
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg', digits: 0, direction: 'max' },
] as const;

export type NutritionMacroKey = (typeof NUTRITION_MACROS)[number]['key'];
export type NutritionDirection = (typeof NUTRITION_MACROS)[number]['direction'];

const MACRO_KEYS = new Set<string>(NUTRITION_MACROS.map((macro) => macro.key));

export const DEFAULT_TRACKED: NutritionMacroKey[] = ['calories', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g'];

export type NutritionItem = {
  id: string;
  user_id: string;
  date: string;
  name: string;
  quantity: string | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
};

export type NutritionSettings = {
  tracked: NutritionMacroKey[];
  targets: Partial<Record<NutritionMacroKey, number>>;
};

export type NutritionTotal = {
  key: NutritionMacroKey;
  label: string;
  unit: string;
  digits: number;
  direction: NutritionDirection;
  value: number | null;
  target: number | null;
};

export function isMacroKey(value: string): value is NutritionMacroKey {
  return MACRO_KEYS.has(value);
}

export function macroByKey(key: NutritionMacroKey) {
  return NUTRITION_MACROS.find((macro) => macro.key === key)!;
}

export function normalizeSettings(row: { tracked?: unknown; targets?: unknown } | null | undefined): NutritionSettings {
  const tracked = Array.isArray(row?.tracked)
    ? row.tracked.filter((key): key is NutritionMacroKey => typeof key === 'string' && isMacroKey(key))
    : [];
  const targets: NutritionSettings['targets'] = {};
  const rawTargets = row?.targets && typeof row.targets === 'object' ? row.targets as Record<string, unknown> : {};
  for (const macro of NUTRITION_MACROS) {
    const value = toNumber(rawTargets[macro.key]);
    if (value != null && value >= 0) targets[macro.key] = value;
  }
  return {
    tracked: tracked.length ? tracked : [...DEFAULT_TRACKED],
    targets,
  };
}

export function normalizeItem(row: Record<string, unknown>): NutritionItem {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    date: String(row.date),
    name: String(row.name ?? ''),
    quantity: row.quantity == null ? null : String(row.quantity),
    calories: toNumber(row.calories),
    protein_g: toNumber(row.protein_g),
    fat_g: toNumber(row.fat_g),
    carbs_g: toNumber(row.carbs_g),
    fiber_g: toNumber(row.fiber_g),
    sugar_g: toNumber(row.sugar_g),
    sodium_mg: toNumber(row.sodium_mg),
  };
}

export function formatMacro(key: NutritionMacroKey, value: number | null): string {
  if (value == null) return '—';
  const macro = macroByKey(key);
  if (macro.digits === 0) return Math.round(value).toLocaleString('en-CA');
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('en-CA', { maximumFractionDigits: 1 });
}

export function dayTotals(items: NutritionItem[], settings: NutritionSettings): NutritionTotal[] {
  return settings.tracked.map((key) => {
    const macro = macroByKey(key);
    let sum = 0;
    let any = false;
    for (const item of items) {
      const value = item[key];
      if (value == null) continue;
      sum += value;
      any = true;
    }
    return {
      key,
      label: macro.label,
      unit: macro.unit,
      digits: macro.digits,
      direction: macro.direction,
      value: any ? sum : null,
      target: settings.targets[key] ?? null,
    };
  });
}

export function macroStatus(total: NutritionTotal): 'none' | 'ok' | 'off' {
  if (total.value == null || total.target == null) return 'none';
  if (total.direction === 'min') return total.value + 0.05 >= total.target ? 'ok' : 'off';
  return total.value <= total.target + 0.05 ? 'ok' : 'off';
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Dark-theme block for the morning Fitbit email. Empty when nothing was logged. */
export function nutritionEmailHtml(items: NutritionItem[], settings: NutritionSettings): string {
  if (!items.length) return '';
  const totals = dayTotals(items, settings);
  const lines = items.map((item) => {
    const portion = item.quantity ? ` (${item.quantity})` : '';
    const bits = settings.tracked.map((key) => {
      const value = item[key];
      if (value == null) return null;
      return `${macroByKey(key).label} ${formatMacro(key, value)}`;
    }).filter(Boolean);
    return `<li style="margin:4px 0;">${esc(item.name)}${esc(portion)}${bits.length ? ` — ${esc(bits.join(', '))}` : ''}</li>`;
  }).join('');
  const totalLine = totals.map((total) => {
    const value = formatMacro(total.key, total.value);
    const target = total.target == null ? '' : ` / ${formatMacro(total.key, total.target)}`;
    return `${total.label} ${value}${target} ${total.unit}`.trim();
  }).join(' · ');
  return `<div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;margin-top:16px;">
    <div style="font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Food yesterday</div>
    <ul style="margin:0;padding-left:18px;color:#e4e4e7;">${lines}</ul>
    <div style="margin-top:12px;color:#fff;font-weight:600;">${esc(totalLine)}</div>
    <div style="margin-top:6px;font-size:12px;color:#71717a;">Estimates from the food log, in Halifax time.</div>
  </div>`;
}
