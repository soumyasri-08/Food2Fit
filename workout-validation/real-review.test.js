const { test } = require('node:test');
const assert = require('node:assert/strict');
const { review, metrics } = require('./real-review');
const catalog = [{ name: 'Bodyweight movement', movement: 'push', equipment: 'none' },
  { name: 'Gym movement', movement: 'push', equipment: 'gym' }];
const input = { equipment: 'none', expectedDays: [1], days: [{ day: 1, exercises: [
  { name: 'Bodyweight movement', sets: 3, repetitions: 10, workSeconds: 0, restSeconds: 60 }
] }] };
test('independent labels follow equipment and numeric policy', () => {
  assert.equal(review(input, catalog).label, 0);
  const invalid = structuredClone(input);
  invalid.days[0].exercises[0].name = 'Gym movement';
  assert.equal(review(invalid, catalog).label, 1);
  invalid.days[0].exercises[0].name = 'Bodyweight movement';
  invalid.days[0].exercises[0].sets = 5;
  assert.equal(review(invalid, catalog).label, 1);
  assert.equal(review({}, catalog).label, null);
});
test('single-class real pilot has undefined positive precision and recall', () => {
  const result = metrics([{ expected: 0, predicted: 0 }]);
  assert.equal(result.accuracy, 1);
  assert.equal(result.precision, null);
  assert.equal(result.recall, null);
});
test('errors and abstentions use the correct denominators', () => {
  const result = metrics([{ expected: 1, predicted: 1 }, { expected: 0, predicted: 1 },
    { expected: 1, predicted: 0 }, { expected: 0, predicted: 0 }, { expected: 1, predicted: null }]);
  assert.deepEqual(result.confusion, { tp: 1, tn: 1, fp: 1, fn: 1 });
  assert.equal(result.accuracy, .5);
  assert.equal(result.precision, .5);
  assert.equal(result.recall, .5);
  assert.equal(result.coverage, .8);
});
