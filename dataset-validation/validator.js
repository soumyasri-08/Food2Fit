const fields = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
const normalize = s => String(s).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
function features(expected, reported) {
  const errors = fields.map(k => Math.abs(reported[k] - expected[k]) / Math.max(expected[k], k === 'calories' ? 100 : 10));
  return [...errors, Math.max(...errors)];
}
function probability(model, x) {
  const z = model.bias + x.reduce((s, v, i) => s + v * model.weights[i], 0);
  return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, z))));
}
function validate(recipe, foods, model) {
  const issues = [], expected = Object.fromEntries(fields.map(k => [k, 0]));
  if (!Array.isArray(recipe?.ingredients) || !recipe.ingredients.length || !Number.isInteger(recipe.servings) || recipe.servings < 1 || !fields.every(k => Number.isFinite(recipe.nutrition?.[k]) && recipe.nutrition[k] >= 0)) return { status: 'insufficient_information', issues: ['Provide ingredients, positive integer servings and all five numeric nutrition values.'] };
  for (const item of recipe.ingredients) {
    const candidates = foods.filter(f => normalize(f.name) === normalize(item.name));
    const weight = /^\s*(\d+(?:\.\d+)?)\s*(g|grams?|kg|kilograms?)\s*$/i.exec(item.quantity);
    if (candidates.length !== 1 || !weight || Number(weight[1]) <= 0) { issues.push(`${item.name}: exact food name and explicit gram/kg weight required.`); continue; }
    const grams = Number(weight[1]) * (/^k/i.test(weight[2]) ? 1000 : 1);
    for (const k of fields) expected[k] += candidates[0][k] * grams / 100 / recipe.servings;
  }
  if (issues.length || !fields.every(k => Number.isFinite(expected[k]))) return { status: 'insufficient_information', issues };
  const score = probability(model, features(expected, recipe.nutrition));
  return { status: score >= model.threshold ? 'likely_inconsistent' : 'likely_consistent', modelScore: score,
    expectedPerServing: expected, reportedPerServing: recipe.nutrition,
    notice: 'Synthetic-trained nutrition consistency prototype. Score is not calibrated confidence. Not a safety or medical assessment.' };
}
module.exports = { fields, normalize, features, probability, validate };
if (require.main === module) {
  const fs = require('node:fs'), path = require('node:path');
  try {
    const recipe = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    console.log(JSON.stringify(validate(recipe, require('./data/reference-foods.json'), require('./model/validator.json')), null, 2));
  } catch (error) { console.error('Validation failed:', error.message); process.exitCode = 1; }
}
