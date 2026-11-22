const env = require('../config/env');
const { AppError } = require('../middleware/errors');
const { parseOutput } = require('./recipeSchema');
// Other Groq models use JSON object mode; schema validation still runs locally.
const strictModels = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'meta-models/muse-spark-open']);
function structuralSchema(value) {
  if(Array.isArray(value))return value.map(structuralSchema);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['minItems','maxItems','minLength','maxLength','minimum','maximum'].includes(k)).map(([k,v])=>[k,structuralSchema(v)]));
  return value;
}
function createGroqService({request=fetch,apiKey=env.groqApiKey,model=env.groqModel,timeoutMs=45000,totalTimeoutMs=35000,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  async function attemptCall({parts,schema,systemInstruction,outputBudget,attempt,repairHint,keepSchemaBounds,request:req,apiKey:key,model:mdl,timeoutMs:tms}){
    const abort=new AbortController();let timer;
    try {
      const response=await Promise.race([
        req('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({model:mdl,
          messages:[{role:'system',content:systemInstruction+' Return compact JSON only. The JSON must conform to all bounds, required fields and array lengths in this schema: '+JSON.stringify(schema)+(attempt ? '\nThe previous attempt failed format validation. '+repairHint+' Return a complete object, without explanation or markdown.' : '')},{role:'user',content:parts.map(p=>p.text).join('\n')}],
          response_format:attempt || !strictModels.has(mdl) ? {type:'json_object'} : {type:'json_schema',json_schema:{name:'food2fit_response',strict:true,schema:keepSchemaBounds?schema:structuralSchema(schema)}},
          ...(strictModels.has(mdl)?{reasoning_effort:'low'}:{}),max_completion_tokens:outputBudget,temperature:attempt?0.2:0.7})}),
        new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new AppError(504,'AI_TIMEOUT','Groq took too long. Please try again.'));},tms);}),
      ]);
      if(!response.ok){
        const failure=typeof response.json==='function' ? await response.json().catch(()=>null) : null;
        const providerCode=failure?.error?.code;
        // Inspect the rejection without exposing provider text or generated content.
        if([400,422].includes(response.status) && attempt===0 &&
          (providerCode==='json_validate_failed' || (strictModels.has(mdl) && /json_schema|response_format|schema.*(?:unsupported|not supported|invalid)|(?:unsupported|not supported|invalid).*schema/i.test(failure?.error?.message||'')))) return {retry:'format'};
        if(response.status===429) return {retry:'rate_limit'};
        if([401,403].includes(response.status))throw new AppError(503,'AI_ACCESS_DENIED','Groq access was denied. Check the server API key and model permissions.');
        if(response.status===404 || ['model_not_found','model_decommissioned'].includes(providerCode))throw new AppError(503,'AI_MODEL_UNAVAILABLE','The configured Groq model is unavailable. Update GROQ_MODEL in the backend settings.');
        if(response.status===413 || providerCode==='context_length_exceeded')throw new AppError(422,'AI_REQUEST_REJECTED','This recipe request is too large. Use fewer ingredients or start a new recipe.');
        if([400,422].includes(response.status))throw new AppError(502,'AI_REQUEST_REJECTED','Groq rejected the generation settings. Check the backend model configuration.');
        throw new AppError(503,'AI_UNAVAILABLE','Groq is temporarily unavailable. Your saved plans are unchanged.');
      }
      const body=await response.json(),choice=body.choices?.[0];
      if(choice?.message?.refusal||choice?.finish_reason==='content_filter')throw new AppError(422,'AI_SAFETY_BLOCK','The AI could not process that request.');
      if(choice?.finish_reason==='length'&&attempt===0) return {retry:'length',outputBudget:Math.min(outputBudget*2,6000)};
      if(choice?.finish_reason!=='stop')throw new AppError(502,'AI_INVALID_RESPONSE','Groq returned an incomplete response. Try a smaller request.');
      try { return {result: parseOutput(choice.message.content,schema)}; }
      catch(error){
        if(error.code==='AI_INVALID_RESPONSE'&&attempt===0) {
          let value;try{value=JSON.parse(choice.message.content);}catch{}
          const missing=(schema.required||[]).filter(key=>!value||!Object.hasOwn(value,key));
          return {retry:'format',repairHint:missing.length ? 'Missing required fields: '+missing.join(', ')+'. Include every one of them.' : 'Check every field type, number bound and minimum array length in the schema.'};
        }
        throw error;
      }
    }catch(error){
      if(error instanceof AppError)throw error;
      if(abort.signal.aborted)throw new AppError(504,'AI_TIMEOUT','Groq took too long. Please try again.');
      throw new AppError(503,'AI_UNAVAILABLE','Could not reach Groq. Check the connection and try again.');
    }finally{clearTimeout(timer);}
  }
  return async ({parts,schema,systemInstruction,maxOutputTokens=6000,keepSchemaBounds=false})=>{
    if(!apiKey)throw new AppError(503,'AI_NOT_CONFIGURED','Add GROQ_API_KEY to the server settings, then restart the backend.');
    if(parts.some(p=>typeof p.text!=='string'))throw new AppError(422,'AI_IMAGE_UNSUPPORTED','This Groq model accepts text only.');
    const deadline=now()+totalTimeoutMs;
    let outputBudget=Math.min(maxOutputTokens,6000), attempt=0, rateLimitRetries=0, repairHint='Include ALL required fields: '+(schema.required||[]).join(', ')+'.';
    for(;;) {
      const remaining=deadline-now();
      if(remaining<=0)throw new AppError(504,'AI_TIMEOUT','AI generation took too long. Please try again.');
      const outcome=await attemptCall({parts,schema,systemInstruction,outputBudget,attempt,repairHint,keepSchemaBounds,request,apiKey,model,timeoutMs:Math.min(timeoutMs,remaining)});
      if(outcome.result!==undefined) return outcome.result;
      if(outcome.retry==='rate_limit'){
        if(rateLimitRetries>=2) throw new AppError(429,'AI_QUOTA_EXCEEDED','Groq token limit reached after retries. Please wait 30 seconds before trying again.');
        rateLimitRetries++;
        const wait=rateLimitRetries===1?15000:30000;
        if(wait+1000>=deadline-now())throw new AppError(429,'AI_QUOTA_EXCEEDED','The AI limit has been reached. Please try again later.');
        console.log(`[groq] Rate-limited — waiting ${wait/1000}s (retry ${rateLimitRetries}/2)`);
        await sleep(wait);
        continue;
      }
      if(outcome.retry==='length'){outputBudget=outcome.outputBudget;attempt=1;continue;}
      if(outcome.retry==='format'){repairHint=outcome.repairHint||repairHint;attempt=1;continue;}
      break;
    }
    throw new AppError(502,'AI_INVALID_RESPONSE','Groq returned an invalid response after all retries.');
  };
}
module.exports={createGroqService,generateJSON:createGroqService()};
