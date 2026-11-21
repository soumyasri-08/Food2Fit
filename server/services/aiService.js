const env=require('../config/env');
const {AppError}=require('../middleware/errors');
const gemini=require('./geminiService'),groq=require('./groqService');
async function generateJSON(request){
  // Image detection remains an explicit Gemini feature; no silent provider fallback.
  if(request.parts.some(p=>p.inlineData))return gemini.generateJSON(request);
  if(env.aiProvider==='groq'){
    try { return await groq.generateJSON(request); }
    catch(error){
      // Fallback to Gemini when Groq hits rate limits (429) and a Gemini key exists
      if(error.code==='AI_QUOTA_EXCEEDED'&&env.geminiApiKey){
        console.log('[aiService] Groq rate-limited — falling back to Gemini');
        return gemini.generateJSON(request);
      }
      throw error;
    }
  }
  if(env.aiProvider==='gemini')return gemini.generateJSON(request);
  throw new AppError(503,'AI_NOT_CONFIGURED','AI_PROVIDER must be groq or gemini.');
}
module.exports={generateJSON,get provider(){return env.aiProvider;},get model(){return env.aiProvider==='groq'?env.groqModel:env.geminiModel;}};
