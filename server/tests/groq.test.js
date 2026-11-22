const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGroqService}=require('../services/groqService');
const {recipeSchema}=require('../services/recipeSchema');
const recipe=require('./recipeFixture');
const params={parts:[{text:'Create a recipe'}],schema:recipeSchema,systemInstruction:'Food only'};
const success=value=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]})});
test('quota waits cannot exceed the overall generation budget',async()=>{
 let clock=0,calls=0;const waits=[];
 const service=createGroqService({apiKey:'test',now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;},request:async()=>{calls++;return {ok:false,status:429};}});
 await assert.rejects(service(params),{code:'AI_QUOTA_EXCEEDED'});
 assert.equal(calls,2);assert.deepEqual(waits,[15000]);
});
test('a format retry shares the original request deadline',async()=>{
 let clock=0,calls=0;
 const service=createGroqService({apiKey:'test',now:()=>clock,totalTimeoutMs:100,request:async()=>{calls++;clock=101;return success({});}});
 await assert.rejects(service(params),{code:'AI_TIMEOUT'});assert.equal(calls,1);
});
test('Groq sends strict structured JSON and validates the response locally',async()=>{
 let body;const service=createGroqService({apiKey:'test',request:async(url,req)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');body=JSON.parse(req.body);return success(recipe);}});
 assert.deepEqual(await service(params),recipe);assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.model,'openai/gpt-oss-20b');
 assert.equal(body.response_format.json_schema.schema.properties.servings.maximum,undefined);
 const invalid=createGroqService({apiKey:'test',request:async()=>success({...recipe,servings:99})});
 await assert.rejects(invalid(params),{code:'AI_INVALID_RESPONSE'});
});

test('recipe requests retain array bounds and repairs name missing required fields',async()=>{
 const requests=[];
 const service=createGroqService({apiKey:'test',request:async(_,req)=>{
  requests.push(JSON.parse(req.body));
  return success(requests.length===1?{title:recipe.title,description:recipe.description,ingredients:recipe.ingredients,instructions:recipe.instructions}:recipe);
 }});
 assert.deepEqual(await service({...params,keepSchemaBounds:true}),recipe);
 assert.equal(requests[0].response_format.json_schema.schema.properties.instructions.minItems,4);
 assert.match(requests[1].messages[0].content,/Missing required fields: prepTime, cookTime, servings, nutrition/);
});
test('quota retries are bounded and auth failures are never retried',async()=>{
 for(const [status,code]of [[429,'AI_QUOTA_EXCEEDED'],[401,'AI_ACCESS_DENIED'],[400,'AI_REQUEST_REJECTED'],[503,'AI_UNAVAILABLE']]){
  let calls=0;const delays=[];const service=createGroqService({apiKey:'test',sleep:async ms=>delays.push(ms),request:async()=>{calls++;return {ok:false,status};}});
  await assert.rejects(service(params),{code});assert.equal(calls,status===429?3:1);assert.deepEqual(delays,status===429?[15000,30000]:[]);
 }
});
test('provider schema generation failure retries once in JSON mode and still validates locally',async()=>{
 for(const value of [recipe,{...recipe,servings:99}]) {
  const requests=[];
  const service=createGroqService({apiKey:'test',request:async(_,req)=>{
   requests.push(JSON.parse(req.body));
   return requests.length===1 ? {ok:false,status:400,json:async()=>({error:{code:'json_validate_failed'}})} : success(value);
  }});
  if(value.servings===99)await assert.rejects(service(params),{code:'AI_INVALID_RESPONSE'});
  else assert.deepEqual(await service(params),recipe);
  assert.equal(requests.length,2);
  assert.equal(requests[1].response_format.type,'json_object');
  assert(requests[1].messages[0].content.includes(JSON.stringify(recipeSchema)));
 }
});
test('missing key, images, refusal and truncated replies cannot pass',async()=>{
 await assert.rejects(createGroqService({apiKey:''})(params),{code:'AI_NOT_CONFIGURED'});
 await assert.rejects(createGroqService({apiKey:'test'})({...params,parts:[{inlineData:{}}]}),{code:'AI_IMAGE_UNSUPPORTED'});
 for(const [choice,code]of [[{finish_reason:'length',message:{content:'{}'}},'AI_INVALID_RESPONSE'],[{finish_reason:'stop',message:{refusal:'Cannot comply'}},'AI_SAFETY_BLOCK']])await assert.rejects(createGroqService({apiKey:'test',request:async()=>({ok:true,json:async()=>({choices:[choice]})})})(params),{code});
});
test('hanging requests are aborted',async()=>{
 let signal;await assert.rejects(createGroqService({apiKey:'test',timeoutMs:10,request:async(_,req)=>{signal=req.signal;return new Promise(()=>{});}})(params),{code:'AI_TIMEOUT'});assert(signal.aborted);
});

test('malformed or incomplete structured output gets one validated repair attempt',async()=>{
 for(const choice of [
  {finish_reason:'stop',message:{content:'{"title":'}},
  {finish_reason:'stop',message:{content:JSON.stringify({...recipe,servings:99})}},
  {finish_reason:'length',message:{content:'{}'}}
 ]){
  const requests=[];
  const service=createGroqService({apiKey:'test',request:async(_,req)=>{
   requests.push(JSON.parse(req.body));
   return requests.length===1?{ok:true,json:async()=>({choices:[choice]})}:success(recipe);
  }});
  assert.deepEqual(await service({...params,maxOutputTokens:1200}),recipe);
  assert.equal(requests.length,2);
  assert.equal(requests[1].response_format.type,'json_object');
  assert.equal(requests[1].max_completion_tokens,choice.finish_reason==='length'?2400:1200);
 }
 let attempts=0;
 const failing=createGroqService({apiKey:'test',request:async()=>{attempts++;return success({});}});
 await assert.rejects(failing(params),{code:'AI_INVALID_RESPONSE'});
 assert.equal(attempts,2);
});

test('text uses Groq, explicit photos use Gemini, and failures do not switch providers',async()=>{
 const env=require('../config/env'),ai=require('../services/aiService'),groq=require('../services/groqService'),gemini=require('../services/geminiService');
 const old={provider:env.aiProvider,groq:groq.generateJSON,gemini:gemini.generateJSON};let photos=0;
 try{
  env.aiProvider='groq';groq.generateJSON=async()=>recipe;gemini.generateJSON=async()=>{photos++;return {ingredients:['apple']};};
  assert.deepEqual(await ai.generateJSON(params),recipe);assert.equal(photos,0);
  assert.deepEqual(await ai.generateJSON({...params,parts:[{inlineData:{}}]}),{ingredients:['apple']});
  groq.generateJSON=async()=>{throw new Error('quota');};await assert.rejects(ai.generateJSON(params),/quota/);assert.equal(photos,1);
 }finally{env.aiProvider=old.provider;groq.generateJSON=old.groq;gemini.generateJSON=old.gemini;}
});
