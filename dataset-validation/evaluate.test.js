const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize, multiNutrientCases } = require('./evaluate');
test('expanded labels follow reference arithmetic and do not depend on model predictions', () => {
  const food = { id: 1, name: 'Test reference', calories: 200, protein: 20, carbs: 30, fat: 10, fiber: 5 };
  const model = { weights: Array(6).fill(0), bias: -40, threshold: .5 };
  const rows = multiNutrientCases([food], model);
  const other = multiNutrientCases([food], { ...model, bias: 40 });
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  assert.deepEqual(rows.map(r => r.expected), other.map(r => r.expected));
  assert(rows.every(r => r.predicted === 0));
  assert(other.every(r => r.predicted === 1));
  assert(rows.some(r => r.expected === 0) && rows.some(r => r.expected === 1));
  for (const r of rows) {
    const expected = Number(Object.keys(r.reference).some(k => Math.abs(r.input.nutrition[k] - r.reference[k]) > Math.max(.2 * r.reference[k], k === 'calories' ? 20 : 2)));
    assert.equal(r.expected, expected);
  }
});
test('reports false positives and false negatives without hiding abstentions', () => {
  const report = summarize([
    { expected: 1, predicted: 1 }, { expected: 0, predicted: 0 },
    { expected: 0, predicted: 1 }, { expected: 1, predicted: 0 },
    { expected: 1, predicted: null }, { expected: null, predicted: null }
  ]);
  assert.equal(report.accuracy, .5);
  assert.equal(report.precision, .5);
  assert.equal(report.recall, .5);
  assert.equal(report.classificationCoverage, 4 / 6);
  assert.equal(report.abstainedOnLabeledCases, 1);
  assert.equal(report.correctAbstentions, 1);
});
test('undefined metrics are null, not perfect or fabricated zero scores', () => {
  assert.equal(summarize([]).accuracy, null);
  assert.equal(summarize([{ expected: 0, predicted: 0 }]).precision, null);
});
