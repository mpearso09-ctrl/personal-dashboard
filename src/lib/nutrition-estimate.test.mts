import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackFoodLog, isFoodModelUnavailable, planNutritionChanges } from './nutrition-estimate.ts';
import { formatUpdatedAgo } from './utils.ts';

const GATEWAY_ERROR = 'AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.';

test('the production gateway billing error is treated as a model outage', () => {
  assert.equal(isFoodModelUnavailable(GATEWAY_ERROR), true);
  assert.equal(isFoodModelUnavailable('relation "nutrition_items" does not exist'), false);
});

test('a free-tier model refusal is a model outage', () => {
  const message = 'Free tier users do not have access to this model. Access is restricted until you top-up your credit.';
  assert.equal(isFoodModelUnavailable(message), true);
});

test('an OpenAI strict-schema refusal is a model outage', () => {
  const message = "Invalid schema for response_format 'response': In context=('properties','operations','items'), 'required' is required to be supplied and to be an array including every key in properties. Missing 'id'.";
  assert.equal(isFoodModelUnavailable(message), true);
  assert.equal(isFoodModelUnavailable('Invalid argument: the tool schema was rejected.'), true);
});

test('a spoken meal becomes macro rows the food log can insert', () => {
  const fallback = fallbackFoodLog('2 eggs and toast with butter');
  assert.ok(fallback);
  const plan = planNutritionChanges([], fallback.operations);
  const names = plan.inserts.map((row) => row.name).sort();
  assert.deepEqual(names, ['Butter', 'Egg', 'Toast']);
  const calories = plan.inserts.reduce((sum, row) => sum + (row.calories ?? 0), 0);
  const protein = plan.inserts.reduce((sum, row) => sum + (row.protein_g ?? 0), 0);
  assert.ok(calories >= 220 && calories <= 320, `calories ${calories}`);
  assert.ok(protein >= 12 && protein <= 20, `protein ${protein}`);
  assert.ok(plan.inserts.every((row) => row.calories != null && row.protein_g != null && row.fat_g != null && row.carbs_g != null));
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.deletes.length, 0);
});

test('chicken and rice scale by the spoken portion', () => {
  const fallback = fallbackFoodLog('I had a chicken breast and a cup of rice');
  assert.ok(fallback);
  const plan = planNutritionChanges([], fallback.operations);
  const chicken = plan.inserts.find((row) => row.name === 'Chicken breast');
  const rice = plan.inserts.find((row) => row.name === 'Rice');
  assert.ok(chicken);
  assert.ok(rice);
  assert.equal(chicken.quantity, '6 oz');
  assert.equal(rice.quantity, '1 cup');
  assert.ok((chicken.protein_g ?? 0) > 30);
  assert.ok((rice.calories ?? 0) > 150);
});

test('corrections are not invented as new foods when the model is down', () => {
  assert.equal(fallbackFoodLog('actually delete the eggs'), null);
});

test('an update still targets the existing food id', () => {
  const plan = planNutritionChanges(
    [{ id: 'egg-1', name: 'Egg' }],
    [{
      op: 'update',
      id: 'egg-1',
      name: 'Egg',
      quantity: '3',
      calories: 216,
      protein_g: 18.9,
      fat_g: 14.4,
      carbs_g: 1.2,
      fiber_g: 0,
      sugar_g: 0.6,
      sodium_mg: 213,
    }],
  );
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].id, 'egg-1');
  assert.equal(plan.updates[0].patch.calories, 216);
});

test('updated-ago stamps use the newest timestamp in plain language', () => {
  const now = Date.parse('2026-11-01T12:00:00.000Z');
  assert.equal(formatUpdatedAgo('2026-11-01T11:00:00.000Z', now), 'Updated 1 hour ago');
  assert.equal(formatUpdatedAgo('2026-11-01T11:55:00.000Z', now), 'Updated 5 min ago');
  assert.equal(formatUpdatedAgo(null, now), null);
});
