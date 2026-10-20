// FR8 — owners create/update/delete their own restaurants,
// FR9 — manage dishes, FR10 — view reviews and average rating (+ reply).
// Every query includes `owner_id = req.user.id`, so an owner can never touch
// another owner's restaurant even by editing the URL (server-side RBAC).
const express = require('express');
const { query, one } = require('../db');
const { validate, id } = require('../utils/validate');
const { HttpError, notFound } = require('../utils/http-error');
const { requireRole } = require('../middleware/auth');
const { RESTAURANT_RULES, DISH_RULES } = require('../utils/rules');
const { RESTAURANT_COLUMNS, RESTAURANT_FROM } = require('../utils/sql');

const router = express.Router();
router.use(requireRole('owner'));

async function ownRestaurant(restaurantId, ownerId) {
  const r = await one('SELECT * FROM restaurants WHERE id = ? AND owner_id = ?', [restaurantId, ownerId]);
  if (!r) throw notFound('Restaurant'); // 404 (not 403) so others' ids are not revealed
  return r;
}

async function ownDish(dishId, ownerId) {
  const d = await one(
    'SELECT d.* FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id WHERE d.id = ? AND r.owner_id = ?',
    [dishId, ownerId]
  );
  if (!d) throw notFound('Dish');
  return d;
}

async function checkCuisine(cuisineId) {
  if (!(await one('SELECT id FROM cuisines WHERE id = ?', [cuisineId]))) {
    throw new HttpError(422, 'Please choose a cuisine', { cuisine_id: 'Please choose a cuisine' });
  }
}

// GET /api/owner/overview — dashboard numbers
router.get('/overview', async (req, res) => {
  const ownerId = req.user.id;
  const [totals, distribution, recent, monthly] = await Promise.all([
    one(
      `SELECT COUNT(*) AS restaurants,
              SUM(status = 'approved') AS approved, SUM(status = 'pending') AS pending,
              (SELECT COUNT(*) FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id WHERE r.owner_id = ?) AS dishes,
              (SELECT COUNT(*) FROM reviews v JOIN restaurants r ON r.id = v.restaurant_id WHERE r.owner_id = ? AND v.status = 'visible') AS reviews,
              (SELECT ROUND(AVG(v.rating), 2) FROM reviews v JOIN restaurants r ON r.id = v.restaurant_id WHERE r.owner_id = ? AND v.status = 'visible') AS avg_rating,
              (SELECT COUNT(*) FROM reviews v JOIN restaurants r ON r.id = v.restaurant_id WHERE r.owner_id = ? AND v.status = 'visible' AND v.owner_reply IS NULL) AS unanswered,
              (SELECT COUNT(*) FROM favorites f JOIN restaurants r ON r.id = f.restaurant_id WHERE r.owner_id = ?) AS favorites
         FROM restaurants WHERE owner_id = ?`,
      [ownerId, ownerId, ownerId, ownerId, ownerId, ownerId]
    ),
    query(
      `SELECT v.rating, COUNT(*) AS count FROM reviews v JOIN restaurants r ON r.id = v.restaurant_id
        WHERE r.owner_id = ? AND v.status = 'visible' GROUP BY v.rating`,
      [ownerId]
    ),
    query(
      `SELECT v.id, v.rating, v.title, v.comment, v.created_at, v.owner_reply, u.name AS author,
              r.id AS restaurant_id, r.name AS restaurant
         FROM reviews v JOIN restaurants r ON r.id = v.restaurant_id JOIN users u ON u.id = v.user_id
        WHERE r.owner_id = ? AND v.status = 'visible' ORDER BY v.created_at DESC LIMIT 5`,
      [ownerId]
    ),
    query(
      `SELECT DATE_FORMAT(v.created_at, '%Y-%m') AS month, COUNT(*) AS count, ROUND(AVG(v.rating), 1) AS avg_rating
         FROM reviews v JOIN restaurants r ON r.id = v.restaurant_id
        WHERE r.owner_id = ? AND v.status = 'visible' AND v.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY month ORDER BY month`,
      [ownerId]
    ),
  ]);
  const ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  distribution.forEach((d) => { ratings[d.rating] = d.count; });
  res.json({ totals, ratings, recent, monthly });
});

// ---------- Restaurants (FR8) ----------

router.get('/restaurants', async (req, res) => {
  const items = await query(
    `SELECT ${RESTAURANT_COLUMNS},
            (SELECT COUNT(*) FROM dishes d WHERE d.restaurant_id = r.id) AS dish_count,
            (SELECT COUNT(*) FROM favorites f WHERE f.restaurant_id = r.id) AS favorite_count
       ${RESTAURANT_FROM} WHERE r.owner_id = ? ORDER BY r.created_at DESC`,
    [req.user.id]
  );
  res.json({ items });
});

router.post('/restaurants', async (req, res) => {
  const d = validate(req.body, RESTAURANT_RULES);
  await checkCuisine(d.cuisine_id);
  const result = await query(
    `INSERT INTO restaurants (owner_id, cuisine_id, name, description, city, address, phone, website,
                              price_level, opens_at, closes_at, image_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [req.user.id, d.cuisine_id, d.name, d.description, d.city, d.address, d.phone, d.website,
      d.price_level, d.opens_at, d.closes_at, d.image_url]
  );
  res.status(201).json({ id: result.insertId, message: 'Restaurant submitted! It will appear publicly once an administrator approves it.' });
});

router.put('/restaurants/:id', async (req, res) => {
  const r = await ownRestaurant(id(req.params.id), req.user.id);
  const d = validate(req.body, RESTAURANT_RULES);
  await checkCuisine(d.cuisine_id);
  // a rejected restaurant goes back to the approval queue after it is edited
  const status = r.status === 'rejected' ? 'pending' : r.status;
  await query(
    `UPDATE restaurants SET cuisine_id = ?, name = ?, description = ?, city = ?, address = ?, phone = ?, website = ?,
            price_level = ?, opens_at = ?, closes_at = ?, image_url = ?, status = ?
      WHERE id = ? AND owner_id = ?`,
    [d.cuisine_id, d.name, d.description, d.city, d.address, d.phone, d.website, d.price_level,
      d.opens_at, d.closes_at, d.image_url, status, r.id, req.user.id]
  );
  res.json({ message: status === 'pending' && r.status === 'rejected' ? 'Changes saved and resubmitted for approval' : 'Restaurant updated' });
});

router.delete('/restaurants/:id', async (req, res) => {
  const r = await ownRestaurant(id(req.params.id), req.user.id);
  await query('DELETE FROM restaurants WHERE id = ? AND owner_id = ?', [r.id, req.user.id]);
  res.json({ message: `"${r.name}" has been deleted` });
});

// ---------- Dishes (FR9) ----------

router.get('/restaurants/:id/dishes', async (req, res) => {
  const r = await ownRestaurant(id(req.params.id), req.user.id);
  const items = await query(
    `SELECT * FROM dishes WHERE restaurant_id = ?
      ORDER BY FIELD(category, 'Starters','Mains','Sides','Desserts','Drinks'), name`,
    [r.id]
  );
  res.json({ items });
});

router.post('/restaurants/:id/dishes', async (req, res) => {
  const r = await ownRestaurant(id(req.params.id), req.user.id);
  const d = validate({ is_available: true, ...req.body }, DISH_RULES);
  const result = await query(
    `INSERT INTO dishes (restaurant_id, name, description, category, price, image_url, is_vegetarian, is_spicy, is_available)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.id, d.name, d.description, d.category, d.price, d.image_url, d.is_vegetarian, d.is_spicy, d.is_available]
  );
  res.status(201).json({ id: result.insertId, message: `"${d.name}" added to the menu` });
});

router.put('/dishes/:id', async (req, res) => {
  const dish = await ownDish(id(req.params.id), req.user.id);
  const d = validate(req.body, DISH_RULES);
  await query(
    `UPDATE dishes SET name = ?, description = ?, category = ?, price = ?, image_url = ?,
            is_vegetarian = ?, is_spicy = ?, is_available = ? WHERE id = ?`,
    [d.name, d.description, d.category, d.price, d.image_url, d.is_vegetarian, d.is_spicy, d.is_available, dish.id]
  );
  res.json({ message: 'Dish updated' });
});

// PATCH /api/owner/dishes/:id/availability — quick on/off toggle from the menu table
router.patch('/dishes/:id/availability', async (req, res) => {
  const dish = await ownDish(id(req.params.id), req.user.id);
  const { is_available } = validate(req.body, { is_available: { type: 'bool' } });
  await query('UPDATE dishes SET is_available = ? WHERE id = ?', [is_available, dish.id]);
  res.json({ message: is_available ? `"${dish.name}" is available again` : `"${dish.name}" marked as sold out` });
});

router.delete('/dishes/:id', async (req, res) => {
  const dish = await ownDish(id(req.params.id), req.user.id);
  await query('DELETE FROM dishes WHERE id = ?', [dish.id]);
  res.json({ message: `"${dish.name}" removed from the menu` });
});

// ---------- Reviews (FR10) ----------

router.get('/reviews', async (req, res) => {
  const params = [req.user.id];
  let filter = '';
  if (req.query.restaurant) { filter += ' AND r.id = ?'; params.push(id(req.query.restaurant, 'restaurant')); }
  if (req.query.unanswered === '1') filter += ' AND v.owner_reply IS NULL';
  const rating = Number(req.query.rating);
  if (rating >= 1 && rating <= 5) { filter += ' AND v.rating = ?'; params.push(rating); }
  const items = await query(
    `SELECT v.id, v.rating, v.title, v.comment, v.visit_date, v.owner_reply, v.owner_reply_at, v.created_at,
            u.name AS author, r.id AS restaurant_id, r.name AS restaurant
       FROM reviews v JOIN restaurants r ON r.id = v.restaurant_id JOIN users u ON u.id = v.user_id
      WHERE r.owner_id = ? AND v.status = 'visible' ${filter}
      ORDER BY v.created_at DESC`,
    params
  );
  res.json({ items });
});

// PUT /api/owner/reviews/:id/reply — public reply from the restaurant
router.put('/reviews/:id/reply', async (req, res) => {
  const reviewId = id(req.params.id);
  const review = await one(
    'SELECT v.id FROM reviews v JOIN restaurants r ON r.id = v.restaurant_id WHERE v.id = ? AND r.owner_id = ?',
    [reviewId, req.user.id]
  );
  if (!review) throw notFound('Review');
  const { reply } = validate(req.body, { reply: { type: 'string', required: true, min: 2, max: 600 } });
  await query('UPDATE reviews SET owner_reply = ?, owner_reply_at = NOW(), updated_at = updated_at WHERE id = ?', [reply, reviewId]);
  res.json({ message: 'Reply published' });
});

router.delete('/reviews/:id/reply', async (req, res) => {
  const reviewId = id(req.params.id);
  const result = await query(
    `UPDATE reviews v JOIN restaurants r ON r.id = v.restaurant_id
        SET v.owner_reply = NULL, v.owner_reply_at = NULL, v.updated_at = v.updated_at WHERE v.id = ? AND r.owner_id = ?`,
    [reviewId, req.user.id]
  );
  if (!result.affectedRows) throw notFound('Review');
  res.json({ message: 'Reply removed' });
});

module.exports = router;
