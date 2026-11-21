const {test}=require('node:test'),assert=require('node:assert/strict');
const gemini=require('../services/aiService');
const {generateDiet}=require('../services/dietAI');
const fixture=require('./dietFixture');
const foods=require('../seed/proteinNap').prepareProteinNap().foods.map((f,i)=>({...f,_id:String(i+1)}));
const profile={age:30,gender:'male',height:175,weight:75,activityLevel:'moderate',goal:'maintenance',dietPreference:'vegan',allergies:['peanut'],workoutDays:3,equipment:'none'};
const env=require('../config/env'), savedProvider=env.aiProvider;
test.beforeEach(()=>{env.aiProvider='gemini';});
test.afterEach(()=>{env.aiProvider=savedProvider;});
test('compact Groq menu uses a small output budget and checks daily nutrition',async()=>{
 const original=gemini.generateJSON;env.aiProvider='groq';
 try{
 gemini.generateJSON=async request=>{assert.equal(request.maxOutputTokens,1200);return fixture(request);};
 const result=await generateDiet(profile,foods);
 assert.equal(result.days.length,7);assert.equal(result.validation.checkedComparisons,7);
 assert.equal(result.days[0].meals[0].reportedTotals,undefined);
 assert.equal(result.days[0].reportedTotals.calories,0);
 assert.equal(result.validation.modelVersion,'nutrition-logistic-v1');
 assert.equal(result.days[0].meals[0].modelAssessment,undefined);
 assert.equal(result.days[0].modelAssessment.version,'nutrition-logistic-v1');
 assert.equal(result.validation.modelInconsistentComparisons,result.days.filter(day=>day.modelAssessment.modelPrediction==='inconsistent').length);
 gemini.generateJSON=async request=>({...fixture(request),order:[1,1,1,1,1,1,1]});
 await assert.rejects(generateDiet(profile,foods),{code:'AI_INVALID_RESPONSE'});
 }finally{gemini.generateJSON=original;}
});
test('Gemini diet uses filtered foods and independent nutrition; no body measurements sent',async()=>{
 const original=gemini.generateJSON;
 try{gemini.generateJSON=async request=>{const input=JSON.parse(request.parts[0].text);assert(!('weight' in input));assert(!input.catalog.some(f=>foods.find(x=>String(x._id)===f.id).allergens.includes('peanut')));return fixture(request);};
 const result=await generateDiet(profile,foods);assert.equal(result.days.length,7);assert.equal(result.generationMethod,require('../services/aiService').provider);assert.equal(result.validation.status,'reference_corrected');
 const meal=result.days[0].meals[0], source=foods.find(f=>f._id===meal.foods[0].food);
 assert.equal(meal.totals.calories,Math.round(source.calories*meal.foods[0].grams/100*10)/10);assert.equal(meal.reportedTotals.calories,0);
 assert.equal(meal.modelAssessment.version,'nutrition-logistic-v1');
 const assessments=result.days.flatMap(day=>[day.modelAssessment,...day.meals.map(meal=>meal.modelAssessment)]);
 assert.equal(assessments.length,35);
 assert.equal(result.validation.modelInconsistentComparisons,assessments.filter(item=>item.modelPrediction==='inconsistent').length);
 await assert.rejects(generateDiet(profile,foods,result),{code:'AI_REPEATED_PLAN'});
 }finally{gemini.generateJSON=original;}
});
test('unknown foods, wrong slots, oversized portions and wrong day ordering are rejected',async()=>{
 const original=gemini.generateJSON;
 try{for(const mutate of [r=>r.days[0].meals[0].foods[0].foodId='unknown',r=>r.days[0].meals[0].type='dinner',r=>r.days[0].meals[0].foods[0].grams=2000,r=>r.days[0].day=2]){
 gemini.generateJSON=async request=>{const r=fixture(request);mutate(r);return r;};await assert.rejects(generateDiet(profile,foods),{code:'AI_INVALID_RESPONSE'});
 }}finally{gemini.generateJSON=original;}
});
