// Authentication + role-based access control (RBAC).
// The client sends `Authorization: Bearer <token>`; we look up the SHA-256 hash
// of that token in the sessions table. Roles are always checked on the server.
const { one } = require('../db');
const { sha256 } = require('../utils/password');
const { HttpError } = require('../utils/http-error');

/** Attach req.user when a valid, unexpired token is present (never fails). */
async function loadUser(req, res, next) {
  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (/^[a-f0-9]{64}$/.test(token)) {
      const user = await one(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.city, u.bio, u.avatar_url, u.created_at,
                s.id AS session_id
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > NOW()`,
        [sha256(token)]
      );
      if (user && user.status === 'active') req.user = user;
    }
  }
  next();
}

/** Reject anonymous requests with 401. */
function requireAuth(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in to continue');
  next();
}

/** Allow only the listed roles, e.g. requireRole('admin'). */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Please log in to continue');
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'This area is not available for your account type');
    next();
  };
}

module.exports = { loadUser, requireAuth, requireRole };
