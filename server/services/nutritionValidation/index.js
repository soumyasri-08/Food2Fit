const model = require('./model.json');
const fields = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
const version = 'nutrition-logistic-v1';

function assessNutrition(reference, reported) {
  if (!fields.every(field => Number.isFinite(reference?.[field]) && reference[field] >= 0 &&
    Number.isFinite(reported?.[field]) && reported[field] >= 0)) {
    throw new TypeError('Nutrition assessment requires five finite, nonnegative reference and reported values');
  }
  // Feature order and normalization must match dataset-validation/validator.js.
  const errors = fields.map(field => Math.abs(reported[field] - reference[field]) /
    Math.max(reference[field], field === 'calories' ? 100 : 10));
  const features = [...errors, Math.max(...errors)];
  const logit = model.bias + features.reduce((sum, value, index) => sum + value * model.weights[index], 0);
  const modelScore = 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, logit))));
  return { modelPrediction: modelScore >= model.threshold ? 'inconsistent' : 'consistent', modelScore, version };
}

module.exports = { assessNutrition, version };
