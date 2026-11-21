// One live generation, using the existing server SDK, retries and private settings.
const fs = require('node:fs');
const path = require('node:path');
const { recipeSchema, matches } = require('../server/services/recipeSchema');
const { validate } = require('./validator');
const foods = require('./data/reference-foods.json');
const model = require('./model/validator.json');
function buildRequest() {
  const names = [6330, 4761].map(id => {
    const food = foods.find(f => f.id === id);
    if (!food) throw new Error('Demonstration food missing from reference dataset.');
    return food.name;
  });
  return { schema: recipeSchema,
    systemInstruction: 'Create food recipes only. Return JSON matching the schema. Nutrition is estimated per serving in kcal and grams. No medical claims or HTML.',
    parts: [{ text: `Create a simple chickpea and spinach salad for 2 servings using only these ingredients: ${JSON.stringify(names)}. Copy their names exactly, preserving preparation states. Give total recipe quantities as explicit grams, not portions or cups. Do not add other ingredients. Do not change preparation states. Estimate calories, protein, carbs, fat and fiber per serving yourself. The reference nutrition values are deliberately withheld.` }] };
}
async function run(generate) {
  const recipe = await generate(buildRequest());
  if (!matches(recipe, recipeSchema)) throw new Error('Gemini returned an invalid recipe structure.');
  return { origin: 'live-gemini', generatedAt: new Date().toISOString(), recipe,
    validation: validate(recipe, foods, model),
    evaluationNote: 'One constrained live demonstration, not an accuracy evaluation. No expert ground-truth label is assigned. This response is not added to training.' };
}
module.exports = { buildRequest, run };
if (require.main === module) {
  const { generateJSON } = require('../server/services/geminiService');
  run(generateJSON).then(result => {
    const directory = path.join(__dirname, 'reports/live');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `gemini-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ title: result.recipe.title, validation: result.validation, report: file, note: result.evaluationNote }, null, 2));
  }).catch(error => {
    // Do not log raw provider errors, request headers, or keys.
    console.error(`Gemini demonstration failed (${error.code || 'INVALID_RESPONSE'}). Check server/.env settings, connectivity and provider quota. No success report was saved.`);
    process.exitCode = 1;
  });
}
