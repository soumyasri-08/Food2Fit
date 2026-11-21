const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateCases, evaluateCases } = require('./stress-cases');
const library = require('./data/exercises.json');
const validator = require('./validator');
test('stress suite covers catalog, equipment and combined failures with unique inputs', () => {
  const rows = generateCases(library);
  assert(rows.length > 10000);
  assert.equal(new Set(rows.map(row => JSON.stringify(row.input))).size, rows.length);
  const validNames = new Set(rows.filter(row => row.expected === 0).flatMap(row => row.input.days.flatMap(day => day.exercises.map(exercise => exercise.name))));
  assert.equal(validNames.size, library.length);
  assert.deepEqual([...new Set(rows.map(row => row.input.equipment))].sort(), ['gym', 'home', 'none']);
  assert(rows.filter(row => row.category === 'combined-violations').every(row => row.expected === 1));
  assert(rows.filter(row => row.category === 'missing-number').every(row => row.expected === null));
});
test('expected labels stay fixed when model predictions change', () => {
  const model = { weights: Array(7).fill(0), bias: -40, threshold: .5 };
  const negative = evaluateCases(library.slice(0, 2), model, validator);
  const positive = evaluateCases(library.slice(0, 2), { ...model, bias: 40 }, validator);
  assert.deepEqual(negative.map(row => row.expected), positive.map(row => row.expected));
  assert(negative.filter(row => row.predicted !== null).every(row => row.predicted === 0));
  assert(positive.filter(row => row.predicted !== null).every(row => row.predicted === 1));
});
