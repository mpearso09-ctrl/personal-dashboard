import { generateText, NoObjectGeneratedError, Output } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  NUTRITION_MACROS,
  type NutritionItem,
  type NutritionMacroKey,
  isMacroKey,
  normalizeItem,
} from './nutrition';

/** Cheap, fast model from the live AI Gateway catalog. Override with AI_GATEWAY_MODEL. */
export const DEFAULT_NUTRITION_MODEL = 'google/gemini-3.5-flash-lite';

const operationSchema = z.object({
  op: z.enum(['add', 'update', 'delete']),
  id: z.string().nullable(),
  name: z.string().nullable(),
  quantity: z.string().nullable(),
  calories: z.number().nullable(),
  protein_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fiber_g: z.number().nullable(),
  sugar_g: z.number().nullable(),
  sodium_mg: z.number().nullable(),
});

const logSchema = z.object({
  reply: z.string(),
  operations: z.array(operationSchema).max(20),
});

type Operation = z.infer<typeof operationSchema>;

const LIMITS: Record<NutritionMacroKey, { max: number; digits: number }> = {
  calories: { max: 8000, digits: 0 },
  protein_g: { max: 500, digits: 1 },
  fat_g: { max: 500, digits: 1 },
  carbs_g: { max: 800, digits: 1 },
  fiber_g: { max: 150, digits: 1 },
  sugar_g: { max: 500, digits: 1 },
  sodium_mg: { max: 20000, digits: 0 },
};

export function nutritionModel(): string {
  const configured = process.env.AI_GATEWAY_MODEL?.trim();
  if (configured && configured.includes('/')) return configured;
  return DEFAULT_NUTRITION_MODEL;
}

export function nutritionAiError(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/AI_GATEWAY_API_KEY|OIDC|authentication|unauthorized|api key|gateway/i.test(message)) {
    return 'The food parser needs the Vercel AI Gateway. On Vercel that is automatic. Locally, set AI_GATEWAY_API_KEY.';
  }
  if (NoObjectGeneratedError.isInstance(err)) {
    return 'I could not turn that into food items. Try naming the foods and portions again.';
  }
  return 'The food parser did not respond. Try again in a moment.';
}

export async function logFoodTurn(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  message: string,
): Promise<{ reply: string }> {
  const [{ data: itemRows, error: itemError }, { data: messageRows, error: messageError }] = await Promise.all([
    supabase.from('nutrition_items').select('*').eq('user_id', userId).eq('date', date).order('created_at'),
    supabase.from('nutrition_messages').select('role, content').eq('user_id', userId).eq('date', date).order('created_at').limit(12),
  ]);
  if (itemError) throw new Error(itemError.message);
  if (messageError) throw new Error(messageError.message);

  const items = ((itemRows ?? []) as Record<string, unknown>[]).map(normalizeItem);
  const history = (messageRows ?? []) as { role: string; content: string }[];
  const parsed = await generateText({
    model: nutritionModel() as typeof DEFAULT_NUTRITION_MODEL,
    output: Output.object({ schema: logSchema }),
    system: `You update one person's food log for a single day. Estimate calories (kcal), protein, fat, carbs, fiber, and sugar in grams, and sodium in milligrams, for the whole portion they describe. Use ordinary home or restaurant portions when they are vague. Numbers are estimates, not a lab analysis.
Change only what the new message asks for. Add foods that are not already listed. Update an existing id when they correct a portion ("actually make that 3 eggs") and re-estimate that line for the new amount. Delete an item only when they say they did not eat it. Never delete or rewrite foods they did not mention. If you are unsure which item they mean, ask in reply and return no operations.
quantity is a short portion phrase such as "2 large eggs". name is the food, not the whole sentence. reply is one or two plain sentences confirming the change. Do not use markdown.`,
    prompt: `Current items:\n${JSON.stringify(items.map(briefItem))}\n\nRecent conversation:\n${history.map((entry) => `${entry.role}: ${entry.content}`).join('\n') || '(none)'}\n\nNew message:\n${message}`,
  });

  const output = parsed.output;
  if (!output) throw new Error('The food parser returned nothing.');
  await applyOperations(supabase, userId, date, items, output.operations);
  const reply = output.reply.trim().slice(0, 600) || 'Updated the food log. These numbers are estimates.';
  const { error: saveError } = await supabase.from('nutrition_messages').insert([
    { user_id: userId, date, role: 'user', content: message },
    { user_id: userId, date, role: 'assistant', content: reply },
  ]);
  if (saveError) throw new Error(saveError.message);
  return { reply };
}

function briefItem(item: NutritionItem) {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    calories: item.calories,
    protein_g: item.protein_g,
    fat_g: item.fat_g,
    carbs_g: item.carbs_g,
    fiber_g: item.fiber_g,
    sugar_g: item.sugar_g,
    sodium_mg: item.sodium_mg,
  };
}

async function applyOperations(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  existing: NutritionItem[],
  operations: Operation[],
) {
  const ids = new Set(existing.map((item) => item.id));
  for (const operation of operations) {
    if (operation.op === 'delete') {
      if (!operation.id || !ids.has(operation.id)) continue;
      const { error } = await supabase.from('nutrition_items').delete().eq('id', operation.id).eq('user_id', userId);
      if (error) throw new Error(error.message);
      ids.delete(operation.id);
      continue;
    }
    const patch = itemPatch(operation);
    if (operation.op === 'update') {
      const current = existing.find((item) => item.id === operation.id);
      if (!current || !operation.id || !ids.has(operation.id)) continue;
      const { error } = await supabase
        .from('nutrition_items')
        .update({ ...patch, name: patch.name || current.name, updated_at: new Date().toISOString() })
        .eq('id', operation.id)
        .eq('user_id', userId)
        .eq('date', date);
      if (error) throw new Error(error.message);
      continue;
    }
    if (!patch.name) continue;
    const { error } = await supabase.from('nutrition_items').insert({
      user_id: userId,
      date,
      ...patch,
    });
    if (error) throw new Error(error.message);
  }
}

function itemPatch(operation: Operation) {
  const name = operation.name?.trim().slice(0, 120) || '';
  const quantity = operation.quantity?.trim().slice(0, 80) || null;
  const numbers = {} as Record<NutritionMacroKey, number | null>;
  for (const macro of NUTRITION_MACROS) {
    if (!isMacroKey(macro.key)) continue;
    numbers[macro.key] = clampMacro(macro.key, operation[macro.key]);
  }
  return { name, quantity, ...numbers };
}

function clampMacro(key: NutritionMacroKey, value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const limit = LIMITS[key];
  const capped = Math.min(value, limit.max);
  const factor = 10 ** limit.digits;
  return Math.round(capped * factor) / factor;
}
