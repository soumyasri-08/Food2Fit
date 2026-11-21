// Offline evaluation only: never alters model weights, thresholds or training data.
const fs = require('node:fs');
const path = require('node:path');
const nutrition = require('./validator');
const workout = require('../workout-validation/validator');
function summarize(rows) {
  let tp = 0, tn = 0, fp = 0, fn = 0, abstained = 0, expectedAbstentions = 0;
  for (const { expected, predicted } of rows) {
    if (expected === null) { expectedAbstentions++; continue; }
    if (predicted === null) { abstained++; continue; }
    if (expected) predicted ? tp++ : fn++;
    else predicted ? fp++ : tn++;
  }
  const classified = tp + tn + fp + fn;
  const divide = (a, b) => b ? a / b : null;
  return { count: rows.length, classified, abstainedOnLabeledCases: abstained,
    expectedAbstentions, correctAbstentions: rows.filter(r => r.expected === null && r.predicted === null).length,
    classificationCoverage: divide(rows.filter(r => r.predicted !== null).length, rows.length),
    accuracy: divide(tp + tn, classified), precision: divide(tp, tp + fp),
    recall: divide(tp, tp + fn), f1: divide(2 * tp, 2 * tp + fp + fn),
    specificity: divide(tn, tn + fp), confusion: { tp, tn, fp, fn } };
}
function multiNutrientCases(foods, model) {
  const cases = [];
  // Predefined Cartesian grid, retaining every result, including correct predictions.
  // Small concurrent differences expose behavior absent from single-error cases.
  for (const food of foods) for (const magnitude of [.05, .15, .19, .199, .201, .25]) {
    for (const pattern of ['over', 'under', 'mixed']) for (const [grams, servings] of [[100, 1], [250, 2]]) {
      const reference = Object.fromEntries(nutrition.fields.map(k => [k, food[k] * grams / 100 / servings]));
      const reported = Object.fromEntries(nutrition.fields.map((k, i) => {
        const direction = pattern === 'over' ? 1 : pattern === 'under' ? -1 : i % 2 ? -1 : 1;
        return [k, Math.max(0, reference[k] + direction * magnitude * Math.max(reference[k], k === 'calories' ? 100 : 10))];
      }));
      const input = { ingredients: [{ name: food.name, quantity: `${grams} g` }], servings, nutrition: reported };
      // Ground truth comes from the documented tolerance, independently of prediction.
      const expected = Number(nutrition.fields.some(k => Math.abs(reported[k] - reference[k]) > Math.max(.2 * reference[k], k === 'calories' ? 20 : 2)));
      const result = nutrition.validate(input, foods, model);
      cases.push({ id: `multi-${food.id}-${magnitude}-${pattern}-${grams}-${servings}`,
        category: 'multiple-nutrient-differences', input, reference, expected,
        predicted: result.status === 'insufficient_information' ? null : Number(result.status === 'likely_inconsistent') });
    }
  }
  return cases;
}
function nutritionCases() {
  const model = require('./model/validator.json');
  const foods = require('./data/reference-foods.json');
  // Frozen held-out food identities; this suite is not used for tuning.
  const heldOut = require('./reports/evaluation.json').splitFoods.test;
  const cases = [];
  for (const food of foods.filter(f => heldOut.includes(f.id))) {
    for (const direction of [-1, 1]) for (const magnitude of [.05, .19, .199, .201, .21, .4]) {
      for (const nutrient of nutrition.fields) {
        const reported = Object.fromEntries(nutrition.fields.map(k => [k, food[k]]));
        reported[nutrient] = Math.max(0, food[nutrient] + direction * magnitude * Math.max(food[nutrient], nutrient === 'calories' ? 100 : 10));
        const input = { ingredients: [{ name: food.name, quantity: '100 g' }], servings: 1, nutrition: reported };
        const expected = Number(nutrition.fields.some(k => Math.abs(reported[k] - food[k]) > .2 * Math.max(food[k], k === 'calories' ? 100 : 10)));
        const result = nutrition.validate(input, foods, model);
        cases.push({ id: `${food.id}-${nutrient}-${direction}-${magnitude}`, expected, predicted: Number(result.status === 'likely_inconsistent') });
      }
    }
  }
  cases.push(...multiNutrientCases(foods.filter(f => heldOut.includes(f.id)), model));
  const sample = require('./examples/recipe.json');
  for (const [id, input] of [['missing-fields', {}], ['unknown-food', { ...sample, ingredients: [{ name: 'Unknown food', quantity: '100 g' }] }], ['ambiguous-unit', { ...sample, ingredients: [{ ...sample.ingredients[0], quantity: '1 bowl' }] }]]) {
    const result = nutrition.validate(input, foods, model);
    cases.push({ id, expected: null, predicted: result.status === 'insufficient_information' ? null : Number(result.status === 'likely_inconsistent') });
  }
  return cases;
}
function buildWorkoutCases() {
  const library = require('../workout-validation/data/exercises.json');
  const model = require('../workout-validation/model/workout-model.json');
  return require('../workout-validation/stress-cases').evaluateCases(library, model, workout);
}

function buildRawWorkoutResults() {
  const rawExperimentsDir = path.join(__dirname, '..', 'workout-validation', 'raw-experiments');
  if (!fs.existsSync(rawExperimentsDir)) return null;
  const runs = fs.readdirSync(rawExperimentsDir).filter(d => fs.existsSync(path.join(rawExperimentsDir, d, 'model.json'))).sort();
  if (!runs.length) return null;
  const latestDir = path.join(rawExperimentsDir, runs[runs.length - 1]);
  const model = JSON.parse(fs.readFileSync(path.join(latestDir, 'model.json'), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(latestDir, 'report.json'), 'utf8'));
  const dataDir = path.join(__dirname, '..', 'workout-validation', 'data');
  const allRows = [];
  for (const split of ['train', 'validation', 'test']) {
    const splitPath = path.join(dataDir, `${split}.jsonl`);
    if (!fs.existsSync(splitPath)) return null;
    allRows.push(...fs.readFileSync(splitPath, 'utf8').trim().split('\n').map(JSON.parse));
  }
  const raw = require('../workout-validation/raw-model');
  const library = require('../workout-validation/data/exercises.json');
  const predictions = allRows.map(row => {
    const result = raw.validate(row.input, library, model);
    return { expected: row.label, predicted: result.status === 'cannot_verify' ? null : Number(result.modelPrediction === 'inconsistent') };
  });
  return { modelType: 'raw-feature logistic regression (experimental)',
    totalDataset: allRows.length, split: report.splitCounts,
    threshold: report.threshold, features: report.features.length,
    metrics: summarize(predictions), limitations: report.limitations };
}

function evaluate(target, { quiet = false } = {}) {
  if (target && !['dataset-validation', 'workout-validation'].includes(target)) throw new Error('Unknown evaluation target');
  const reports = {};

  // Nutrition evaluation
  if (!target || target === 'dataset-validation') {
    const rows = nutritionCases();
    const report = { evaluationType: 'synthetic-challenge', modelChanged: false,
      description: 'Expanded synthetic stress suite: single and multiple nutrient differences, under/overstatements, boundary errors, portions and servings. Previously inspected held-out food identities; not an independent real-AI benchmark.',
      metrics: summarize(rows),
      limitations: ['Synthetic rule labels, not independent expert labels.', 'Perfect scores are possible; no errors or label noise are injected to force lower metrics.', 'Coverage is separate from accuracy; abstentions are not counted as correct binary predictions.', 'Do not tune on this suite and then present it as unseen evaluation.'], cases: rows };
    fs.writeFileSync(path.join(__dirname, '..', 'dataset-validation', 'reports/challenge-evaluation.json'), JSON.stringify(report, null, 2) + '\n');
    reports['dataset-validation'] = report;
    if (!quiet) console.log(JSON.stringify({ folder: 'dataset-validation', ...report.metrics }));
  }

  // Workout evaluation — use raw-feature model (10,000 examples, realistic metrics)
  if (!target || target === 'workout-validation') {
    const rawResult = buildRawWorkoutResults();
    if (rawResult) {
      const report = { evaluationType: 'raw-feature-model', modelChanged: false,
        description: 'Raw-feature logistic regression evaluated on all 10,000 synthetic workout examples (train + validation + test). 24 numeric summary features; threshold selected by macro-F1 on validation split.',
        metrics: rawResult.metrics,
        limitations: rawResult.limitations };
      fs.writeFileSync(path.join(__dirname, '..', 'workout-validation', 'reports/challenge-evaluation.json'), JSON.stringify(report, null, 2) + '\n');
      reports['workout-validation'] = report;
      if (!quiet) console.log(JSON.stringify({ folder: 'workout-validation', totalDataset: rawResult.totalDataset, ...rawResult.metrics }));
    }
  }

  return reports;
}
module.exports = { summarize, evaluate, multiNutrientCases };
function evaluateRawWorkout(directory) {
    const model = JSON.parse(fs.readFileSync(path.resolve(directory, 'model.json'), 'utf8'));
    const report = JSON.parse(fs.readFileSync(path.resolve(directory, 'report.json'), 'utf8'));
    const bytes = fs.readFileSync(path.join(__dirname, '../workout-validation/data/test.jsonl'));
    const hash = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    if (hash !== report.dataHashes.test) throw new Error('Test dataset changed since this experiment');
    const raw = require('../workout-validation/raw-model');
    const library = require('../workout-validation/data/exercises.json');
    const predictions = bytes.toString().trim().split('\n').map(JSON.parse).map(row => {
      const result = raw.validate(row.input, library, model);
      return { expected: row.label, predicted: result.status === 'cannot_verify' ? null : Number(result.modelPrediction === 'inconsistent') };
    });
    return { folder: 'workout-validation', modelType: 'raw-workout experimental classifier',
      evaluationType: 'held-out synthetic test', totalDatasetExamples: report.totalExamples,
      splitCounts: report.splitCounts, modelDirectory: path.resolve(directory),
      ...summarize(predictions), limitations: report.limitations };
}
if (require.main === module) {
  const rawIndex = process.argv.indexOf('--raw-workout');
  if (process.argv.includes('--legacy-workout')) evaluate();
  else {
    let directory;
    if (rawIndex !== -1) {
      directory = process.argv[rawIndex + 1];
      if (!directory) throw new Error('Provide the raw experiment directory after --raw-workout');
    } else {
      const experiments = path.join(__dirname, '../workout-validation/raw-experiments');
      const completed = fs.readdirSync(experiments, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(experiments, entry.name))
        .filter(folder => fs.existsSync(path.join(folder, 'model.json')) && fs.existsSync(path.join(folder, 'report.json')))
        .sort((a, b) => path.basename(b).localeCompare(path.basename(a), undefined, { numeric: true }));
      if (!completed.length) throw new Error('Train the raw workout model with node workout-validation/train.js --raw first');
      directory = completed[0];
    }
    const result = evaluateRawWorkout(directory);
    if (rawIndex === -1) evaluate('dataset-validation');
    console.log(JSON.stringify(result, null, 2));
  }
}
