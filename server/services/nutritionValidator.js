const { prepareProteinNap } = require('../seed/proteinNap');
const fields = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
const normalize = name => String(name).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
let foods;
function validateNutrition(recipe, referenceFoods) {
  const reference = referenceFoods || (foods ||= prepareProteinNap().foods);
  const totals = Object.fromEntries(fields.map(key => [key, 0]));
  const issues = [];
  let matched = 0;
  for (const ingredient of recipe.ingredients) {
    const candidates = reference.filter(food => normalize(food.name) === normalize(ingredient.name));
    const quantity = /^\s*(\d+(?:\.\d+)?)\s*(g|grams?|kg|kilograms?)\s*$/i.exec(ingredient.quantity);
    if (candidates.length !== 1) { issues.push(`${ingredient.name}: no unique exact dataset match.`); continue; }
    if (!quantity || Number(quantity[1]) <= 0) { issues.push(`${ingredient.name}: an explicit weight in grams or kilograms is required.`); continue; }
    const food = candidates[0];
    if (!fields.every(key => Number.isFinite(food[key]) && food[key] >= 0)) { issues.push(`${ingredient.name}: incomplete reference nutrition.`); continue; }
    const grams = Number(quantity[1]) * (/^k/i.test(quantity[2]) ? 1000 : 1);
    matched++;
    for (const key of fields) totals[key] += food[key] * grams / 100;
  }
  const result = { status: 'unverified', source: 'PROTEIN NAP v1.1, Food2Fit 54-food selection', basis: 'per-serving', matchedIngredients: matched, totalIngredients: recipe.ingredients.length, issues,
    notice: 'Nutrition comparison only; not a safety, allergen, or medical assessment.' };
  if (!recipe.ingredients.length || matched !== recipe.ingredients.length || !Number.isInteger(recipe.servings) || recipe.servings < 1) return result;
  if (!fields.every(key => Number.isFinite(recipe.nutrition?.[key]) && recipe.nutrition[key] >= 0)) return result;
  result.comparisons = fields.map(nutrient => {
    const expected = totals[nutrient] / recipe.servings;
    // Project heuristic, not a clinically validated accuracy threshold.
    const tolerance = Math.max(expected * 0.2, nutrient === 'calories' ? 20 : 2);
    return { nutrient, reported: recipe.nutrition[nutrient], calculated: Math.round(expected * 100) / 100,
      differs: Math.abs(recipe.nutrition[nutrient] - expected) > tolerance };
  });
  result.status = result.comparisons.some(item => item.differs) ? 'mismatch' : 'consistent';
  return result;
}
function withNutritionValidation(record) {
  const value = record.toObject ? record.toObject() : record;
  return { ...value, nutritionValidation: validateNutrition(value.recipe) };
}
module.exports = { validateNutrition, withNutritionValidation };
