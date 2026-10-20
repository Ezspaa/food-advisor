// FR1 — Register, log in and log out.
const express = require('express');
const { query, one } = require('../db');
const config = require('../../config');
const { hashPassword, verifyPassword, newToken } = require('../utils/password');
const { validate } = require('../utils/validate');
const { HttpError } = require('../utils/http-error');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many failed attempts. Please wait 15 minutes and try again.' });

async function startSession(userId) {
  const { token, hash } = newToken();
  await query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
    [userId, hash, config.sessionDays]
  );
  // housekeeping: forget expired sessions of this user
  await query('DELETE FROM sessions WHERE user_id = ? AND expires_at < NOW()', [userId]);
  return token;
}

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, city: u.city,
  bio: u.bio, avatar_url: u.avatar_url, created_at: u.created_at,
});

// POST /api/auth/register  — customers and restaurant owners can sign up
router.post('/register', authLimiter, async (req, res) => {
  const data = validate(req.body, {
    name: { type: 'string', required: true, min: 2, max: 80, label: 'Full name' },
    email: { type: 'email', required: true },
    password: { type: 'password', required: true },
    role: { type: 'enum', required: true, values: ['customer', 'owner'], label: 'Account type' },
    city: { type: 'string', max: 60 },
  });
  if (await one('SELECT id FROM users WHERE email = ?', [data.email])) {
    throw new HttpError(409, 'An account with this email already exists', { email: 'This email is already registered' });
  }
  const passwordHash = await hashPassword(data.password);
  const result = await query(
    'INSERT INTO users (name, email, password_hash, role, city) VALUES (?, ?, ?, ?, ?)',
    [data.name, data.email, passwordHash, data.role, data.city]
  );
  const user = await one('SELECT * FROM users WHERE id = ?', [result.insertId]);
  const token = await startSession(user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const data = validate(req.body, {
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, max: 72 },
  });
  const user = await one('SELECT * FROM users WHERE email = ?', [data.email]);
  // same message for "no such user" and "wrong password" (no account enumeration)
  if (!user || !(await verifyPassword(data.password, user.password_hash))) {
    throw new HttpError(401, 'Incorrect email or password');
  }
  if (user.status === 'blocked') {
    throw new HttpError(403, 'This account has been blocked by an administrator');
  }
  const token = await startSession(user.id);
  res.json({ token, user: publicUser(user) });
});

// POST /api/auth/logout — deletes the current session from the database
router.post('/logout', requireAuth, async (req, res) => {
  await query('DELETE FROM sessions WHERE id = ?', [req.user.session_id]);
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me — who am I? (used on every page load)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
module.exports.publicUser = publicUser;
