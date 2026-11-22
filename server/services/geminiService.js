const { GoogleGenAI, ThinkingLevel } = require('@google/genai');
const { setTimeout: delay } = require('node:timers/promises');
const env = require('../config/env');
const { AppError } = require('../middleware/errors');
const { parseOutput } = require('./recipeSchema');

function quotaError(error) {
  return Number(error.status || error.code) === 429 || error.status === 'RESOURCE_EXHAUSTED'
    || /RESOURCE_EXHAUSTED/.test(String(error.message || ''));
}
// Nested, bounded arrays can make Gemini's constrained decoder reject a schema.
// Use a structural provider schema when requested; parseOutput still enforces
// every original bound and the caller performs semantic checks afterwards.
function structuralSchema(value) {
  if (Array.isArray(value)) return value.map(structuralSchema);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['minItems','maxItems','minLength','maxLength','minimum','maximum'].includes(key))
    .map(([key, child]) => [key, structuralSchema(child)]));
  return value;
}
// Dependencies are injectable for deterministic tests; no test-only HTTP endpoint.
function createGeminiService({ generate, sleep = delay, timeoutMs = 45000, totalTimeoutMs = 35000, now = Date.now } = {}) {
  return async function generateJSON({ parts, schema, systemInstruction, simplifyProviderSchema = false, maxOutputTokens = 6000 }) {
    if (!generate && (!env.geminiApiKey || !env.geminiModel)) {
      throw new AppError(503, 'AI_NOT_CONFIGURED', 'Gemini AI is not configured yet. Your saved content is still available.');
    }
    const call = generate || (params => new GoogleGenAI({ apiKey: env.geminiApiKey }).models.generateContent(params));
    const deadline = now() + totalTimeoutMs;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = Math.min(timeoutMs, deadline - now());
      if (remaining <= 0) throw new AppError(504, 'AI_TIMEOUT', 'Gemini AI took too long. Please try again.');
      const abort = new AbortController();
      let timer;
      try {
        const timeout = new Promise((resolve, reject) => {
          timer = setTimeout(() => { abort.abort(); reject(new AppError(504, 'AI_TIMEOUT', 'Gemini AI took too long. Please try again.')); }, remaining);
        });
        const response = await Promise.race([call({ model: env.geminiModel,
          contents: [{ role: 'user', parts }], config: {
            systemInstruction, responseMimeType: 'application/json', responseJsonSchema: simplifyProviderSchema ? structuralSchema(schema) : schema,
            ...(/^(models\/)?gemini-3[.-]/.test(env.geminiModel || '') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            maxOutputTokens, temperature: 0.7, abortSignal: abort.signal,
            httpOptions: { timeout: remaining, retryOptions: { attempts: 1 } },
          } }), timeout]);
        if (response.promptFeedback?.blockReason || response.candidates?.some(candidate => ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION', 'IMAGE_SAFETY'].includes(candidate.finishReason))) {
          throw new AppError(422, 'AI_SAFETY_BLOCK', 'The AI could not process that request. Try changing your request.');
        }
        if (response.candidates?.some(candidate => candidate.finishReason && candidate.finishReason !== 'STOP')) {
          throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI response was incomplete. Please try again.');
        }
        return parseOutput(response.text, schema);
      } catch (error) {
        if (error instanceof AppError) throw error;
        const providerStatus = Number(error.status || error.code);
        if (providerStatus === 400) throw new AppError(502, 'AI_REQUEST_REJECTED', 'Gemini rejected the generation request format. This is not a quota reset issue.');
        if ([401,403].includes(providerStatus)) throw new AppError(503, 'AI_ACCESS_DENIED', 'Gemini access was denied. Check the server API key and project permissions.');
        if (providerStatus === 404) throw new AppError(503, 'AI_MODEL_UNAVAILABLE', 'The configured Gemini model is unavailable. Check the server model setting.');
        const connectionReset = ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'].includes(error.cause?.code || error.code);
        if (connectionReset && attempt < 2) { clearTimeout(timer); await sleep(500 * 2 ** attempt); continue; }
        if (quotaError(error)) {
          if (attempt < 2) { clearTimeout(timer); await sleep(500 * 2 ** attempt); continue; }
          throw new AppError(429, 'AI_QUOTA_EXCEEDED', 'The AI limit has been reached. Please try again later. Your saved content is still available.');
        }
        const isTemporary = Number(error.status) === 503 || error.status === 'UNAVAILABLE' || /high demand/i.test(String(error.message || ''));
        if (isTemporary && attempt < 2) { clearTimeout(timer); await sleep(1000 * 2 ** attempt); continue; }
        if (abort.signal.aborted || ['AbortError', 'TimeoutError'].includes(error.name) || [408, 504].includes(Number(error.status))) {
          throw new AppError(504, 'AI_TIMEOUT', 'Gemini AI took too long. Please try again.');
        }
        throw new AppError(503, 'AI_UNAVAILABLE', 'Gemini AI is temporarily unavailable. Please try again later.');
      } finally { clearTimeout(timer); }
    }
  };
}
module.exports = { createGeminiService, generateJSON: createGeminiService() };
