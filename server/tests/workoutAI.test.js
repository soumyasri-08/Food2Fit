const { test } = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../services/aiService');
const { generateWorkout } = require('../services/workoutAI');
const exercises = require('../seed/data/exercises.json').map((e, i) => ({ ...e, _id: String(i + 1) }));
const profile = { age: 30, gender: 'male', height: 175, weight: 75, activityLevel: 'moderate', goal: 'maintenance', dietPreference: 'veg', allergies: [], workoutDays: 3, equipment: 'none' };
function fixture(request) {
  const { schedule } = JSON.parse(request.parts[0].text);
  return { days: schedule.map(day => {
    const used = new Set();
    return { day: day.day, title: day.title, exercises: day.slots.map(slot => {
      const selected = slot.candidates.find(e => !used.has(e.id)); used.add(selected.id);
      return { exerciseId: selected.id, sets: day.recovery ? 2 : 3, repetitions: slot.movement === 'cardio' ? 0 : 10, workSeconds: slot.movement === 'cardio' ? 30 : 0, restSeconds: 60 };
    }) };
  }), notes: ['Use controlled movement.'] };
}
test('Gemini workouts respect schedule, equipment and library names without personal data', async () => {
  const original = gemini.generateJSON;
  try {
    gemini.generateJSON = async request => {
      const input = JSON.parse(request.parts[0].text);
      assert.deepEqual(Object.keys(input), ['goal', 'equipment', 'schedule']);
      return fixture(request);
    };
    for (const workoutDays of [1, 3, 4, 6, 7]) {
      const result = await generateWorkout({ ...profile, workoutDays }, exercises);
      assert.equal(result.days.length, workoutDays);
      assert.equal(result.generationMethod, require('../services/aiService').provider);
      assert.equal(result.validation.status, 'passes_checked_rules');
      assert.equal(result.validation.version, 'workout-raw-v1');
      assert(['consistent', 'inconsistent'].includes(result.validation.modelPrediction));
      assert(Number.isFinite(result.validation.modelScore));
      const input = { equipment: profile.equipment, expectedDays: result.days.map(day => day.day),
        days: result.days.map(day => ({ day: day.day, exercises: day.exercises.map(item => ({
          name: item.name, sets: item.sets, restSeconds: item.restSeconds,
          repetitions: item.reps.includes('seconds') ? 0 : parseInt(item.reps),
          workSeconds: item.reps.includes('seconds') ? parseInt(item.reps) : 0
        })) })) };
      const expected = require('../../workout-validation/raw-model').validate(input, exercises,
        require('../services/workoutValidation/raw-model.json'));
      assert.equal(result.validation.modelScore, expected.modelScore);
      assert.equal(result.validation.modelPrediction, expected.modelPrediction);
      for (const day of result.days) for (const item of day.exercises) assert.equal(exercises.find(e => e._id === item.exercise).equipment, 'none');
    }
  } finally { gemini.generateJSON = original; }
});
test('unknown exercise IDs, changed schedule, unsafe volume and duplicate exercises are rejected', async () => {
  const original = gemini.generateJSON;
  try {
    for (const mutate of [r => { r.days[0].exercises[0].exerciseId = 'invented'; }, r => { r.days[0].day = 7; }, r => { r.days[0].exercises[0].sets = 100; }, r => { r.days[0].exercises[1] = r.days[0].exercises[0]; }]) {
      gemini.generateJSON = async request => { const result = fixture(request); mutate(result); return result; };
      await assert.rejects(generateWorkout(profile, exercises), { code: 'AI_INVALID_RESPONSE' });
    }
  } finally { gemini.generateJSON = original; }
});
module.exports = { fixture };

test('regeneration offers alternatives to prior exercises when available', async () => {
  const original = gemini.generateJSON;
  try {
    gemini.generateJSON = async request => fixture(request);
    const first = await generateWorkout(profile, exercises);
    const second = await generateWorkout(profile, exercises, first);
    let changed = 0;
    second.days.forEach((day, d) => day.exercises.forEach((item, i) => {
      const old = first.days[d].exercises[i];
      const movement = exercises.find(e => e._id === old.exercise).movement;
      const alternatives = exercises.filter(e => e.equipment === 'none' && e.movement === movement && e.difficulty !== 'advanced' && e.goalTags.includes(profile.goal));
      if (alternatives.length > 1) { assert.notEqual(item.exercise, old.exercise); changed++; }
    }));
    assert(changed > 0);
  } finally { gemini.generateJSON = original; }
});
