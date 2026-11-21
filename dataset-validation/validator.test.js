const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('./validator');
const foods = require('./data/reference-foods.json');
const model = require('./model/validator.json');
const food = foods[0];
const nutrition = Object.fromEntries(['calories','protein','carbs','fat','fiber'].map(k => [k, food[k]]));
const recipe = { ingredients: [{ name: food.name, quantity: '200 g' }], servings: 2, nutrition };
test('reference arithmetic uses recipe mass and divides by servings', () => {
  const result = validate(recipe, foods, model);
  assert.deepEqual(result.expectedPerServing, nutrition);
  assert.equal(result.status, 'likely_consistent');
  assert.deepEqual(validate({ ...recipe, ingredients: [{ name: food.name, quantity: '0.2 kg' }] }, foods, model).expectedPerServing, nutrition);
});
test('large nutrient overstatement is flagged', () => {
  assert.equal(validate({ ...recipe, nutrition: { ...nutrition, calories: nutrition.calories + 1000 } }, foods, model).status, 'likely_inconsistent');
});
test('unknown foods, ambiguous quantities, duplicate matches and invalid nutrition abstain', () => {
  for (const input of [null, { ...recipe, servings: 0 }, { ...recipe, nutrition: {} }, { ...recipe, ingredients: [{ name: food.name, quantity: '1 cup' }] }, { ...recipe, ingredients: [{ name: 'unknown', quantity: '200 g' }] }]) assert.equal(validate(input, foods, model).status, 'insufficient_information');
  assert.equal(validate(recipe, [...foods, food], model).status, 'insufficient_information');
});
