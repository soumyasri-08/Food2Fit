const featureNames = ['unknownExercise', 'equipmentMismatch', 'scheduleMismatch', 'duplicateExercise', 'setsOutOfRange', 'repsOrDurationOutOfRange', 'restOutOfRange'];
function inspect(input, library) {
  if (!input || !['none','home','gym'].includes(input.equipment) || !Array.isArray(input.expectedDays) || !input.expectedDays.length || new Set(input.expectedDays).size !== input.expectedDays.length || input.expectedDays.some(d => !Number.isInteger(d) || d < 1 || d > 7) || !Array.isArray(input.days) || input.days.some(d => !d || !Number.isInteger(d.day) || !Array.isArray(d.exercises) || !d.exercises.length || d.exercises.some(e => !e || typeof e.name !== 'string' || !['sets','repetitions','workSeconds','restSeconds'].every(k => Number.isFinite(e[k]))))) return null;
  const flags = Array(7).fill(0);
  const allowed = input.equipment === 'gym' ? ['none','home','gym'] : input.equipment === 'home' ? ['none','home'] : ['none'];
  const actual = input.days.map(d => d.day);
  flags[2] = Number(actual.length !== input.expectedDays.length || new Set(actual).size !== actual.length || input.expectedDays.some(d => !actual.includes(d)));
  for (const day of input.days) {
    const seen = new Set();
    for (const item of day.exercises) {
      const exercise = library.find(e => e.name === item.name);
      if (!exercise) flags[0] = 1;
      else {
        if (!allowed.includes(exercise.equipment)) flags[1] = 1;
        const cardio = exercise.movement === 'cardio';
        if (cardio ? item.repetitions !== 0 || item.workSeconds < 30 || item.workSeconds > 180 : item.workSeconds !== 0 || !Number.isInteger(item.repetitions) || item.repetitions < 6 || item.repetitions > 15) flags[5] = 1;
      }
      if (seen.has(item.name)) flags[3] = 1;
      seen.add(item.name);
      if (!Number.isInteger(item.sets) || item.sets < 1 || item.sets > 4) flags[4] = 1;
      if (item.restSeconds < 30 || item.restSeconds > 120) flags[6] = 1;
    }
  }
  return flags;
}
function score(model, features) {
  const z = model.bias + features.reduce((sum, x, i) => sum + x * model.weights[i], 0);
  return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, z))));
}
function validate(input, library, model) {
  const features = inspect(input, library);
  if (!features) return { status: 'cannot_verify', reasons: ['Missing or malformed structured workout fields.'] };
  const modelScore = score(model, features);
  const reasons = featureNames.filter((_, i) => features[i]);
  return { status: reasons.length ? 'rejected' : 'passes_checked_rules', reasons, modelPrediction: modelScore >= model.threshold ? 'inconsistent' : 'consistent', modelScore,
    notice: 'Rules are authoritative. Synthetic-trained model score is not safety confidence. This does not assess medical suitability, technique, progression or effectiveness.' };
}
module.exports = { inspect, score, validate, featureNames };
if (require.main === module) {
  try { console.log(JSON.stringify(validate(JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8')), require('./data/exercises.json'), require('./model/workout-model.json')), null, 2)); }
  catch { console.error('Provide a valid workout JSON file after validator.js.'); process.exitCode = 1; }
}
