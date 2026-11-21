const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { prepareProteinNap, SOURCE } = require('../seed/proteinNap');
const Food = require('../models/Food');
const { buildMealPlan, eligibleFoods } = require('../services/fitnessEngine');
const dataDir = path.join(__dirname, '../../protein-nap-dataset');

test('bundled official archive matches publisher checksum', () => {
  const archive = fs.readFileSync(path.join(dataDir, 'protein_nap_db.zip'));
  assert.equal(archive.length, 8183183);
  assert.equal(createHash('md5').update(archive).digest('hex'), '6de773710141bb8fa30e1f4a1c298d78');
});

test('PROTEIN NAP mapping preserves per-100g nutrition and produces valid models', async () => {
  const result = prepareProteinNap();
  assert.equal(result.sourceRecords, 1914);
  assert.equal(result.foods.length, 54);
  assert.equal(result.csv, fs.readFileSync(path.join(dataDir, 'protein-nap-normalized.csv'), 'utf8'));
  const apple = result.foods.find(f => f.name === 'Apples, raw, with skin');
  assert.equal(apple.calories, 52);
  assert.equal(apple.protein, 0.26);
  assert.equal(apple.servingGrams, 182);
  assert.equal(apple.source, SOURCE);
  for (const food of result.foods) await new Food(food).validate();
});

test('missing nutrition or changed source units fails before database writes', () => {
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'protein-nap-foods.json')));
  const apple = data.foods.find(f => f.id === 3730);
  apple.nutrition_informations = apple.nutrition_informations.filter(n => n.nutrient_id !== 20);
  assert.throws(() => prepareProteinNap(data), /Missing\/ambiguous nutrient/);
  data.nutrients.find(n => n.id === 5).unit_of_measure.code = 'KILOJOULE';
  assert.throws(() => prepareProteinNap(data), /Unexpected.*unit/);
});

test('real dataset builds seven-day plans and respects diet/allergy filters', () => {
  const foods = prepareProteinNap().foods.map((f, i) => ({ ...f, _id: String(i + 1) }));
  const base = { age: 30, gender: 'male', height: 175, weight: 75, activityLevel: 'moderate', goal: 'maintenance', allergies: ['milk', 'egg', 'fish', 'peanut', 'tree-nut'], workoutDays: 3, equipment: 'none' };
  for (const dietPreference of ['vegan', 'veg', 'non-veg', 'keto']) {
    const profile = { ...base, dietPreference, allergies: dietPreference === 'keto' ? [] : base.allergies };
    const allowed = new Set(eligibleFoods(profile, foods).map(f => f._id));
    const plan = buildMealPlan(profile, foods);
    assert.equal(plan.days.length, 7);
    for (const day of plan.days) {
      assert.equal(day.meals.length, 4);
      for (const meal of day.meals) for (const food of meal.foods) assert.ok(allowed.has(food.food));
    }
  }
  assert.throws(() => buildMealPlan({ ...base, dietPreference: 'keto' }, foods), { code: 'INSUFFICIENT_FOODS' });
});
