import assert from 'node:assert/strict';
import test from 'node:test';
import { BREAKFAST_MEAL_ITEMS, BREAKFAST_MEAL_TEXT } from './fixtures/breakfast-meal.ts';
import { audioFileName, preferredRecorderMime, recorderTimesliceMs } from './meal-audio.ts';
import { normalizeFoodOperation } from './nutrition-estimate.ts';
import {
  FOOD_TRANSCRIBE_PROMPT,
  foodParseInstructions,
  mergeSpokenFoods,
  pendingFoodResult,
  segmentSpokenMeal,
} from './nutrition-meal.ts';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

test('the mic records mp4 on iPhone and webm on Android Chrome', () => {
  const both = (type: string) => type === 'audio/mp4' || type === 'audio/webm;codecs=opus' || type === 'audio/webm';
  const iphone = preferredRecorderMime({ userAgent: IPHONE_SAFARI, isSupported: both });
  const iphoneChrome = preferredRecorderMime({ userAgent: IPHONE_CHROME, isSupported: both });
  const android = preferredRecorderMime({ userAgent: ANDROID_CHROME, isSupported: both });
  assert.equal(iphone, 'audio/mp4');
  assert.equal(iphoneChrome, 'audio/mp4');
  assert.equal(recorderTimesliceMs(iphone), undefined);
  assert.equal(audioFileName(iphone), 'meal.m4a');
  assert.equal(android, 'audio/webm;codecs=opus');
  assert.equal(recorderTimesliceMs(android), 1000);
  assert.equal(audioFileName(android), 'meal.webm');
});

test('the transcription prompt names the household foods', () => {
  for (const word of ['AG1', 'Athletic Greens', 'protein scoop', 'super collagen', 'egg whites', 'cottage cheese', 'sharp cheddar']) {
    assert.ok(FOOD_TRANSCRIBE_PROMPT.includes(word), word);
  }
});

test('the breakfast fixture yields every food and quantity', () => {
  assert.deepEqual(segmentSpokenMeal(BREAKFAST_MEAL_TEXT), BREAKFAST_MEAL_ITEMS);
  const instructions = foodParseInstructions();
  assert.ok(instructions.includes(BREAKFAST_MEAL_TEXT));
  for (const item of BREAKFAST_MEAL_ITEMS) {
    assert.ok(instructions.includes(item.name), item.name);
    assert.ok(instructions.includes(item.quantity), item.quantity);
  }
});

test('a collapsed model reply still keeps every fixture food', () => {
  const detected = segmentSpokenMeal(BREAKFAST_MEAL_TEXT);
  const merged = mergeSpokenFoods(
    [normalizeFoodOperation({
      op: 'add',
      name: 'Morning shake',
      quantity: '1',
      calories: 400,
      protein_g: 30,
      fat_g: 10,
      carbs_g: 20,
      fiber_g: 2,
      sugar_g: 4,
      sodium_mg: 300,
    })],
    detected,
    BREAKFAST_MEAL_TEXT,
  );
  assert.deepEqual(
    merged.filter((operation) => operation.op === 'add').map((operation) => operation.name),
    BREAKFAST_MEAL_ITEMS.map((item) => item.name),
  );
  const cheddar = merged.find((operation) => operation.name === 'Sharp cheddar');
  assert.equal(cheddar?.quantity, '1 handful');
  assert.equal(merged.some((operation) => operation.name === 'Morning shake'), false);
});

test('foods already on the log are not added again', () => {
  const detected = segmentSpokenMeal(BREAKFAST_MEAL_TEXT);
  const merged = mergeSpokenFoods(
    [],
    detected,
    BREAKFAST_MEAL_TEXT,
    BREAKFAST_MEAL_ITEMS.map((item) => item.name),
  );
  assert.equal(merged.length, 0);
});

test('foods the model already returned are not duplicated', () => {
  const detected = segmentSpokenMeal(BREAKFAST_MEAL_TEXT);
  const operations = detected.map((item) => normalizeFoodOperation({
    op: 'add',
    name: item.name,
    quantity: item.quantity,
    calories: 1,
    protein_g: 1,
    fat_g: 0,
    carbs_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
  }));
  const merged = mergeSpokenFoods(operations, detected, BREAKFAST_MEAL_TEXT);
  assert.equal(merged.length, detected.length);
});

test('a model outage saves no food rows', () => {
  const pending = pendingFoodResult();
  assert.equal(pending.pending, true);
  assert.deepEqual(pending.operations, []);
  assert.match(pending.reply, /nothing was added to the log/i);
  assert.match(pending.reply, /Re-run/);
});
