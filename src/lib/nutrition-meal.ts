export type SpokenFood = { name: string; quantity: string };

/**
 * A real breakfast dictation. The parser must keep every food and its portion
 * instead of collapsing the sentence into one shake.
 */
export const BREAKFAST_MEAL_TEXT =
  'for breakfast I had my morning Shake which is cup of water scoop of protein 81 greens super collagen ... one cup of egg whites three eggs fried, handful of sharp cheddar, half a cup of cottage cheese';

export const BREAKFAST_MEAL_ITEMS: SpokenFood[] = [
  { name: 'Water', quantity: '1 cup' },
  { name: 'Protein', quantity: '1 scoop' },
  { name: 'AG1', quantity: '1 serving' },
  { name: 'Super collagen', quantity: '1 serving' },
  { name: 'Egg whites', quantity: '1 cup' },
  { name: 'Fried eggs', quantity: '3' },
  { name: 'Sharp cheddar', quantity: '1 handful' },
  { name: 'Cottage cheese', quantity: '1/2 cup' },
];

type MealOperation = {
  op: 'add' | 'update' | 'delete';
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

/** Vocabulary hint for gpt-4o-mini-transcribe. Spoken style, not instructions. */
export const FOOD_TRANSCRIBE_PROMPT =
  'Breakfast with AG1, Athletic Greens, a protein scoop, super collagen, egg whites, cottage cheese, and sharp cheddar.';

export const PENDING_FOOD_MESSAGE =
  'The food model is unavailable, so nothing was added to the log. These words are saved. Tap Re-run to parse them again.';

export function pendingFoodResult(): { pending: true; operations: []; reply: string } {
  return { pending: true, operations: [], reply: PENDING_FOOD_MESSAGE };
}

const MATCHERS: { name: string; source: string }[] = [
  { name: 'Sharp cheddar', source: 'sharp cheddar' },
  { name: 'Cottage cheese', source: 'cottage cheese' },
  { name: 'Egg whites', source: 'egg\\s+whites?' },
  { name: 'Fried eggs', source: 'eggs?\\s+fried|fried\\s+eggs?' },
  { name: 'Eggs', source: '\\beggs?\\b' },
  { name: 'Super collagen', source: 'super\\s+collagen' },
  { name: 'AG1', source: 'athletic\\s+greens|\\bag\\s*1(?:\\s+greens?)?\\b|\\ba\\s+g\\s+1(?:\\s+greens?)?\\b|\\b81\\s+greens?\\b' },
  { name: 'Protein', source: 'protein\\s+powder|\\bprotein\\b' },
  { name: 'Water', source: '\\bwater\\b' },
];

const COUNT_WORDS: Record<string, string> = {
  a: '1',
  an: '1',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
};

export function isMealCorrection(message: string): boolean {
  return /\b(delete|remove|didn'?t|did not|actually|instead|change that|make that|update the|not the)\b/i.test(message);
}

/** Pull each named food and its portion out of a spoken meal. */
export function segmentSpokenMeal(message: string): SpokenFood[] {
  const text = message
    .replace(/[.…]+/g, ' ')
    .replace(/[,/;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const hits: { name: string; index: number; length: number }[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let best: { name: string; index: number; length: number } | null = null;
    for (const matcher of MATCHERS) {
      const match = new RegExp(matcher.source, 'i').exec(text.slice(cursor));
      if (!match || match.index == null || match[0].length < 1) continue;
      const index = cursor + match.index;
      const length = match[0].length;
      if (!best || index < best.index || (index === best.index && length > best.length)) {
        best = { name: matcher.name, index, length };
      }
    }
    if (!best) break;
    hits.push(best);
    cursor = best.index + best.length;
  }
  return hits.map((hit, index) => {
    const previousEnd = index === 0 ? 0 : hits[index - 1].index + hits[index - 1].length;
    return {
      name: hit.name,
      quantity: readQuantity(text.slice(previousEnd, hit.index), text.slice(hit.index + hit.length, hit.index + hit.length + 24)),
    };
  });
}

export function foodParseInstructions(): string {
  const example = BREAKFAST_MEAL_ITEMS.map((item) => `- ${item.name} (${item.quantity})`).join('\n');
  return `You update one person's food log for a single day. Estimate calories (kcal), protein, fat, carbs, fiber, and sugar in grams, and sodium in milligrams, for the whole portion they describe. Use ordinary home or restaurant portions when they are vague. Numbers are estimates, not a lab analysis.
Change only what the new message asks for. Add foods that are not already listed. Update an existing id when they correct a portion ("actually make that 3 eggs") and re-estimate that line for the new amount. Delete an item only when they say they did not eat it. Never delete or rewrite foods they did not mention. If you are unsure which item they mean, ask in reply and return no operations.
A single message often lists many foods. Return one operation per food, including each ingredient of a shake, bowl, or plate. Keep that food's quantity on its own line. Do not collapse a list into one item named breakfast, shake, or meal when the parts were spoken.
Household words: AG1 and Athletic Greens are the same greens powder ("81 greens" means AG1). A protein scoop or scoop of protein is protein powder, separate from the greens. Super collagen is its own item. Egg whites are not whole eggs. Fried eggs are not egg whites. Sharp cheddar is not cottage cheese. Water is its own item when they say they used a cup of water.

Example message:
${BREAKFAST_MEAL_TEXT}

Separate items for that message:
${example}

quantity is a short portion phrase such as "1 cup" or "3". name is the food, not the whole sentence. reply is one or two plain sentences confirming the change. Do not use markdown.
For add operations set id to null. Use null for any field that does not apply.
Do not add a group or summary row when you list the ingredients separately.`;
}

export function foodUserPrompt(
  message: string,
  items: unknown,
  history: { role: string; content: string }[],
): string {
  const detected = segmentSpokenMeal(message);
  const heard = detected.length
    ? `\n\nSeparate foods heard in this message. When the person is logging what they ate, return one operation for each of these and for every other food they named. Do not combine them. When they are correcting or deleting, follow that instead:\n${detected.map((item) => `- ${item.name} (${item.quantity})`).join('\n')}`
    : '';
  const recent = history.map((entry) => `${entry.role}: ${entry.content}`).join('\n') || '(none)';
  return `Current items:\n${JSON.stringify(items)}\n\nRecent conversation:\n${recent}\n\nNew message:\n${message}${heard}`;
}

function isCollapsedMealName(name: string): boolean {
  return /^(?:my\s+)?(?:morning\s+|evening\s+|breakfast\s+|lunch\s+|dinner\s+)?(?:shake|breakfast|lunch|dinner|snack|meal)s?$/i.test(name.trim());
}

function operationCoversItem(operationName: string, itemName: string): boolean {
  const name = operationName.toLowerCase().trim();
  if (itemName === 'Egg whites') return /\begg\s+whites?\b/.test(name);
  if (itemName === 'Fried eggs') {
    if (/\begg\s+whites?\b/.test(name)) return false;
    return /\bfried\s+eggs?\b/.test(name) || /\beggs?\s+fried\b/.test(name) || /^eggs?$/.test(name);
  }
  if (itemName === 'Eggs') {
    if (/\begg\s+whites?\b/.test(name) || /\bfried\b/.test(name)) return false;
    return /\beggs?\b/.test(name);
  }
  if (itemName === 'AG1') return /\bag\s*1\b/.test(name) || /athletic\s+greens/.test(name) || /\b81\s+greens?\b/.test(name);
  if (itemName === 'Protein') {
    if (/collagen|athletic|\bag\s*1\b|81\s+greens/.test(name)) return false;
    return /\bprotein\b/.test(name) || /\bwhey\b/.test(name);
  }
  if (itemName === 'Super collagen') return /\bcollagen\b/.test(name);
  if (itemName === 'Sharp cheddar') return /\bcheddar\b/.test(name) && !/cottage/.test(name);
  if (itemName === 'Cottage cheese') return /cottage\s+cheese/.test(name);
  if (itemName === 'Water') return /\bwater\b/.test(name);
  return name === itemName.toLowerCase();
}

/**
 * Keep every detected food even when the model returns one combined meal.
 * Missing lines are added with no numbers so the log shows the food without inventing macros.
 */
export function mergeSpokenFoods(
  operations: MealOperation[],
  detected: SpokenFood[],
  message: string,
  existingNames: string[] = [],
): MealOperation[] {
  if (!detected.length || isMealCorrection(message)) return operations;
  const kept = detected.length >= 2
    ? operations.filter((operation) => operation.op !== 'add' || !operation.name || !isCollapsedMealName(operation.name))
    : operations.slice();
  const used = new Set<number>();
  const filled = kept.map((operation) => {
    if (operation.op === 'delete' || !operation.name) return operation;
    const matchIndex = detected.findIndex((item, index) => !used.has(index) && operationCoversItem(operation.name!, item.name));
    if (matchIndex < 0) return operation;
    used.add(matchIndex);
    if (operation.quantity?.trim()) return operation;
    return { ...operation, quantity: detected[matchIndex].quantity };
  });
  const missing = detected.filter((item, index) => !used.has(index) && !existingNames.some((name) => operationCoversItem(name, item.name)));
  return [
    ...filled,
    ...missing.map((item) => ({
      op: 'add' as const,
      id: null,
      name: item.name,
      quantity: item.quantity,
      calories: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
      fiber_g: null,
      sugar_g: null,
      sodium_mg: null,
    })),
  ];
}

function readQuantity(before: string, after: string): string {
  const lead = before.replace(/\s+/g, ' ');
  const rules: { pattern: RegExp; label: (match: RegExpMatchArray) => string }[] = [
    { pattern: /\b(?:half\s+a\s+cup|half\s+cup|1\/2\s+cups?|0\.5\s+cups?)\s*(?:of\s*)?$/i, label: () => '1/2 cup' },
    { pattern: /\b(?:a|an|one|1)\s+cups?\s*(?:of\s*)?$/i, label: () => '1 cup' },
    { pattern: /\b(\d+(?:\.\d+)?)\s+cups?\s*(?:of\s*)?$/i, label: (match) => `${trimNum(match[1])} cup` },
    { pattern: /\bcups?\s*(?:of\s*)?$/i, label: () => '1 cup' },
    { pattern: /\b(?:a|an|one|1)\s+scoops?\s*(?:of\s*)?$/i, label: () => '1 scoop' },
    { pattern: /\b(\d+(?:\.\d+)?)\s+scoops?\s*(?:of\s*)?$/i, label: (match) => `${trimNum(match[1])} scoop` },
    { pattern: /\bscoops?\s*(?:of\s*)?$/i, label: () => '1 scoop' },
    { pattern: /\b(?:a\s+|an\s+|one\s+)?handfuls?\s*(?:of\s*)?$/i, label: () => '1 handful' },
    {
      pattern: /\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s+$/i,
      label: (match) => COUNT_WORDS[match[1].toLowerCase()] ?? trimNum(match[1]),
    },
  ];
  for (const rule of rules) {
    const match = lead.match(rule.pattern);
    if (match) return rule.label(match);
  }
  if (/^\s+scoops?\b/i.test(after)) return '1 scoop';
  return '1 serving';
}

function trimNum(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}
