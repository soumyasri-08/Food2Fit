// Reference-derived labels, independent of the trained model's predictions.
const crypto = require('node:crypto');
const foods = require('./data/reference-foods.json');
const { fields, normalize } = require('./validator');
const referenceHash = crypto.createHash('sha256').update(JSON.stringify(foods)).digest('hex');
const sum = () => Object.fromEntries(fields.map(k => [k, 0]));
const validNutrition = n => fields.every(k => Number.isFinite(n?.[k]) && n[k] >= 0);
function compare(expected, reported) {
  return fields.map(nutrient => {
    const tolerance = Math.max(expected[nutrient] * .2, nutrient === 'calories' ? 20 : 2);
    const difference = reported[nutrient] - expected[nutrient];
    return { nutrient, reference: expected[nutrient], reported: reported[nutrient], difference, tolerance, withinTolerance: Math.abs(difference) <= tolerance };
  });
}
function labelDiet(diet) {
  const issues = [], evidence = [], daily = sum();
  if (!Array.isArray(diet?.meals) || !diet.meals.length || diet.meals.length > 8 || !validNutrition(diet.nutrition)) return { label: 'cannot_verify', issues: ['Missing meals or daily nutrition.'] };
  for (const [index, meal] of diet.meals.entries()) {
    const total = sum(), matched = [];
    if (!Array.isArray(meal?.ingredients) || !meal.ingredients.length || meal.ingredients.length > 40 || !validNutrition(meal.nutrition)) { issues.push(`Meal ${index + 1}: missing ingredients or nutrition.`); continue; }
    for (const ingredient of meal.ingredients) {
      const candidates = foods.filter(f => f.id === ingredient?.foodId && normalize(f.name) === normalize(ingredient?.name));
      if (candidates.length !== 1 || !Number.isFinite(ingredient.grams) || ingredient.grams <= 0 || ingredient.grams > 2000) { issues.push(`Meal ${index + 1}: food ID/name or gram weight cannot be verified.`); continue; }
      const food = candidates[0], contribution = sum();
      for (const k of fields) { contribution[k] = food[k] * ingredient.grams / 100; total[k] += contribution[k]; }
      matched.push({ foodId: food.id, name: food.name, grams: ingredient.grams, per100g: Object.fromEntries(fields.map(k => [k,food[k]])), contribution });
    }
    for (const k of fields) daily[k] += total[k];
    evidence.push({ meal: index + 1, matched, comparisons: compare(total, meal.nutrition) });
  }
  if (issues.length) return { label: 'cannot_verify', issues, referenceHash, reviewStatus: 'pending', trainingEligible: false };
  const comparisons = compare(daily, diet.nutrition);
  const consistent = [...evidence.flatMap(e => e.comparisons), ...comparisons].every(c => c.withinTolerance);
  return { label: consistent ? 'numerically_consistent' : 'numerically_inconsistent', evidence, dailyComparisons: comparisons,
    policyVersion: 'diet-numeric-v1', referenceHash, reviewStatus: 'pending', trainingEligible: false,
    policy: 'Each nutrient within max(20% of reference, 20 kcal or 2 g). Project heuristic, not a medical threshold.',
    scope: 'One-person daily plan; gram amounts reflect named preparation state. Does not assess goal suitability, allergies, omitted ingredients or health outcomes.' };
}
module.exports = { labelDiet, foods };
if (require.main === module) {
  try { console.log(JSON.stringify(labelDiet(JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'))),null,2)); }
  catch { console.error('Provide a diet JSON file.'); process.exitCode=1; }
}
