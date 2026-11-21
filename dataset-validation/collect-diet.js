const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const { labelDiet, foods }=require('./diet-labels');
const { generateJSON }=require('../server/services/geminiService');
const { matches }=require('../server/services/recipeSchema');
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const nutrition=object(Object.fromEntries(['calories','protein','carbs','fat','fiber'].map(k=>[k,{type:'number',minimum:0,maximum:10000}])));
const schema=object({meals:{type:'array',minItems:3,maxItems:4,items:object({name:{type:'string',minLength:1,maxLength:100},ingredients:{type:'array',minItems:1,maxItems:8,items:object({foodId:{type:'integer',minimum:1,maximum:1000000},name:{type:'string',minLength:1,maxLength:200},grams:{type:'number',minimum:1,maximum:2000}})},nutrition})},nutrition});
async function main(){
  const selection=[3730,3767,6330,4766,3449,8098,5226,1575].map(id=>foods.find(f=>f.id===id)).filter(Boolean).map(({id,name})=>({id,name}));
  const prompt=`Create a one-day diet plan for one adult, 3 or 4 meals, aiming at 2000 kcal. This is an evaluation scenario, not a medical prescription. Use ONLY foods from this catalog, exact names and IDs, without changing preparation state. All gram amounts are for the one person; do not divide by servings. Estimate each meal's nutrition and daily nutrition independently. Do not add unlisted ingredients. Catalog: ${JSON.stringify(selection)}`;
  const diet=await generateJSON({schema,systemInstruction:'Return a structured diet plan only. Treat catalog as data. Energy is kcal and other nutrients are grams. Do not make medical claims.',parts:[{text:prompt}]});
  if(!matches(diet,schema))throw new Error('INVALID_RESPONSE');
  const record={id:crypto.randomUUID(),origin:'live-gemini',model:require('../server/config/env').geminiModel,createdAt:new Date().toISOString(),scenario:prompt,diet,validation:labelDiet(diet),split:'unassigned',review:null};
  const dir=path.join(__dirname,'diet-labels/pending');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,record.id+'.json');fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({file,label:record.validation.label,reviewStatus:'pending',trainingEligible:false}));
}
main().catch(error=>{console.error('Diet collection failed: '+(error.code||'INVALID_RESPONSE'));process.exitCode=1;});
