const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

// Optional process-local resolver override for networks that block Atlas SRV lookups.
// This never changes Windows DNS settings.
if (process.env.MONGO_DNS_SERVERS) {
  const servers = process.env.MONGO_DNS_SERVERS.split(',').map(value => value.trim());
  if (servers.some(value => !require('node:net').isIP(value))) throw new Error('MONGO_DNS_SERVERS must contain comma-separated IP addresses.');
  require('node:dns').setServers(servers);
}

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const clientUrl = process.env.CLIENT_URL || (isProduction ? '' : 'http://localhost:5173');
if (!clientUrl) throw new Error('CLIENT_URL is required in production.');
let parsed;
try { parsed = new URL(clientUrl); } catch { throw new Error('CLIENT_URL must be a valid origin.'); }
if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== clientUrl) {
  throw new Error('CLIENT_URL must be an HTTP(S) origin without a path or trailing slash.');
}
if (isProduction && parsed.protocol !== 'https:') {
  throw new Error('CLIENT_URL must use HTTPS in production.');
}
if (isProduction && (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32)) {
  throw new Error('JWT_SECRET must contain at least 32 bytes in production.');
}

module.exports = {
  aiProvider: process.env.AI_PROVIDER || 'gemini',
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
  isProduction,
  port,
  clientUrl,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
};
