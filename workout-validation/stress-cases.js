// Expected labels are fixed by each test specification before prediction.
function generateCases(library) {
  const cases = [];
  const seen = new Set();
  const equipmentRank = { none: 0, home: 1, gym: 2 };
  function add(input, category, expected, evidence) {
    const signature = JSON.stringify(input);
    if (seen.has(signature)) return;
    seen.add(signature);
    cases.push({ id: `workout-stress-${cases.length + 1}`, category, input, expected, evidence });
  }
  for (const exercise of library) {
    for (const equipment of ['none', 'home', 'gym']) {
      for (const expectedDays of [[1], [1, 3, 5]]) {
        const cardio = exercise.movement === 'cardio';
        const equipmentMismatch = equipmentRank[exercise.equipment] > equipmentRank[equipment];
        const base = { equipment, expectedDays, days: expectedDays.map(day => ({ day, exercises: [{
          name: exercise.name, sets: 3, repetitions: cardio ? 0 : 10,
          workSeconds: cardio ? 60 : 0, restSeconds: 60
        }] })) };
        add(base, 'equipment-and-schedule', Number(equipmentMismatch), equipmentMismatch ? 'Required equipment is unavailable' : 'All fields satisfy project policy');
        const boundaries = [
          ['sets', 0, false], ['sets', 1, true], ['sets', 4, true], ['sets', 5, false], ['sets', 2.5, false],
          ['restSeconds', 29.99, false], ['restSeconds', 30, true], ['restSeconds', 120, true], ['restSeconds', 120.01, false],
          ...(cardio ? [
            ['repetitions', 1, false], ['workSeconds', 29.99, false], ['workSeconds', 30, true],
            ['workSeconds', 180, true], ['workSeconds', 180.01, false]
          ] : [
            ['repetitions', 5, false], ['repetitions', 6, true], ['repetitions', 15, true],
            ['repetitions', 16, false], ['repetitions', 10.5, false], ['workSeconds', 30, false]
          ])
        ];
        for (const [field, value, allowed] of boundaries) {
          const input = structuredClone(base);
          input.days[0].exercises[0][field] = value;
          add(input, 'numeric-boundary', Number(equipmentMismatch || !allowed), `${field}=${value}: ${allowed ? 'within' : 'outside'} project policy; equipment match=${!equipmentMismatch}`);
        }
        const variations = [
          ['missing-day', input => input.days.pop(), 1],
          ['extra-day', input => input.days.push({ ...structuredClone(input.days[0]), day: 7 }), 1],
          ['duplicate-day', input => input.days.push(structuredClone(input.days[0])), 1],
          ['duplicate-exercise', input => input.days[0].exercises.push(structuredClone(input.days[0].exercises[0])), 1],
          ['unknown-exercise', input => { input.days[0].exercises[0].name = 'Unlisted test movement'; }, 1],
          ['combined-violations', input => {
            const item = input.days[0].exercises[0];
            item.sets = 6;
            item.restSeconds = 10;
            item.repetitions = 40;
            input.days[0].exercises.push(structuredClone(item));
          }, 1],
          ['reordered-days', input => input.days.reverse(), Number(equipmentMismatch)],
          ['missing-number', input => { delete input.days[0].exercises[0].sets; }, null],
          ['string-number', input => { input.days[0].exercises[0].sets = '3'; }, null],
          ['empty-exercises', input => { input.days[0].exercises = []; }, null]
        ];
        for (const [category, mutate, label] of variations) {
          const input = structuredClone(base);
          mutate(input);
          add(input, category, label, category === 'reordered-days' ? 'Policy compares day membership; equipment restrictions still apply' : category);
        }
      }
    }
  }
  return cases;
}
function evaluateCases(library, model, validator) {
  return generateCases(library).map(row => {
    const result = validator.validate(row.input, library, model);
    return { ...row, predicted: result.status === 'cannot_verify' ? null : Number(result.modelPrediction === 'inconsistent'),
      ruleStatus: result.status, modelScore: result.modelScore };
  });
}
module.exports = { generateCases, evaluateCases };
