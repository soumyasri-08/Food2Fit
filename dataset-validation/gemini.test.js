const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRequest, run } = require('./gemini');
const fixture = require('../server/tests/recipeFixture');
test('live request withholds reference nutrient values', () => {
  const text = buildRequest().parts[0].text;
  assert(text.includes('2 servings'));
  assert(!text.includes('expectedPerServing'));
});
test('provider output is validated and unknown names abstain', async () => {
  const result = await run(async () => fixture);
  assert.equal(result.validation.status, 'insufficient_information');
  assert.deepEqual(result.recipe, fixture);
});
test('malformed responses and provider failures are not accepted', async () => {
  await assert.rejects(run(async () => ({})), /invalid recipe structure/);
  await assert.rejects(run(async () => { throw new Error('quota'); }), /quota/);
});
