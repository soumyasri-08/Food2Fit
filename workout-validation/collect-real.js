// Collect actual app-style proposals without saving to the application database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ai = require('../server/services/aiService');
const { generateWorkout } = require('../server/services/workoutAI');
const { review, metrics } = require('./real-review');
const validator = require('./validator');
const model = require('./model/workout-model.json');
const catalog = require('../server/seed/data/exercises.json').map((exercise, index) => ({ ...exercise, _id: String(index + 1) }));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const runDirectory = path.join(__dirname, 'real-data', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
  fs.mkdirSync(runDirectory, { recursive: true });
  const save = (name, data) => fs.writeFileSync(path.join(runDirectory, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  const scenarios = [
    { id: 'none-maintenance', equipment: 'none', goal: 'maintenance' },
    { id: 'home-muscle-gain', equipment: 'home', goal: 'muscle-gain' },
    { id: 'gym-fat-loss', equipment: 'gym', goal: 'fat-loss' }
  ];
  save('protocol.json', { scope: 'Three real provider requests using the application workout prompt. One-day fictional profiles.',
    provider: ai.provider, model: ai.model, scenarios, labels: 'Automated independent code implementation of project rules; human review pending.',
    labelMapping: { 0: 'passes seven checked rules', 1: 'violates checked rules' },
    validatorModelSha256: hash(JSON.stringify(model)), reviewerSha256: hash(fs.readFileSync(path.join(__dirname, 'real-review.js'))),
    constraints: 'No retraining or threshold selection. Keep all returned proposals including application rejection. Provider/schema failures recorded separately.' });
  save('validator-model.json', model);
  save('catalog.json', catalog);
  fs.copyFileSync(path.join(__dirname, 'real-review.js'), path.join(runDirectory, 'reviewer.js'));
  const originalGenerate = ai.generateJSON;
  const records = [];
  for (const scenario of scenarios) {
    let request, response, applicationStatus = 'accepted', failureCode;
    ai.generateJSON = async value => {
      request = structuredClone(value);
      response = await originalGenerate({ ...value, maxOutputTokens: 1200 });
      return response;
    };
    try {
      await generateWorkout({ age: 30, gender: 'male', height: 175, weight: 75,
        activityLevel: 'moderate', dietPreference: 'veg', allergies: [], workoutDays: 1, ...scenario }, catalog);
    } catch (error) {
      applicationStatus = 'rejected';
      failureCode = error.code || 'REQUEST_FAILED';
    } finally {
      ai.generateJSON = originalGenerate;
    }
    const record = { id: scenario.id, origin: 'live-ai', provider: ai.provider, model: ai.model,
      collectedAt: new Date().toISOString(), scenario, request, response, applicationStatus, failureCode };
    if (response) {
      const prompt = JSON.parse(request.parts[0].text);
      const input = { equipment: scenario.equipment, expectedDays: prompt.schedule.map(day => day.day),
        days: response.days.map(day => ({ day: day.day, exercises: day.exercises.map(item => ({ ...item,
          name: catalog.find(exercise => exercise._id === item.exerciseId)?.name || `Unknown ID ${item.exerciseId}` })) })) };
      // Freeze label before running the trained classifier.
      const reference = review(input, catalog);
      save(`${scenario.id}-review.json`, { id: scenario.id, input, automatedReference: reference, humanReview: null });
      const prediction = validator.validate(input, catalog, model);
      Object.assign(record, { input, reference, prediction });
    }
    save(`${scenario.id}-response.json`, record);
    records.push(record);
    console.log(JSON.stringify({ scenario: scenario.id, responseReceived: Boolean(response), applicationStatus, failureCode }));
    if (['AI_QUOTA_EXCEEDED', 'AI_ACCESS_DENIED', 'AI_NOT_CONFIGURED', 'AI_UNAVAILABLE'].includes(failureCode)) break;
    if (scenario !== scenarios[scenarios.length - 1]) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const received = records.filter(record => record.response);
  const rows = received.map(record => ({ expected: record.reference.label,
    predicted: record.prediction.status === 'cannot_verify' ? null : Number(record.prediction.modelPrediction === 'inconsistent') }));
  save('human-review.json', received.map(record => ({ id: record.id, scenario: record.scenario,
    input: record.input, label: null, reviewer: null, evidence: null })));
  const report = { datasetOrigin: 'actual-provider-responses', labelSource: 'independent automated rule implementation',
    attempted: records.length, responsesReceived: received.length, generationFailures: records.length - received.length,
    planned: scenarios.length, metrics: metrics(rows), humanReviewedCases: 0,
    limitations: ['Small constrained pilot; representative real-world performance cannot be estimated.',
      'Reviewer code is independent of model predictions but uses the same project policy and exercise catalog.',
      'Independent human/expert labels are pending.',
      'Provider or schema failures are counted separately and excluded from classifier metrics.',
      'Undefined precision/recall are null when the required class or predictions are absent.'] };
  save('report.json', report);
  console.log(JSON.stringify({ directory: runDirectory, ...report }, null, 2));
}
main().catch(error => { console.error('Collection failed: ' + (error.code || 'LOCAL_ERROR')); process.exitCode = 1; });
