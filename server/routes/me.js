// FR6 — view/update own profile, FR5 — list own reviews, FR7 — favourites.
const express = require('express');
const { query, one } = require('../db');
const { validate, id } = require('../utils/validate');
const { HttpError } = require('../utils/http-error');
const { hashPassword, verifyPassword } = require('../utils/password');
const { requireAuth } = require('../middleware/auth');
const { RESTAURANT_COLUMNS, RESTAURANT_FROM } = require('../utils/sql');
const { publicUser } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/me — profile with personal statistics
router.get('/', async (req, res) => {
  const stats = await one(
    `SELECT (SELECT COUNT(*) FROM reviews WHERE user_id = ?) AS reviews,
            (SELECT COUNT(*) FROM favorites WHERE user_id = ?) AS favorites,
            (SELECT COUNT(*) FROM review_votes v JOIN reviews r ON r.id = v.review_id WHERE r.user_id = ?) AS helpful_votes,
            (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE user_id = ?) AS avg_given`,
    [req.user.id, req.user.id, req.user.id, req.user.id]
  );
  res.json({ user: publicUser(req.user), stats });
});

// PUT /api/me — update profile details
router.put('/', async (req, res) => {
  const data = validate(req.body, {
    name: { type: 'string', required: true, min: 2, max: 80, label: 'Full name' },
    email: { type: 'email', required: true },
    city: { type: 'string', max: 60 },
    bio: { type: 'string', max: 300 },
    avatar_url: { type: 'url', label: 'Avatar URL' },
  });
  const clash = await one('SELECT id FROM users WHERE email = ? AND id <> ?', [data.email, req.user.id]);
  if (clash) throw new HttpError(409, 'This email is already used by another account', { email: 'This email is already registered' });
  await query(
    'UPDATE users SET name = ?, email = ?, city = ?, bio = ?, avatar_url = ? WHERE id = ?',
    [data.name, data.email, data.city, data.bio, data.avatar_url, req.user.id]
  );
  const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: publicUser(user), message: 'Profile updated' });
});

// PUT /api/me/password — change password (logs out other devices)
router.put('/password', async (req, res) => {
  const data = validate(req.body, {
    current_password: { type: 'string', required: true, max: 72, label: 'Current password' },
    new_password: { type: 'password', required: true, label: 'New password' },
  });
  const user = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await verifyPassword(data.current_password, user.password_hash))) {
    throw new HttpError(422, 'Current password is incorrect', { current_password: 'Current password is incorrect' });
  }
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(data.new_password), req.user.id]);
  await query('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [req.user.id, req.user.session_id]);
  res.json({ message: 'Password changed. Other devices have been logged out.' });
});

// DELETE /api/me — delete own account (password confirmation required)
router.delete('/', async (req, res) => {
  const data = validate(req.body, { password: { type: 'string', required: true, max: 72 } });
  const user = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await verifyPassword(data.password, user.password_hash))) {
    throw new HttpError(422, 'Password is incorrect', { password: 'Password is incorrect' });
  }
  if (req.user.role === 'admin') {
    const { admins } = await one("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin' AND status = 'active'");
    if (admins <= 1) throw new HttpError(400, 'You are the last administrator and cannot delete this account');
  }
  await query('DELETE FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Your account has been deleted' });
});

// GET /api/me/reviews — every review I have written
router.get('/reviews', async (req, res) => {
  const items = await query(
    `SELECT rv.id, rv.rating, rv.title, rv.comment, rv.visit_date, rv.status, rv.owner_reply, rv.owner_reply_at,
            rv.created_at, rv.updated_at, r.id AS restaurant_id, r.name AS restaurant, r.city, r.image_url,
            (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = rv.id) AS helpful_count
       FROM reviews rv JOIN restaurants r ON r.id = rv.restaurant_id
      WHERE rv.user_id = ? ORDER BY rv.created_at DESC`,
    [req.user.id]
  );
  res.json({ items });
});

// GET /api/me/favorites
router.get('/favorites', async (req, res) => {
  const items = await query(
    `SELECT ${RESTAURANT_COLUMNS}, f.created_at AS saved_at ${RESTAURANT_FROM}
       JOIN favorites f ON f.restaurant_id = r.id AND f.user_id = ?
      WHERE r.status = 'approved' ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json({ items });
});

// GET /api/me/favorites/ids — lightweight list used to paint heart icons
router.get('/favorites/ids', async (req, res) => {
  const rows = await query('SELECT restaurant_id FROM favorites WHERE user_id = ?', [req.user.id]);
  res.json({ ids: rows.map((r) => r.restaurant_id) });
});

// POST /api/me/favorites/sync — merge favourites a guest saved in localStorage
router.post('/favorites/sync', async (req, res) => {
  const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : [])
    .map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  if (ids.length) {
    await query(
      `INSERT IGNORE INTO favorites (user_id, restaurant_id)
       SELECT ?, id FROM restaurants WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'approved'`,
      [req.user.id, ...ids]
    );
  }
  const rows = await query('SELECT restaurant_id FROM favorites WHERE user_id = ?', [req.user.id]);
  res.json({ ids: rows.map((r) => r.restaurant_id) });
});

// PUT /api/me/favorites/:restaurantId — save
router.put('/favorites/:restaurantId', async (req, res) => {
  const restaurantId = id(req.params.restaurantId);
  const r = await one("SELECT id FROM restaurants WHERE id = ? AND status = 'approved'", [restaurantId]);
  if (!r) throw new HttpError(404, 'Restaurant not found');
  await query('INSERT IGNORE INTO favorites (user_id, restaurant_id) VALUES (?, ?)', [req.user.id, restaurantId]);
  res.json({ favorite: true, message: 'Saved to favourites' });
});

// DELETE /api/me/favorites/:restaurantId — remove
router.delete('/favorites/:restaurantId', async (req, res) => {
  await query('DELETE FROM favorites WHERE user_id = ? AND restaurant_id = ?', [req.user.id, id(req.params.restaurantId)]);
  res.json({ favorite: false, message: 'Removed from favourites' });
});

module.exports = router;
