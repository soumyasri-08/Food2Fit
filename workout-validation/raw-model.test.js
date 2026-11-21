const { test } = require('node:test');
const assert = require('node:assert/strict');
const raw = require('./raw-model');
const library = require('./data/exercises.json');
const input = { equipment: 'none', expectedDays: [1], days: [{ day: 1, exercises: [{
  name: library[0].name, sets: 3, repetitions: 10, workSeconds: 0, restSeconds: 60
}] }] };
test('raw features preserve actual numeric magnitudes', () => {
  const values = raw.extract(input, library);
  assert.equal(values.length, raw.featureNames.length);
  assert.equal(values[raw.featureNames.indexOf('setsMaximum')], 3);
  const changed = structuredClone(input);
  changed.days[0].exercises[0].sets = 9;
  assert.equal(raw.extract(changed, library)[raw.featureNames.indexOf('setsMaximum')], 9);
  assert.equal(raw.extract({}, library), null);
});
test('stored scaling and decision threshold are used during inference', () => {
  const size = raw.featureNames.length;
  const model = { means: Array(size).fill(0), scales: Array(size).fill(1), weights: Array(size).fill(0), bias: 0, threshold: .6 };
  assert.equal(raw.validate(input, library, model).modelPrediction, 'consistent');
  assert.equal(raw.validate(input, library, { ...model, threshold: .4 }).modelPrediction, 'inconsistent');
  assert.equal(raw.validate({}, library, model).status, 'cannot_verify');
  const scaled = raw.standardize([5], { means: [3], scales: [2] });
  assert.deepEqual(scaled, [1]);
});
