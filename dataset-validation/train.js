// Reproducible, dependency-free logistic regression prototype. No API calls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { fields, normalize, features, probability, validate } = require('./validator');
const root = __dirname;
const sourcePath = path.join(root, '../protein-nap-dataset/protein-nap-foods.json');
const sourceBytes = fs.readFileSync(sourcePath), source = JSON.parse(sourceBytes);
let seed = 20261029;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function save(file, value) { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); }
const ids = [5, 1, 3, 2, 20];
ids.forEach((id, i) => assert.equal(source.nutrients.find(n => n.id === id)?.unit_of_measure?.code, i ? 'GRAM' : 'KILOCALORIE'));
const excluded = [], foods = [], names = new Set();
for (const food of source.foods) {
  // USDA-origin records use the same per-100g basis as the project's existing importer.
  if (food.information_source_id !== 0) { excluded.push({ id: food.id, reason: 'Other source: nutrient basis not audited for this prototype' }); continue; }
  const values = ids.map(id => food.nutrition_informations.filter(n => n.nutrient_id === id));
  if (values.some((v, i) => v.length !== 1 || !Number.isFinite(v[0].value) || v[0].value < 0 || v[0].value > (i ? 100 : 1000))) { excluded.push({ id: food.id, reason: 'Missing, duplicate or out-of-range nutrient' }); continue; }
  const name = normalize(food.name);
  if (!name || names.has(name)) { excluded.push({ id: food.id, reason: 'Empty or duplicate normalized name' }); continue; }
  names.add(name);
  foods.push({ id: food.id, name: food.name.trim(), basis: 'per_100g', ...Object.fromEntries(fields.map((k, i) => [k, values[i][0].value])) });
}
assert(foods.length > 50);
// Split by food identity BEFORE generating examples; no food occurs in two splits.
const shuffled = shuffle([...foods]);
const cut1 = Math.floor(foods.length * .7), cut2 = Math.floor(foods.length * .85);
const pools = { train: shuffled.slice(0, cut1), validation: shuffled.slice(cut1, cut2), test: shuffled.slice(cut2) };
const splits = {};
for (const [split, pool] of Object.entries(pools)) {
  splits[split] = [];
  for (let i = 0; i < (split === 'train' ? 2400 : 600); i++) {
    const chosen = shuffle([...pool]).slice(0, 1 + Math.floor(random() * 4));
    const servings = 1 + Math.floor(random() * 4);
    const expected = Object.fromEntries(fields.map(k => [k, 0]));
    const ingredients = chosen.map(f => { const grams = 20 + Math.floor(random() * 281); for (const k of fields) expected[k] += f[k] * grams / 100 / servings; return { foodId: f.id, name: f.name, quantity: `${grams} g` }; });
    const reported = Object.fromEntries(fields.map(k => [k, Math.max(0, expected[k] + (random() * 2 - 1) * .18 * Math.max(expected[k], k === 'calories' ? 100 : 10))]));
    const label = i % 2;
    if (label) { const k = fields[Math.floor(random() * fields.length)]; reported[k] = expected[k] + (.22 + random() * 1.28) * Math.max(expected[k], k === 'calories' ? 100 : 10); }
    const x = features(expected, reported);
    assert.equal(Math.max(...x) > .2 ? 1 : 0, label);
    splits[split].push({ id: `${split}-${i}`, origin: 'synthetic', ingredients, servings, expectedPerServing: expected, nutrition: reported, label, features: x });
  }
}
const model = { algorithm: 'logistic-regression', weights: Array(6).fill(0), bias: 0, threshold: .5, featureNames: [...fields.map(k => `${k}_normalized_absolute_error`), 'maximum_error'], trainingOrigin: 'synthetic', seed: 20261029 };
for (let epoch = 0; epoch < 1800; epoch++) {
  const gradient = Array(6).fill(0); let bias = 0;
  for (const row of splits.train) { const error = probability(model, row.features) - row.label; bias += error; row.features.forEach((v, i) => { gradient[i] += error * v; }); }
  model.bias -= .2 * bias / splits.train.length;
  model.weights = model.weights.map((w, i) => w - .2 * (gradient[i] / splits.train.length + .0001 * w));
}
function metrics(rows, threshold) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const r of rows) { const predicted = probability(model, r.features) >= threshold; if (r.label) predicted ? tp++ : fn++; else predicted ? fp++ : tn++; }
  return { count: rows.length, accuracy: (tp + tn) / rows.length, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1), f1: 2 * tp / (2 * tp + fp + fn || 1), confusion: { tp, tn, fp, fn } };
}
let best = -1;
for (let t = .05; t <= .95; t += .01) { const score = metrics(splits.validation, t).f1; if (score > best) { best = score; model.threshold = Number(t.toFixed(2)); } }
for (const [a, pool] of Object.entries(pools)) for (const [b, other] of Object.entries(pools)) if (a !== b) assert(!pool.some(f => other.some(g => g.id === f.id || normalize(g.name) === normalize(f.name))));
const demo = splits.test.find(r => r.label === 1);
assert.equal(validate({ ...demo, ingredients: [{ name: 'unknown food', quantity: '1 cup' }] }, foods, model).status, 'insufficient_information');
assert.equal(validate({ ...demo, servings: 0 }, foods, model).status, 'insufficient_information');
assert.equal(validate({ ...demo, ingredients: demo.ingredients.map(i => ({ ...i, quantity: '1 cup' })) }, foods, model).status, 'insufficient_information');
const report = { sourceRecords: source.foods.length, eligibleFoods: foods.length, excludedFoods: excluded.length, sourceSha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
  splitFoods: Object.fromEntries(Object.entries(pools).map(([k,v]) => [k, v.map(f => f.id)])),
  validation: metrics(splits.validation, model.threshold), test: metrics(splits.test, model.threshold),
  checks: ['Unique normalized food names', 'Nutrient units and ranges checked', 'Food-disjoint splits', 'Synthetic labels verified', 'Unknown foods and ambiguous units abstain'],
  realGeminiEvaluation: 'NOT PERFORMED: all examples are synthetic; no real-world accuracy claim.',
  limitations: ['Labels follow a project-defined 20% normalized-error rule, not expert judgments.', 'Synthetic errors do not represent all Gemini failure modes.', 'Model requires reference lookup and grams; it does not understand arbitrary text.', 'Similar food varieties may still exist across splits.', 'Deterministic label rule is an exact baseline on these synthetic examples; ML is experimental.'] };
save('data/reference-foods.json', foods); save('reports/exclusions.json', excluded);
for (const [split, rows] of Object.entries(splits)) save(`data/${split}.jsonl`, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
save('model/validator.json', model); save('reports/evaluation.json', report);
save('examples/recipe.json', { ingredients: demo.ingredients, servings: demo.servings, nutrition: demo.nutrition });
save('examples/result.json', validate(demo, foods, model));
// Evaluate after fitting; challenge cases never select weights or threshold.
const challenge = require('./evaluate').evaluate('dataset-validation', { quiet: true })['dataset-validation'];
report.evaluationType = 'synthetic-rule-labels';
report.challenge = challenge.metrics;
report.realAIResponseEvaluation = challenge.realAIResponseEvaluation;
save('reports/evaluation.json', report);
console.log(JSON.stringify({ eligibleFoods: foods.length, syntheticExamples: 3600,
  syntheticValidation: report.validation, syntheticHeldOutTest: report.test,
  additionalChallenge: report.challenge, realAIResponseEvaluation: report.realAIResponseEvaluation,
  notice: 'Scores measure synthetic label agreement, not real AI accuracy. Fixed seed makes training reproducible.' }, null, 2));
