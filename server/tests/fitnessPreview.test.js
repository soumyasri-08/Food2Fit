const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { artifacts, output } = require('../scripts/buildFitnessPreview');
const { prepareProteinNap } = require('../seed/proteinNap');
const { buildMealPlan, buildWorkoutPlan } = require('../services/fitnessEngine');
const previewUrl = pathToFileURL(path.join(output, 'index.js')).href;

test('browser artifacts are reproducible from backend engine and official food selection', () => {
  for (const [name, content] of Object.entries(artifacts())) assert.equal(fs.readFileSync(path.join(output, name), 'utf8'), content);
});

test('browser plans match backend results and regenerate from changed preferences', async () => {
  const { generatePreviewPlan, defaultProfile } = await import(previewUrl);
  const foods = prepareProteinNap().foods.map((f, i) => ({ ...f, _id: `protein-nap-${i + 1}` }));
  const exercises = require('../seed/data/exercises.json').map((e, i) => ({ ...e, _id: `exercise-${i + 1}` }));
  const initial = generatePreviewPlan(defaultProfile);
  const profile = { ...defaultProfile, dietPreference: 'vegan', goal: 'muscle-gain', workoutDays: 3, equipment: 'none', allergies: ['peanut'] };
  const updated = generatePreviewPlan(profile);
  assert.deepEqual(updated.mealPlan, buildMealPlan(profile, foods));
  assert.deepEqual(updated.workoutPlan, buildWorkoutPlan(profile, exercises));
  assert.notEqual(updated.mealPlan.targets.calories, initial.mealPlan.targets.calories);
  assert.equal(updated.workoutPlan.days.length, 3);
  assert.ok(updated.mealPlan.sources.every(source => source.startsWith('PROTEIN NAP')));
});

test('different body measurements and activity recalculate meal amounts and persist in preview', async () => {
  const { generatePreviewPlan, defaultProfile } = await import(previewUrl);
  let stored = null;
  global.localStorage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  try {
    const { readDemo, updateDemo } = await import(pathToFileURL(path.join(output, '../demo.js')).href);
    const initial = generatePreviewPlan(defaultProfile);
    for (const change of [{ weight: 100 }, { activityLevel: 'sedentary' }, { height: 195 }, { age: 65 }]) {
      const profile = { ...defaultProfile, ...change };
      const generated = generatePreviewPlan(profile);
      updateDemo(d => ({ ...d, ...generated }));
      const loaded = readDemo();
      assert.deepEqual(loaded.profile, profile);
      assert.notEqual(loaded.mealPlan.targets.calories, initial.mealPlan.targets.calories);
      assert.notDeepEqual(loaded.mealPlan.days, initial.mealPlan.days);
      assert.deepEqual(loaded.mealPlan, generated.mealPlan);
    }
  } finally { delete global.localStorage; }
});

test('old preview plans migrate without losing recipes, progress, preferences or deletions', async () => {
  const { defaultProfile, datasetVersion } = await import(previewUrl);
  let stored = JSON.stringify({ profile: defaultProfile, mealPlan: { sources: ['sample'] }, favorites: [{ _id: 'keep-me' }], history: [], progress: [{ date: '2026-10-01', weight: 76 }] });
  global.localStorage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  try {
    const { readDemo, updateDemo } = await import(pathToFileURL(path.join(output, '../demo.js')).href);
    const result = readDemo();
    assert.equal(result.datasetVersion, datasetVersion);
    assert.ok(result.mealPlan.sources.every(source => source.startsWith('PROTEIN NAP')));
    assert.deepEqual(result.profile, defaultProfile);
    assert.equal(result.favorites[0]._id, 'keep-me');
    assert.equal(result.progress[0].weight, 76);
    updateDemo(d => ({ ...d, profile: null, mealPlan: null, workoutPlan: null }));
    assert.equal(readDemo().mealPlan, null);
    stored = JSON.stringify({ profile: null, mealPlan: null, favorites: [], history: [], progress: [] });
    assert.equal(readDemo().profile, null);
    assert.equal(readDemo().mealPlan, null);
  } finally { delete global.localStorage; }
});
