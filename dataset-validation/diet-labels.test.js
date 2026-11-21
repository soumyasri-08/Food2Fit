const {test}=require('node:test'),assert=require('node:assert/strict');
const {labelDiet,foods}=require('./diet-labels');
const f=foods.find(f=>f.id===3730);
const nutrition=Object.fromEntries(['calories','protein','carbs','fat','fiber'].map(k=>[k,f[k]*2]));
const diet={meals:[{ingredients:[{foodId:f.id,name:f.name,grams:200}],nutrition}],nutrition};
test('200g quantities are calculated independently, not copied from Gemini',()=>{
 const result=labelDiet(diet);assert.equal(result.label,'numerically_consistent');assert.equal(result.evidence[0].matched[0].contribution.calories,104);assert.equal(result.trainingEligible,false);
});
test('wrong meal values are detected even if daily totals are correct',()=>{
 const copy=structuredClone(diet);copy.meals[0].nutrition.calories=500;assert.equal(labelDiet(copy).label,'numerically_inconsistent');
});
test('wrong daily totals are detected',()=>{const copy=structuredClone(diet);copy.nutrition.protein=100;assert.equal(labelDiet(copy).label,'numerically_inconsistent');});
test('unknown ID, changed preparation name, missing units and partial matching abstain',()=>{
 for(const patch of [{foodId:-1},{name:'Cooked apple'},{grams:null}]){const copy=structuredClone(diet);Object.assign(copy.meals[0].ingredients[0],patch);assert.equal(labelDiet(copy).label,'cannot_verify');}
});
