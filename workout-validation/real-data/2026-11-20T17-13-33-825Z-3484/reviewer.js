// Independent implementation of the documented seven consistency checks.
// This module never reads trained weights, model scores or validator feature flags.
function review(input, catalog) {
  const numericFields = ['sets', 'repetitions', 'workSeconds', 'restSeconds'];
  const validDays = Array.isArray(input?.expectedDays) && input.expectedDays.length > 0 &&
    input.expectedDays.every(day => Number.isInteger(day) && day >= 1 && day <= 7) &&
    new Set(input.expectedDays).size === input.expectedDays.length;
  const validStructure = validDays && ['none', 'home', 'gym'].includes(input.equipment) &&
    Array.isArray(input.days) && input.days.every(day => day && Number.isInteger(day.day) &&
      Array.isArray(day.exercises) && day.exercises.length > 0 && day.exercises.every(exercise =>
        exercise && typeof exercise.name === 'string' && numericFields.every(field => Number.isFinite(exercise[field]))));
  if (!validStructure) return { label: null, reasons: ['Missing or malformed required fields'] };
  const reasons = [];
  const expectedSchedule = [...input.expectedDays].sort((a, b) => a - b);
  const actualSchedule = input.days.map(day => day.day).sort((a, b) => a - b);
  if (JSON.stringify(expectedSchedule) !== JSON.stringify(actualSchedule)) reasons.push('Schedule differs');
  const equipmentLevels = { none: 0, home: 1, gym: 2 };
  for (const day of input.days) {
    const names = day.exercises.map(exercise => exercise.name);
    if (new Set(names).size !== names.length) reasons.push(`Day ${day.day}: repeated exercise`);
    for (const exercise of day.exercises) {
      const reference = catalog.find(item => item.name === exercise.name);
      if (!reference) reasons.push(`Day ${day.day}: unknown exercise ${exercise.name}`);
      if (reference && equipmentLevels[reference.equipment] > equipmentLevels[input.equipment]) reasons.push(`Day ${day.day}: unavailable equipment`);
      if (!Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 4) reasons.push(`Day ${day.day}: sets outside policy`);
      if (exercise.restSeconds < 30 || exercise.restSeconds > 120) reasons.push(`Day ${day.day}: rest outside policy`);
      if (reference?.movement === 'cardio') {
        if (exercise.repetitions !== 0 || exercise.workSeconds < 30 || exercise.workSeconds > 180) reasons.push(`Day ${day.day}: cardio dose outside policy`);
      } else if (reference) {
        if (exercise.workSeconds !== 0 || !Number.isInteger(exercise.repetitions) || exercise.repetitions < 6 || exercise.repetitions > 15) reasons.push(`Day ${day.day}: strength dose outside policy`);
      }
    }
  }
  return { label: Number(reasons.length > 0), reasons };
}

function metrics(rows) {
  const confusion = { tp: 0, tn: 0, fp: 0, fn: 0 };
  let classified = 0;
  for (const row of rows) {
    if (row.expected === null || row.predicted === null) continue;
    classified++;
    if (row.expected === 1) confusion[row.predicted === 1 ? 'tp' : 'fn']++;
    else confusion[row.predicted === 1 ? 'fp' : 'tn']++;
  }
  const { tp, tn, fp, fn } = confusion;
  const ratio = (a, b) => b === 0 ? null : a / b;
  return { total: rows.length, classified, abstentions: rows.filter(row => row.predicted === null).length,
    accuracy: ratio(tp + tn, classified), precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn),
    f1: ratio(2 * tp, 2 * tp + fp + fn), specificity: ratio(tn, tn + fp),
    coverage: ratio(rows.filter(row => row.predicted !== null).length, rows.length), confusion };
}
module.exports = { review, metrics };
