const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { requireSecret, signToken } = require('../services/tokens');
const { AppError } = require('../middleware/errors');
const env = require('../config/env');
const publicUser = user => ({ id: String(user._id), name: user.name, email: user.email, createdAt: user.createdAt });
const session = user => ({ user: publicUser(user), token: signToken(user), tokenType: 'Bearer', expiresIn: 3600 });
// Public dummy bcrypt digest (cost 12), used only for constant-cost failed login.
const dummyHash = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

async function register(req, res) {
  requireSecret();
  const { name, email, password } = req.validated;
  const passwordHash = await bcrypt.hash(password, 12);
  // The unique email index is the concurrency-safe duplicate guard.
  const user = await User.create({ name, email, passwordHash, authProvider: 'local' });
  res.status(201).json(session(user));
}
async function login(req, res) {
  requireSecret();
  const { email, password } = req.validated;
  const user = await User.findOne({ email }).select('+passwordHash +authProvider');
  if (user && user.authProvider === 'google') {
    throw new AppError(401, 'GOOGLE_ACCOUNT', 'This email uses Google Sign-In. Please use the Google button to sign in.');
  }
  // Match bcrypt cost for missing accounts to reduce account timing disclosure.
  const hash = user ? user.passwordHash : dummyHash;
  const matches = await bcrypt.compare(password, hash);
  if (!user || !matches) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  res.json(session(user));
}
async function googleAuth(req, res) {
  requireSecret();
  const { credential } = req.body;
  if (!credential || typeof credential !== 'string') {
    throw new AppError(400, 'MISSING_CREDENTIAL', 'Google credential token is required.');
  }
  if (!env.googleClientId) {
    throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Sign-In is not configured on the server.');
  }
  const client = new OAuth2Client(env.googleClientId);
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'The Google sign-in token is invalid or expired. Please try again.');
  }
  if (!payload.email_verified) {
    throw new AppError(401, 'EMAIL_NOT_VERIFIED', 'Your Google email is not verified.');
  }
  const { sub: googleId, email, name } = payload;
  // Find existing user by googleId or email
  let user = await User.findOne({ $or: [{ googleId }, { email }] }).select('+googleId +authProvider +passwordHash');
  if (user) {
    // Link Google to existing local account
    if (!user.googleId) {
      user.googleId = googleId;
      user.authProvider = 'google';
      await user.save();
    }
  } else {
    // Create new Google user
    user = await User.create({ name: name || email.split('@')[0], email, googleId, authProvider: 'google' });
  }
  res.json(session(user));
}
function me(req, res) { res.json({ user: publicUser(req.user) }); }
module.exports = { register, login, googleAuth, me };
