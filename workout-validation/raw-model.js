const { inspect } = require('./validator');
const featureNames = [
  'plannedDays', 'actualDays', 'uniqueDays', 'scheduledDaysPresent', 'exerciseCount',
  'meanUniqueExercisesPerDay', 'knownExerciseFraction', 'userEquipmentLevel',
  'noEquipmentFraction', 'homeEquipmentFraction', 'gymEquipmentFraction', 'cardioFraction',
  ...['sets', 'repetitions', 'workSeconds', 'restSeconds'].flatMap(field => [`${field}Minimum`, `${field}Maximum`, `${field}Mean`])
];
function extract(input, library) {
  // inspect is used only as a malformed-input gate. Its rule flags are discarded.
  if (inspect(input, library) === null) return null;
  const items = input.days.flatMap(day => day.exercises);
  const references = items.map(item => library.find(exercise => exercise.name === item.name));
  const actualDays = input.days.map(day => day.day);
  const denominator = items.length || 1;
  const values = [input.expectedDays.length, actualDays.length, new Set(actualDays).size,
    input.expectedDays.filter(day => actualDays.includes(day)).length, items.length,
    input.days.reduce((sum, day) => sum + new Set(day.exercises.map(item => item.name)).size, 0) / (input.days.length || 1),
    references.filter(Boolean).length / denominator, ['none', 'home', 'gym'].indexOf(input.equipment),
    ...['none', 'home', 'gym'].map(equipment => references.filter(item => item?.equipment === equipment).length / denominator),
    references.filter(item => item?.movement === 'cardio').length / denominator];
  for (const field of ['sets', 'repetitions', 'workSeconds', 'restSeconds']) {
    const numbers = items.map(item => item[field]);
    values.push(numbers.length ? Math.min(...numbers) : 0, numbers.length ? Math.max(...numbers) : 0,
      numbers.reduce((sum, value) => sum + value, 0) / denominator);
  }
  return values;
}
function standardize(values, model) {
  return values.map((value, index) => (value - model.means[index]) / model.scales[index]);
}
function probability(values, model) {
  const z = standardize(values, model).reduce((sum, value, index) => sum + value * model.weights[index], model.bias);
  return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, z))));
}
function validate(input, library, model) {
  const values = extract(input, library);
  if (values === null) return { status: 'cannot_verify' };
  const modelScore = probability(values, model);
  return { status: 'classified', modelScore,
    modelPrediction: modelScore >= model.threshold ? 'inconsistent' : 'consistent' };
}
module.exports = { featureNames, extract, standardize, probability, validate };
