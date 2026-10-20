// FR11 — manage users, FR12 — manage restaurants, FR13 — moderate reviews.
// Mounted behind requireRole('admin'), so no other role can reach these routes.
const express = require('express');
const { query, one } = require('../db');
const { validate, id } = require('../utils/validate');
const { HttpError, notFound } = require('../utils/http-error');
const { requireRole } = require('../middleware/auth');
const { RESTAURANT_RULES } = require('../utils/rules');
const { RESTAURANT_COLUMNS, RESTAURANT_FROM, likeTerm, paging } = require('../utils/sql');

const router = express.Router();
router.use(requireRole('admin'));

// ---------- Dashboard ----------

router.get('/overview', async (req, res) => {
  const [totals, roles, monthly, cuisines, topRestaurants] = await Promise.all([
    one(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM users WHERE status = 'blocked') AS blocked_users,
              (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS new_users,
              (SELECT COUNT(*) FROM restaurants WHERE status = 'approved') AS restaurants,
              (SELECT COUNT(*) FROM restaurants WHERE status = 'pending') AS pending_restaurants,
              (SELECT COUNT(*) FROM dishes) AS dishes,
              (SELECT COUNT(*) FROM reviews) AS reviews,
              (SELECT COUNT(*) FROM reviews WHERE status = 'hidden') AS hidden_reviews,
              (SELECT COUNT(*) FROM review_reports WHERE status = 'open') AS open_reports,
              (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE status = 'visible') AS avg_rating`
    ),
    query('SELECT role, COUNT(*) AS count FROM users GROUP BY role'),
    query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count
         FROM reviews WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY month ORDER BY month`
    ),
    query(
      `SELECT c.name, c.emoji, COUNT(v.id) AS count, ROUND(AVG(v.rating), 1) AS avg_rating FROM cuisines c
         JOIN restaurants r ON r.cuisine_id = c.id AND r.status = 'approved'
         JOIN reviews v ON v.restaurant_id = r.id AND v.status = 'visible'
        GROUP BY c.id ORDER BY count DESC, avg_rating DESC LIMIT 6`
    ),
    query(
      `SELECT r.id, r.name, r.city, COALESCE(st.avg_rating, 0) AS avg_rating, COALESCE(st.review_count, 0) AS review_count
         FROM restaurants r
         LEFT JOIN (SELECT restaurant_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS review_count
                      FROM reviews WHERE status = 'visible' GROUP BY restaurant_id) st ON st.restaurant_id = r.id
        WHERE r.status = 'approved' ORDER BY avg_rating DESC, review_count DESC LIMIT 5`
    ),
  ]);
  res.json({ totals, roles, monthly, cuisines, topRestaurants });
});

// ---------- Users (FR11) ----------

router.get('/users', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    const t = likeTerm(String(req.query.q).trim().slice(0, 80));
    where.push('(u.name LIKE ? OR u.email LIKE ?)');
    params.push(t, t);
  }
  if (['customer', 'owner', 'admin'].includes(req.query.role)) { where.push('u.role = ?'); params.push(req.query.role); }
  if (['active', 'blocked'].includes(req.query.status)) { where.push('u.status = ?'); params.push(req.query.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { limit, page, offset } = paging(req.query, 15, 100);
  const items = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.city, u.created_at,
            (SELECT COUNT(*) FROM reviews v WHERE v.user_id = u.id) AS review_count,
            (SELECT COUNT(*) FROM restaurants r WHERE r.owner_id = u.id) AS restaurant_count
       FROM users u ${whereSql} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// PUT /api/admin/users/:id — change role and/or block/unblock
router.put('/users/:id', async (req, res) => {
  const userId = id(req.params.id);
  const target = await one('SELECT id, name, role, status FROM users WHERE id = ?', [userId]);
  if (!target) throw notFound('User');
  if (target.id === req.user.id) throw new HttpError(400, 'You cannot change your own role or status');
  const data = validate(req.body, {
    role: { type: 'enum', required: true, values: ['customer', 'owner', 'admin'] },
    status: { type: 'enum', required: true, values: ['active', 'blocked'] },
  });
  await query('UPDATE users SET role = ?, status = ? WHERE id = ?', [data.role, data.status, userId]);
  if (data.status === 'blocked') await query('DELETE FROM sessions WHERE user_id = ?', [userId]); // force logout
  const verb = data.status !== target.status ? (data.status === 'blocked' ? 'blocked' : 'unblocked') : 'updated';
  res.json({ message: `${target.name} has been ${verb}` });
});

router.delete('/users/:id', async (req, res) => {
  const userId = id(req.params.id);
  if (userId === req.user.id) throw new HttpError(400, 'Use your profile page to delete your own account');
  const target = await one('SELECT name FROM users WHERE id = ?', [userId]);
  if (!target) throw notFound('User');
  await query('DELETE FROM users WHERE id = ?', [userId]);
  res.json({ message: `${target.name}'s account has been deleted` });
});

// ---------- Restaurants (FR12) ----------

router.get('/restaurants', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    const t = likeTerm(String(req.query.q).trim().slice(0, 80));
    where.push('(r.name LIKE ? OR r.city LIKE ? OR u.name LIKE ?)');
    params.push(t, t, t);
  }
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) { where.push('r.status = ?'); params.push(req.query.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = await query(
    `SELECT ${RESTAURANT_COLUMNS}, u.name AS owner_name, u.email AS owner_email,
            (SELECT COUNT(*) FROM dishes d WHERE d.restaurant_id = r.id) AS dish_count
       ${RESTAURANT_FROM} LEFT JOIN users u ON u.id = r.owner_id
       ${whereSql}
      ORDER BY FIELD(r.status, 'pending', 'approved', 'rejected'), r.created_at DESC`,
    params
  );
  res.json({ items });
});

// PUT /api/admin/restaurants/:id — edit any restaurant's information
router.put('/restaurants/:id', async (req, res) => {
  const restaurantId = id(req.params.id);
  if (!(await one('SELECT id FROM restaurants WHERE id = ?', [restaurantId]))) throw notFound('Restaurant');
  const d = validate(req.body, RESTAURANT_RULES);
  await query(
    `UPDATE restaurants SET cuisine_id = ?, name = ?, description = ?, city = ?, address = ?, phone = ?, website = ?,
            price_level = ?, opens_at = ?, closes_at = ?, image_url = ? WHERE id = ?`,
    [d.cuisine_id, d.name, d.description, d.city, d.address, d.phone, d.website, d.price_level,
      d.opens_at, d.closes_at, d.image_url, restaurantId]
  );
  res.json({ message: 'Restaurant information updated' });
});

// PATCH /api/admin/restaurants/:id/status — approve / reject / feature
router.patch('/restaurants/:id/status', async (req, res) => {
  const restaurantId = id(req.params.id);
  const r = await one('SELECT id, name FROM restaurants WHERE id = ?', [restaurantId]);
  if (!r) throw notFound('Restaurant');
  const data = validate(req.body, {
    status: { type: 'enum', required: true, values: ['pending', 'approved', 'rejected'] },
    is_featured: { type: 'bool' },
  });
  await query('UPDATE restaurants SET status = ?, is_featured = ? WHERE id = ?',
    [data.status, data.status === 'approved' ? data.is_featured : 0, restaurantId]);
  res.json({ message: `"${r.name}" is now ${data.status}${data.is_featured && data.status === 'approved' ? ' and featured' : ''}` });
});

router.delete('/restaurants/:id', async (req, res) => {
  const restaurantId = id(req.params.id);
  const r = await one('SELECT name FROM restaurants WHERE id = ?', [restaurantId]);
  if (!r) throw notFound('Restaurant');
  await query('DELETE FROM restaurants WHERE id = ?', [restaurantId]);
  res.json({ message: `"${r.name}" has been removed` });
});

// ---------- Reviews & reports (FR13) ----------

router.get('/reviews', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    const t = likeTerm(String(req.query.q).trim().slice(0, 80));
    where.push('(v.title LIKE ? OR v.comment LIKE ? OR u.name LIKE ? OR r.name LIKE ?)');
    params.push(t, t, t, t);
  }
  if (['visible', 'hidden'].includes(req.query.status)) { where.push('v.status = ?'); params.push(req.query.status); }
  if (req.query.reported === '1') where.push("EXISTS (SELECT 1 FROM review_reports p WHERE p.review_id = v.id AND p.status = 'open')");
  const rating = Number(req.query.rating);
  if (rating >= 1 && rating <= 5) { where.push('v.rating = ?'); params.push(rating); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { limit, page, offset } = paging(req.query, 15, 100);
  const items = await query(
    `SELECT v.id, v.rating, v.title, v.comment, v.status, v.created_at, u.id AS user_id, u.name AS author,
            r.id AS restaurant_id, r.name AS restaurant,
            (SELECT COUNT(*) FROM review_reports p WHERE p.review_id = v.id AND p.status = 'open') AS open_reports
       FROM reviews v JOIN users u ON u.id = v.user_id JOIN restaurants r ON r.id = v.restaurant_id
       ${whereSql} ORDER BY open_reports DESC, v.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM reviews v JOIN users u ON u.id = v.user_id JOIN restaurants r ON r.id = v.restaurant_id ${whereSql}`,
    params
  );
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// PATCH /api/admin/reviews/:id — hide or restore a review
router.patch('/reviews/:id', async (req, res) => {
  const reviewId = id(req.params.id);
  const { status } = validate(req.body, { status: { type: 'enum', required: true, values: ['visible', 'hidden'] } });
  const result = await query('UPDATE reviews SET status = ?, updated_at = updated_at WHERE id = ?', [status, reviewId]);
  if (!result.affectedRows) throw notFound('Review');
  res.json({ message: status === 'hidden' ? 'Review hidden from the public' : 'Review restored' });
});

router.delete('/reviews/:id', async (req, res) => {
  const result = await query('DELETE FROM reviews WHERE id = ?', [id(req.params.id)]);
  if (!result.affectedRows) throw notFound('Review');
  res.json({ message: 'Review deleted permanently' });
});

router.get('/reports', async (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  const items = await query(
    `SELECT p.id, p.reason, p.details, p.status, p.created_at, p.resolved_at,
            rp.name AS reporter, v.id AS review_id, v.rating, v.title, v.comment, v.status AS review_status,
            au.name AS author, r.id AS restaurant_id, r.name AS restaurant
       FROM review_reports p
       JOIN users rp ON rp.id = p.reporter_id
       JOIN reviews v ON v.id = p.review_id
       JOIN users au ON au.id = v.user_id
       JOIN restaurants r ON r.id = v.restaurant_id
      WHERE p.status = ? ORDER BY p.created_at DESC`,
    [status]
  );
  res.json({ items });
});

// PATCH /api/admin/reports/:id — action: 'hide' (hide review + resolve) or 'dismiss'
router.patch('/reports/:id', async (req, res) => {
  const reportId = id(req.params.id);
  const report = await one('SELECT * FROM review_reports WHERE id = ?', [reportId]);
  if (!report) throw notFound('Report');
  const { action } = validate(req.body, { action: { type: 'enum', required: true, values: ['hide', 'dismiss'] } });
  if (action === 'hide') {
    await query("UPDATE reviews SET status = 'hidden', updated_at = updated_at WHERE id = ?", [report.review_id]);
    // every open report about the same review is resolved together
    await query("UPDATE review_reports SET status = 'resolved', resolved_at = NOW() WHERE review_id = ? AND status = 'open'", [report.review_id]);
  } else {
    await query("UPDATE review_reports SET status = 'dismissed', resolved_at = NOW() WHERE id = ?", [reportId]);
  }
  res.json({ message: action === 'hide' ? 'Review hidden and report resolved' : 'Report dismissed' });
});

// ---------- Cuisines (lookup data) ----------

router.post('/cuisines', async (req, res) => {
  const data = validate(req.body, {
    name: { type: 'string', required: true, min: 2, max: 40 },
    emoji: { type: 'string', max: 8, default: '🍽️' },
  });
  if (await one('SELECT id FROM cuisines WHERE name = ?', [data.name])) {
    throw new HttpError(409, 'This cuisine already exists', { name: 'This cuisine already exists' });
  }
  const result = await query('INSERT INTO cuisines (name, emoji) VALUES (?, ?)', [data.name, data.emoji || '🍽️']);
  res.status(201).json({ id: result.insertId, message: `Cuisine "${data.name}" added` });
});

router.delete('/cuisines/:id', async (req, res) => {
  const cuisineId = id(req.params.id);
  const used = await one('SELECT COUNT(*) AS n FROM restaurants WHERE cuisine_id = ?', [cuisineId]);
  if (used.n > 0) throw new HttpError(409, `This cuisine is used by ${used.n} restaurant(s) and cannot be deleted`);
  const result = await query('DELETE FROM cuisines WHERE id = ?', [cuisineId]);
  if (!result.affectedRows) throw notFound('Cuisine');
  res.json({ message: 'Cuisine deleted' });
});

module.exports = router;
