import { generateText, NoObjectGeneratedError, NoTranscriptGeneratedError, Output, transcribe } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type NutritionItem,
  normalizeItem,
  syncFitnessNutritionFromFood,
} from './nutrition';
import {
  fallbackFoodLog,
  isFoodModelUnavailable,
  normalizeFoodOperation,
  planNutritionChanges,
  type FoodOperation,
} from './nutrition-estimate';

/** Cheap, fast model from the live AI Gateway catalog. Override with AI_GATEWAY_MODEL. */
export const DEFAULT_NUTRITION_MODEL = 'google/gemini-3.5-flash-lite';

const operationSchema = z.object({
  op: z.enum(['add', 'update', 'delete']),
  id: z.string().nullish(),
  name: z.string().nullish(),
  quantity: z.string().nullish(),
  calories: z.number().nullish(),
  protein_g: z.number().nullish(),
  fat_g: z.number().nullish(),
  carbs_g: z.number().nullish(),
  fiber_g: z.number().nullish(),
  sugar_g: z.number().nullish(),
  sodium_mg: z.number().nullish(),
});

const logSchema = z.object({
  reply: z.string(),
  operations: z.array(operationSchema).max(20),
});

/** Cheap Gateway transcription model. Override with AI_GATEWAY_TRANSCRIBE_MODEL. */
export const DEFAULT_TRANSCRIBE_MODEL = 'openai/gpt-4o-mini-transcribe';

export function transcribeModel(): string {
  const configured = process.env.AI_GATEWAY_TRANSCRIBE_MODEL?.trim();
  if (configured && configured.includes('/')) return configured;
  return DEFAULT_TRANSCRIBE_MODEL;
}

export function nutritionModel(): string {
  const configured = process.env.AI_GATEWAY_MODEL?.trim();
  if (configured && configured.includes('/')) return configured;
  return DEFAULT_NUTRITION_MODEL;
}

export function nutritionAiError(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/credit card|billing|insufficient|quota/i.test(message)) {
    return 'The food model is unavailable right now, so that meal was not saved. Type the foods, or try the mic again in a little while.';
  }
  if (/AI_GATEWAY_API_KEY|OIDC|authentication|unauthorized|api key/i.test(message)) {
    return 'The food parser needs the Vercel AI Gateway. On Vercel that is automatic. Locally, set AI_GATEWAY_API_KEY.';
  }
  if (NoObjectGeneratedError.isInstance(err)) {
    return 'I could not turn that into food items. Try naming the foods and portions again.';
  }
  if (NoTranscriptGeneratedError.isInstance(err)) {
    return 'No words were heard in that recording. Tap the mic and try again.';
  }
  return 'The food parser did not respond. Try again in a moment.';
}

export async function transcribeAndLogFood(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  audio: Uint8Array,
): Promise<{ transcript: string; reply: string }> {
  const result = await transcribe({
    model: transcribeModel(),
    audio,
  });
  const transcript = result.text?.trim() ?? '';
  if (!transcript) throw new Error('No words were heard in that recording. Tap the mic and try again.');
  const logged = await logFoodTurn(supabase, userId, date, transcript);
  return { transcript, reply: logged.reply };
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
  const output = await parseFoodMessage(message, items, history);
  await applyOperations(supabase, userId, date, items, output.operations);
  await syncFitnessNutritionFromFood(supabase, userId, date);
  const reply = output.reply.trim().slice(0, 600) || 'Updated the food log. These numbers are estimates.';
  const { error: saveError } = await supabase.from('nutrition_messages').insert([
    { user_id: userId, date, role: 'user', content: message },
    { user_id: userId, date, role: 'assistant', content: reply },
  ]);
  if (saveError) throw new Error(saveError.message);
  return { reply };
}

async function parseFoodMessage(
  message: string,
  items: NutritionItem[],
  history: { role: string; content: string }[],
): Promise<{ reply: string; operations: FoodOperation[] }> {
  try {
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
    return {
      reply: output.reply,
      operations: output.operations.map((operation) => normalizeFoodOperation(operation)),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (!NoObjectGeneratedError.isInstance(err) && !isFoodModelUnavailable(detail)) throw err;
    const fallback = fallbackFoodLog(message);
    if (!fallback) throw err;
    return fallback;
  }
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
  operations: FoodOperation[],
) {
  const plan = planNutritionChanges(existing, operations);
  for (const id of plan.deletes) {
    const { error } = await supabase.from('nutrition_items').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
  const updatedAt = new Date().toISOString();
  for (const update of plan.updates) {
    const { error } = await supabase
      .from('nutrition_items')
      .update({ ...update.patch, updated_at: updatedAt })
      .eq('id', update.id)
      .eq('user_id', userId)
      .eq('date', date);
    if (error) throw new Error(error.message);
  }
  for (const patch of plan.inserts) {
    const { error } = await supabase.from('nutrition_items').insert({
      user_id: userId,
      date,
      ...patch,
    });
    if (error) throw new Error(error.message);
  }
}
