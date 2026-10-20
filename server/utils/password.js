// Salted password hashing with Node's built-in scrypt (no third-party library).
// Stored format: scrypt$<salt hex>$<hash hex>
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  // constant-time comparison prevents timing attacks
  return crypto.timingSafeEqual(expected, actual);
}

/** Random session token for the client + its SHA-256 hash for the database. */
function newToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: sha256(token) };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { hashPassword, verifyPassword, newToken, sha256 };
