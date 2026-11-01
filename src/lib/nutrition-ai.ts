import { generateText, NoObjectGeneratedError, NoTranscriptGeneratedError, Output, transcribe } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type NutritionItem,
  normalizeItem,
  syncFitnessNutritionFromFood,
} from './nutrition';
import {
  FOOD_TRANSCRIBE_PROMPT,
  PENDING_FOOD_MESSAGE,
  foodParseInstructions,
  foodUserPrompt,
  mergeSpokenFoods,
  pendingFoodResult,
  segmentSpokenMeal,
} from './nutrition-meal';
import {
  isFoodModelUnavailable,
  normalizeFoodOperation,
  planNutritionChanges,
  type FoodOperation,
} from './nutrition-estimate';

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
  operations: z.array(operationSchema),
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
  if (/credit card|billing|insufficient|quota|free tier|restricted|top-up|credit|invalid schema|invalid argument/i.test(message)) {
    return 'The food model is unavailable right now, so nothing was added to the log. Your words are kept for a retry.';
  }
  if (/AI_GATEWAY_API_KEY|OIDC|authentication|unauthorized|api key/i.test(message)) {
    return 'The food parser needs the Vercel AI Gateway. On Vercel that is automatic. Locally, set AI_GATEWAY_API_KEY.';
  }
  if (NoObjectGeneratedError.isInstance(err)) {
    return 'I could not turn that into food items. Try naming the foods and portions again.';
  }
  if (NoTranscriptGeneratedError.isInstance(err) || /no words were heard/i.test(message)) {
    return 'No words were heard in that recording. Tap the mic and try again.';
  }
  if (message && message.length <= 240 && !/\n\s*at\s/.test(message)) return message;
  return 'The food parser did not respond. Try again in a moment.';
}

export async function transcribeAndLogFood(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  audio: Uint8Array,
): Promise<{ transcript: string; reply: string; pending: boolean }> {
  const result = await transcribe({
    model: transcribeModel(),
    audio,
    providerOptions: {
      openai: {
        language: 'en',
        prompt: FOOD_TRANSCRIBE_PROMPT,
      },
    },
  });
  const transcript = result.text?.trim() ?? '';
  if (!transcript) throw new Error('No words were heard in that recording. Tap the mic and try again.');
  const logged = await logFoodTurn(supabase, userId, date, transcript);
  return { transcript, reply: logged.reply, pending: logged.pending };
}

export async function logFoodTurn(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  message: string,
): Promise<{ reply: string; pending: boolean }> {
  const text = message.trim().slice(0, 4000);
  if (!text) throw new Error('Describe what you ate in one message.');
  try {
    const reply = await commitParsedMeal(supabase, userId, date, text);
    const { error: saveError } = await supabase.from('nutrition_messages').insert([
      { user_id: userId, date, role: 'user', content: text, status: 'logged' },
      { user_id: userId, date, role: 'assistant', content: reply, status: 'logged' },
    ]);
    if (saveError) throw new Error(saveError.message);
    return { reply, pending: false };
  } catch (err) {
    if (!isFoodParsePending(err) && !isFoodModelUnavailable(err instanceof Error ? err.message : String(err))) throw err;
    await savePendingTranscript(supabase, userId, date, text);
    return pendingFoodResult();
  }
}

export async function rerunFoodMessage(
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
): Promise<{ reply: string; pending: boolean }> {
  const { data, error } = await supabase
    .from('nutrition_messages')
    .select('id, role, content, date')
    .eq('id', messageId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== 'user') throw new Error('That saved transcript is not on your food log.');
  const text = String(data.content ?? '').trim().slice(0, 4000);
  const date = String(data.date ?? '').slice(0, 10);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('That saved transcript is empty.');
  try {
    const reply = await commitParsedMeal(supabase, userId, date, text, messageId);
    const { error: statusError } = await supabase
      .from('nutrition_messages')
      .update({ status: 'logged' })
      .eq('id', messageId)
      .eq('user_id', userId);
    if (statusError) throw new Error(statusError.message);
    await replacePendingNote(supabase, userId, date, messageId, reply);
    return { reply, pending: false };
  } catch (err) {
    if (!isFoodParsePending(err) && !isFoodModelUnavailable(err instanceof Error ? err.message : String(err))) throw err;
    return pendingFoodResult();
  }
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
      system: foodParseInstructions(),
      prompt: foodUserPrompt(message, items.map(briefItem), history),
    });
    const output = parsed.output;
    if (!output) throw new Error('The food parser returned nothing.');
    return {
      reply: output.reply,
      operations: mergeSpokenFoods(
        output.operations.slice(0, 20).map((operation) => normalizeFoodOperation(operation)),
        segmentSpokenMeal(message),
        message,
        items.map((item) => item.name),
      ),
    };
  } catch (err) {
    console.error('nutrition parse failed', err instanceof Error ? err.message : err);
    throw new FoodParsePendingError();
  }
}

class FoodParsePendingError extends Error {
  constructor() {
    super(PENDING_FOOD_MESSAGE);
    this.name = 'FoodParsePendingError';
  }
}

function isFoodParsePending(err: unknown): boolean {
  return err instanceof FoodParsePendingError;
}

async function commitParsedMeal(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  message: string,
  omitMessageId?: string,
): Promise<string> {
  const [{ data: itemRows, error: itemError }, { data: messageRows, error: messageError }] = await Promise.all([
    supabase.from('nutrition_items').select('*').eq('user_id', userId).eq('date', date).order('created_at'),
    supabase.from('nutrition_messages').select('id, role, content').eq('user_id', userId).eq('date', date).order('created_at').limit(12),
  ]);
  if (itemError) throw new Error(itemError.message);
  if (messageError) throw new Error(messageError.message);
  const items = ((itemRows ?? []) as Record<string, unknown>[]).map(normalizeItem);
  const rows = (messageRows ?? []) as { id: string; role: string; content: string }[];
  const omitIndex = omitMessageId ? rows.findIndex((row) => row.id === omitMessageId) : -1;
  const history = rows.filter((row, index) => {
    if (index === omitIndex) return false;
    if (omitIndex >= 0 && index === omitIndex + 1 && row.role === 'assistant' && row.content === PENDING_FOOD_MESSAGE) return false;
    return true;
  }).map((row) => ({ role: row.role, content: row.content }));
  const output = await parseFoodMessage(message, items, history);
  await applyOperations(supabase, userId, date, items, output.operations);
  await syncFitnessNutritionFromFood(supabase, userId, date);
  return output.reply.trim().slice(0, 600) || 'Updated the food log. These numbers are estimates.';
}

async function savePendingTranscript(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  message: string,
) {
  const pending = pendingFoodResult();
  const { error } = await supabase.from('nutrition_messages').insert([
    { user_id: userId, date, role: 'user', content: message, status: 'pending' },
    { user_id: userId, date, role: 'assistant', content: pending.reply, status: 'logged' },
  ]);
  if (error) throw new Error(error.message);
}

async function replacePendingNote(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  userMessageId: string,
  reply: string,
) {
  const { data, error } = await supabase
    .from('nutrition_messages')
    .select('id, role, content')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; role: string; content: string }[];
  const index = rows.findIndex((row) => row.id === userMessageId);
  const next = index >= 0 ? rows[index + 1] : undefined;
  if (next?.role === 'assistant' && next.content === PENDING_FOOD_MESSAGE) {
    const { error: deleteError } = await supabase
      .from('nutrition_messages')
      .delete()
      .eq('id', next.id)
      .eq('user_id', userId);
    if (deleteError) throw new Error(deleteError.message);
  }
  const { error: insertError } = await supabase.from('nutrition_messages').insert({
    user_id: userId,
    date,
    role: 'assistant',
    content: reply,
    status: 'logged',
  });
  if (insertError) throw new Error(insertError.message);
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
