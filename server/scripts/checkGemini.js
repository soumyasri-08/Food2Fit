// Explicit live smoke check; uses two Gemini requests, no database or personal data.
const { generateJSON } = require('../services/geminiService');
const { recipeSchema } = require('../services/recipeSchema');
const { generateWorkout } = require('../services/workoutAI');
async function main() {
  const recipe = await generateJSON({ schema: recipeSchema,
    systemInstruction: 'Return a simple food recipe as JSON. Nutrition is estimated per serving. No HTML.',
    parts: [{ text: 'Create a vegan chickpea and tomato salad for one serving. At most 5 ingredients and 4 instructions.' }],
  });
  console.log(`Recipe generation passed: ${recipe.title}`);
  const profile = { age: 30, gender: 'male', height: 175, weight: 75, activityLevel: 'moderate', goal: 'maintenance', dietPreference: 'veg', allergies: [], workoutDays: 3, equipment: 'none' };
  const exercises = require('../seed/data/exercises.json').map((e, i) => ({ ...e, _id: String(i + 1) }));
  const workout = await generateWorkout(profile, exercises);
  console.log(`Workout generation passed: ${workout.days.length} days, validated against exercise library.`);
}
main().catch(error => { console.error(`Gemini check failed: ${error.code || 'CONNECTION_ERROR'}. ${error.status ? `Status ${error.status}.` : ''}`); process.exitCode = 1; });
