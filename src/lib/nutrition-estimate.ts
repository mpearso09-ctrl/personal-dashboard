/**
 * Offline meal estimate used when the AI Gateway cannot parse a transcript.
 * Values are ordinary home servings, not a lab analysis. The same planner
 * turns either these estimates or a model object into nutrition_items writes.
 */

export type FoodOp = 'add' | 'update' | 'delete';

export type FoodOperation = {
  op: FoodOp;
  id: string | null;
  name: string | null;
  quantity: string | null;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
};

export type FoodPatch = {
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

const LIMITS = {
  calories: { max: 8000, digits: 0 },
  protein_g: { max: 500, digits: 1 },
  fat_g: { max: 500, digits: 1 },
  carbs_g: { max: 800, digits: 1 },
  fiber_g: { max: 150, digits: 1 },
  sugar_g: { max: 500, digits: 1 },
  sodium_mg: { max: 20000, digits: 0 },
} as const;

type MacroKey = keyof typeof LIMITS;

const MACRO_KEYS = Object.keys(LIMITS) as MacroKey[];

type Unit = 'each' | 'slice' | 'cup' | 'tbsp' | 'tsp' | 'oz';

type Macros = Record<MacroKey, number>;

type Food = {
  name: string;
  aliases: string[];
  unit: Unit;
  /** Used when the person names the food without a count, or names a whole piece of an oz-based food. */
  defaultCount: number;
  macros: Macros;
};

const VOLUME: Partial<Record<Unit, number>> = { tsp: 1, tbsp: 3, cup: 48 };

const FOODS: Food[] = [
  food('Egg', ['egg', 'eggs'], 'each', 1, { calories: 72, protein_g: 6.3, fat_g: 4.8, carbs_g: 0.4, fiber_g: 0, sugar_g: 0.2, sodium_mg: 71 }),
  food('Toast', ['toast', 'bread'], 'slice', 1, { calories: 79, protein_g: 2.7, fat_g: 1.1, carbs_g: 14.7, fiber_g: 0.8, sugar_g: 1.5, sodium_mg: 147 }),
  food('Butter', ['butter'], 'tsp', 1, { calories: 34, protein_g: 0, fat_g: 3.8, carbs_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 1 }),
  food('Peanut butter', ['peanut butter'], 'tbsp', 1, { calories: 94, protein_g: 4, fat_g: 8, carbs_g: 3.2, fiber_g: 1, sugar_g: 1.5, sodium_mg: 73 }),
  food('Chicken breast', ['chicken breast', 'chicken'], 'oz', 6, { calories: 31, protein_g: 6.5, fat_g: 0.7, carbs_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 18 }),
  food('Rice', ['rice'], 'cup', 1, { calories: 206, protein_g: 4.3, fat_g: 0.4, carbs_g: 45, fiber_g: 0.6, sugar_g: 0.1, sodium_mg: 2 }),
  food('Oatmeal', ['oatmeal', 'oats'], 'cup', 1, { calories: 166, protein_g: 5.9, fat_g: 3.6, carbs_g: 28, fiber_g: 4, sugar_g: 0.6, sodium_mg: 9 }),
  food('Banana', ['banana', 'bananas'], 'each', 1, { calories: 105, protein_g: 1.3, fat_g: 0.4, carbs_g: 27, fiber_g: 3.1, sugar_g: 14, sodium_mg: 1 }),
  food('Apple', ['apple', 'apples'], 'each', 1, { calories: 95, protein_g: 0.5, fat_g: 0.3, carbs_g: 25, fiber_g: 4.4, sugar_g: 19, sodium_mg: 2 }),
  food('Milk', ['milk'], 'cup', 1, { calories: 149, protein_g: 8, fat_g: 8, carbs_g: 12, fiber_g: 0, sugar_g: 12, sodium_mg: 105 }),
  food('Coffee', ['coffee'], 'cup', 1, { calories: 2, protein_g: 0.3, fat_g: 0, carbs_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 5 }),
  food('Greek yogurt', ['greek yogurt', 'yogurt'], 'cup', 1, { calories: 146, protein_g: 20, fat_g: 3.8, carbs_g: 7.9, fiber_g: 0, sugar_g: 7.1, sodium_mg: 68 }),
  food('Cheddar', ['cheddar', 'cheese'], 'oz', 1, { calories: 114, protein_g: 7, fat_g: 9.4, carbs_g: 0.4, fiber_g: 0, sugar_g: 0.1, sodium_mg: 183 }),
  food('Bacon', ['bacon'], 'slice', 2, { calories: 43, protein_g: 3, fat_g: 3.3, carbs_g: 0.1, fiber_g: 0, sugar_g: 0, sodium_mg: 137 }),
  food('Sausage', ['sausage'], 'each', 1, { calories: 75, protein_g: 4.2, fat_g: 6.4, carbs_g: 0.4, fiber_g: 0, sugar_g: 0.1, sodium_mg: 210 }),
  food('Potato', ['potato', 'potatoes'], 'each', 1, { calories: 161, protein_g: 4.3, fat_g: 0.2, carbs_g: 37, fiber_g: 3.8, sugar_g: 1.7, sodium_mg: 17 }),
  food('Olive oil', ['olive oil'], 'tbsp', 1, { calories: 119, protein_g: 0, fat_g: 13.5, carbs_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0 }),
  food('Salmon', ['salmon'], 'oz', 4, { calories: 59, protein_g: 5.6, fat_g: 3.8, carbs_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 19 }),
  food('Beef', ['beef', 'steak', 'burger'], 'oz', 4, { calories: 70, protein_g: 7, fat_g: 4.5, carbs_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 18 }),
  food('Pasta', ['pasta'], 'cup', 1, { calories: 220, protein_g: 8.1, fat_g: 1.3, carbs_g: 43, fiber_g: 2.5, sugar_g: 0.8, sodium_mg: 1 }),
  food('Pizza', ['pizza'], 'slice', 1, { calories: 285, protein_g: 12, fat_g: 10, carbs_g: 36, fiber_g: 2.5, sugar_g: 3.8, sodium_mg: 640 }),
  food('Beer', ['beer'], 'each', 1, { calories: 153, protein_g: 1.6, fat_g: 0, carbs_g: 13, fiber_g: 0, sugar_g: 0, sodium_mg: 14 }),
  food('Wine', ['wine'], 'each', 1, { calories: 125, protein_g: 0.1, fat_g: 0, carbs_g: 4, fiber_g: 0, sugar_g: 1, sodium_mg: 6 }),
  food('Orange juice', ['orange juice', 'juice'], 'cup', 1, { calories: 112, protein_g: 1.7, fat_g: 0.5, carbs_g: 26, fiber_g: 0.5, sugar_g: 21, sodium_mg: 2 }),
  food('Avocado', ['avocado'], 'each', 1, { calories: 234, protein_g: 2.9, fat_g: 21, carbs_g: 12, fiber_g: 10, sugar_g: 1, sodium_mg: 10 }),
  food('Bagel', ['bagel'], 'each', 1, { calories: 277, protein_g: 11, fat_g: 1.4, carbs_g: 55, fiber_g: 2.4, sugar_g: 8.5, sodium_mg: 443 }),
  food('Cream cheese', ['cream cheese'], 'tbsp', 2, { calories: 51, protein_g: 0.9, fat_g: 5, carbs_g: 0.8, fiber_g: 0, sugar_g: 0.5, sodium_mg: 46 }),
  food('Protein shake', ['protein shake', 'whey', 'protein powder'], 'each', 1, { calories: 120, protein_g: 24, fat_g: 1.5, carbs_g: 3, fiber_g: 1, sugar_g: 1, sodium_mg: 130 }),
  food('Almonds', ['almonds', 'almond'], 'oz', 1, { calories: 164, protein_g: 6, fat_g: 14, carbs_g: 6, fiber_g: 3.5, sugar_g: 1.2, sodium_mg: 0 }),
  food('Broccoli', ['broccoli'], 'cup', 1, { calories: 55, protein_g: 3.7, fat_g: 0.6, carbs_g: 11, fiber_g: 5.1, sugar_g: 2.2, sodium_mg: 64 }),
  food('Beans', ['beans'], 'cup', 1, { calories: 227, protein_g: 15, fat_g: 0.9, carbs_g: 41, fiber_g: 15, sugar_g: 0.6, sodium_mg: 2 }),
  food('Tortilla', ['tortilla'], 'each', 1, { calories: 146, protein_g: 4, fat_g: 3.5, carbs_g: 24, fiber_g: 1.5, sugar_g: 0.5, sodium_mg: 330 }),
  food('Hummus', ['hummus'], 'tbsp', 2, { calories: 35, protein_g: 1, fat_g: 2.6, carbs_g: 2, fiber_g: 0.8, sugar_g: 0.1, sodium_mg: 61 }),
  food('Turkey', ['turkey'], 'oz', 3, { calories: 29, protein_g: 6, fat_g: 0.4, carbs_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 18 }),
  food('Ham', ['ham'], 'slice', 2, { calories: 46, protein_g: 4.7, fat_g: 2.4, carbs_g: 0.4, fiber_g: 0, sugar_g: 0.3, sodium_mg: 365 }),
  food('Mayonnaise', ['mayonnaise', 'mayo'], 'tbsp', 1, { calories: 94, protein_g: 0.1, fat_g: 10, carbs_g: 0.1, fiber_g: 0, sugar_g: 0.1, sodium_mg: 88 }),
  food('Salad', ['salad'], 'each', 1, { calories: 33, protein_g: 2, fat_g: 0.5, carbs_g: 6, fiber_g: 2.2, sugar_g: 2, sodium_mg: 28 }),
  food('Granola', ['granola'], 'cup', 0.5, { calories: 298, protein_g: 6.6, fat_g: 14, carbs_g: 36, fiber_g: 3.5, sugar_g: 14, sodium_mg: 15 }),
];

function food(name: string, aliases: string[], unit: Unit, defaultCount: number, macros: Macros): Food {
  return { name, aliases, unit, defaultCount, macros };
}

const ALIASES = FOODS.flatMap((entry) => entry.aliases.map((alias) => ({ alias, entry })))
  .sort((a, b) => b.alias.length - a.alias.length);

export function isFoodModelUnavailable(message: string): boolean {
  return /credit card|billing|insufficient|quota|AI Gateway|AI_GATEWAY|No object generated|could not turn that into food|food parser returned nothing|did not respond|unauthorized|api key|OIDC/i.test(message);
}

export function normalizeFoodOperation(raw: Partial<FoodOperation> & { op: FoodOp }): FoodOperation {
  return {
    op: raw.op,
    id: raw.id ?? null,
    name: raw.name ?? null,
    quantity: raw.quantity ?? null,
    calories: raw.calories ?? null,
    protein_g: raw.protein_g ?? null,
    fat_g: raw.fat_g ?? null,
    carbs_g: raw.carbs_g ?? null,
    fiber_g: raw.fiber_g ?? null,
    sugar_g: raw.sugar_g ?? null,
    sodium_mg: raw.sodium_mg ?? null,
  };
}

export function foodPatch(operation: FoodOperation): FoodPatch {
  const name = operation.name?.trim().slice(0, 120) || '';
  const quantity = operation.quantity?.trim().slice(0, 80) || null;
  const numbers = {} as Record<MacroKey, number | null>;
  for (const key of MACRO_KEYS) numbers[key] = clampMacro(key, operation[key]);
  return { name, quantity, ...numbers };
}

export function planNutritionChanges(
  existing: { id: string; name: string }[],
  operations: FoodOperation[],
): { inserts: FoodPatch[]; updates: { id: string; patch: FoodPatch }[]; deletes: string[] } {
  const ids = new Set(existing.map((item) => item.id));
  const inserts: FoodPatch[] = [];
  const updates: { id: string; patch: FoodPatch }[] = [];
  const deletes: string[] = [];
  for (const operation of operations) {
    if (operation.op === 'delete') {
      if (operation.id && ids.has(operation.id)) {
        deletes.push(operation.id);
        ids.delete(operation.id);
      }
      continue;
    }
    const patch = foodPatch(operation);
    if (operation.op === 'update') {
      const current = existing.find((item) => item.id === operation.id);
      if (!current || !operation.id || !ids.has(operation.id)) continue;
      updates.push({ id: operation.id, patch: { ...patch, name: patch.name || current.name } });
      continue;
    }
    if (!patch.name) continue;
    inserts.push(patch);
  }
  return { inserts, updates, deletes };
}

/** Estimate foods from a transcript. Null when the words are a correction or match nothing. */
export function fallbackFoodLog(message: string): { reply: string; operations: FoodOperation[] } | null {
  if (looksLikeCorrection(message)) return null;
  const items = estimateFoodItems(message);
  if (!items.length) return null;
  const described = items.map((item) => item.quantity ? `${item.quantity} ${item.name}` : item.name).join(', ');
  return {
    reply: `Saved an estimate for ${described}. The food model was unavailable, so check the numbers and correct anything that looks off.`,
    operations: items.map((item) => normalizeFoodOperation({ op: 'add', ...item })),
  };
}

function looksLikeCorrection(message: string): boolean {
  return /\b(delete|remove|didn'?t|did not|actually|instead|change that|make that|update the|not the)\b/i.test(message);
}

type Estimated = Omit<FoodOperation, 'op' | 'id'>;

function estimateFoodItems(message: string): Estimated[] {
  const items: Estimated[] = [];
  for (const chunk of mealChunks(message)) {
    const parsed = parseChunk(chunk);
    const match = matchFood(parsed.name);
    if (!match) continue;
    const count = servingFactor(parsed.count, parsed.unit, match);
    if (!(count > 0)) continue;
    const scaled = {} as Record<MacroKey, number>;
    for (const key of MACRO_KEYS) scaled[key] = clampMacro(key, match.macros[key] * count) ?? 0;
    items.push({
      name: match.name,
      quantity: quantityLabel(count, parsed.unit, match),
      ...scaled,
    });
  }
  return items;
}

function mealChunks(message: string): string[] {
  const cleaned = message
    .replace(/^(?:here'?s what i ate(?: today)?|i (?:just )?(?:had|ate)|for (?:breakfast|lunch|dinner|a snack|snack))[:,\s-]*/i, '');
  return cleaned
    .split(/\n+|,|;|\band\b|\bplus\b|\bwith\b|\balso\b/i)
    .map((part) => part
      .replace(/\b(large|medium|small|big)\b/gi, ' ')
      .replace(/[^a-z0-9.\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((part) => part.length > 1);
}

const COUNT_WORDS = 'a|an|one|two|three|four|five|six|seven|eight|nine|ten|half';
const UNIT_WORDS = 'slices?|pieces?|cups?|glasses?|bowls?|tablespoons?|tbsps?|teaspoons?|tsps?|ounces?|oz|servings?';
const CHUNK_RE = new RegExp(
  `^(?:(\\d+(?:\\.\\d+)?|${COUNT_WORDS})\\s+)?(?:(${UNIT_WORDS})\\s+)?(?:of\\s+)?(.+)$`,
  'i',
);

function parseChunk(chunk: string): { count: number | null; unit: Unit | null; name: string } {
  const match = chunk.match(CHUNK_RE);
  if (!match) return { count: null, unit: null, name: chunk };
  return {
    count: parseCount(match[1]),
    unit: canonicalUnit(match[2]),
    name: (match[3] ?? chunk).trim(),
  };
}

function parseCount(raw: string | undefined): number | null {
  if (!raw) return null;
  if (/^\d/.test(raw)) return Number(raw);
  const words: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5,
  };
  return words[raw.toLowerCase()] ?? null;
}

function canonicalUnit(raw: string | undefined): Unit | null {
  if (!raw) return null;
  const unit = raw.toLowerCase();
  if (/^slices?$/.test(unit)) return 'slice';
  if (/^pieces?$|^servings?$/.test(unit)) return 'each';
  if (/^cups?$|^glasses?$|^bowls?$/.test(unit)) return 'cup';
  if (/^tablespoons?$|^tbsps?$/.test(unit)) return 'tbsp';
  if (/^teaspoons?$|^tsps?$/.test(unit)) return 'tsp';
  if (/^ounces?$|^oz$/.test(unit)) return 'oz';
  return null;
}

function matchFood(name: string): Food | null {
  const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  for (const candidate of ALIASES) {
    const pattern = new RegExp(`\\b${candidate.alias}\\b`, 'i');
    if (pattern.test(normalized)) return candidate.entry;
  }
  return null;
}

function servingFactor(count: number | null, unit: Unit | null, entry: Food): number {
  if (entry.unit === 'oz' && (unit == null || unit === 'each')) {
    return (count ?? 1) * entry.defaultCount;
  }
  if (unit && unit !== entry.unit && VOLUME[unit] && VOLUME[entry.unit]) {
    return (count ?? 1) * (VOLUME[unit]! / VOLUME[entry.unit]!);
  }
  return count ?? entry.defaultCount;
}

function quantityLabel(count: number, unit: Unit | null, entry: Food): string {
  const shown = Number.isInteger(count) ? String(count) : String(Math.round(count * 10) / 10);
  const label = unit && unit !== 'each' ? unit : entry.unit === 'each' ? '' : entry.unit;
  return label ? `${shown} ${label}` : shown;
}

function clampMacro(key: MacroKey, value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const limit = LIMITS[key];
  const capped = Math.min(value, limit.max);
  const factor = 10 ** limit.digits;
  return Math.round(capped * factor) / factor;
}
