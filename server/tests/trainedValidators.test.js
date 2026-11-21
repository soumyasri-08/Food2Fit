const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assessNutrition } = require('../services/nutritionValidation');
const prototype = require('../../dataset-validation/validator');
const model = require('../../dataset-validation/model/validator.json');
test('deployed nutrition model reproduces prototype scores before any correction', () => {
  const reference = { calories: 200, protein: 20, carbs: 30, fat: 10, fiber: 5 };
  for (const factor of [0, .8, 1, 1.19, 1.5, 3]) {
    const reported = Object.fromEntries(Object.entries(reference).map(([key,value]) => [key,value*factor]));
    const result = assessNutrition(reference,reported);
    const expected = prototype.probability(model,prototype.features(reference,reported));
    assert.equal(result.modelScore,expected);
    assert.equal(result.modelPrediction,expected>=model.threshold?'inconsistent':'consistent');
  }
  assert.throws(()=>assessNutrition(reference,{}),TypeError);
});
test('deployed workout model uses raw features and the selected experiment weights', () => {
  const deployed = require('../services/workoutValidation/raw-model.json');
  assert.equal(deployed.featureVersion,'raw-summary-v1');
  assert.equal(deployed.weights.length,24);
  assert.deepEqual(deployed,require('../../workout-validation/raw-experiments/1795195945590-10632/model.json'));
});
