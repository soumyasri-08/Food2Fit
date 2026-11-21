const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const raw = require('./raw-model');
const { summarize } = require('../dataset-validation/evaluate');
const library = require('./data/exercises.json');
const splits = {};
const groupSplits = new Map();
const signatures = new Set();
const dataHashes = {};
for (const split of ['train', 'validation', 'test']) {
  const bytes = fs.readFileSync(path.join(__dirname, `data/${split}.jsonl`));
  dataHashes[split] = crypto.createHash('sha256').update(bytes).digest('hex');
  splits[split] = bytes.toString().trim().split('\n').map(JSON.parse).map(row => {
    if (groupSplits.has(row.groupId)) assert.equal(groupSplits.get(row.groupId), split);
    groupSplits.set(row.groupId, split);
    const signature = JSON.stringify(row.input);
    assert(!signatures.has(signature), 'Duplicate input across dataset');
    signatures.add(signature);
    const values = raw.extract(row.input, library);
    assert(values && values.every(Number.isFinite));
    return { ...row, values };
  });
}
const dimension = raw.featureNames.length;
const training = splits.train;
const means = Array.from({ length: dimension }, (_, i) => training.reduce((sum, row) => sum + row.values[i], 0) / training.length);
const scales = means.map((mean, i) => Math.sqrt(training.reduce((sum, row) => sum + (row.values[i] - mean) ** 2, 0) / training.length) || 1);
const positives = training.filter(row => row.label === 1).length;
const classWeights = [training.length / (2 * (training.length - positives)), training.length / (2 * positives)];
const model = { algorithm: 'logistic-regression', featureVersion: 'raw-summary-v1', featureNames: raw.featureNames,
  weights: Array(dimension).fill(0), bias: 0, threshold: .5, means, scales, classWeights,
  trainingOrigin: 'synthetic-rule-labels', deployed: false };
const matrix = training.map(row => ({ values: raw.standardize(row.values, model), label: row.label }));
// Fixed optimization settings, chosen before evaluating held-out test predictions.
for (let epoch = 0; epoch < 1200; epoch++) {
  const gradient = Array(dimension).fill(0);
  let biasGradient = 0;
  for (const row of matrix) {
    const z = row.values.reduce((sum, value, i) => sum + value * model.weights[i], model.bias);
    const probability = 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, z))));
    const error = (probability - row.label) * classWeights[row.label];
    biasGradient += error;
    row.values.forEach((value, i) => { gradient[i] += error * value; });
  }
  model.bias -= .05 * biasGradient / matrix.length;
  model.weights = model.weights.map((weight, i) => weight - .05 * (gradient[i] / matrix.length + .001 * weight));
}
function evaluate(rows, threshold) {
  const predictions = rows.map(row => ({ groupId: row.groupId, expected: row.label,
    probability: raw.probability(row.values, model), predicted: Number(raw.probability(row.values, model) >= threshold) }));
  const metrics = summarize(predictions);
  const { tp, tn, fp, fn } = metrics.confusion;
  const negativeF1 = 2 * tn / (2 * tn + fp + fn || 1);
  return { metrics: { ...metrics, macroF1: ((metrics.f1 || 0) + negativeF1) / 2 }, predictions };
}
let best = -1;
for (let step = 1; step < 1000; step++) {
  const threshold = step / 1000;
  const result = evaluate(splits.validation, threshold);
  if (result.metrics.macroF1 > best) {
    best = result.metrics.macroF1;
    model.threshold = threshold;
  }
}
const validation = evaluate(splits.validation, model.threshold);
const test = evaluate(splits.test, model.threshold);
const directory = path.join(__dirname, 'raw-experiments', `${Date.now()}-${process.pid}`);
fs.mkdirSync(directory, { recursive: true });
const save = (file, value) => fs.writeFileSync(path.join(directory, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const report = { modelType: 'experimental raw-workout logistic regression', totalExamples: signatures.size,
  splitCounts: Object.fromEntries(Object.entries(splits).map(([name, rows]) => [name, rows.length])),
  dataHashes, features: model.featureNames, threshold: model.threshold,
  thresholdSelection: 'Maximum macro-F1 on validation only; scaling and class weights fitted on training only.',
  validation: validation.metrics, test: test.metrics,
  limitations: ['Labels remain synthetic project-rule labels. Test cases were previously evaluated with an earlier model.',
    'Raw summary features may lose per-exercise and equipment relationships. This is an experimental baseline.',
    'Scores describe the dataset distribution; independent expert evaluation remains pending.'] };
save('model.json', model);
save('report.json', report);
save('test-predictions.json', test.predictions);
save('validation-predictions.json', validation.predictions);
console.log(JSON.stringify({ directory, ...report }, null, 2));
