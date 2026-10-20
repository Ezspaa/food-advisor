// FR2 — Search & filter, FR3 — Restaurant details & dishes,
// FR4 — Submit a review (POST /:id/reviews).
const express = require('express');
const { query, one } = require('../db');
const { validate, id } = require('../utils/validate');
const { HttpError, notFound } = require('../utils/http-error');
const { requireRole } = require('../middleware/auth');
const { RESTAURANT_COLUMNS, RESTAURANT_FROM, IS_OPEN, likeTerm, paging } = require('../utils/sql');

const router = express.Router();

// Whitelisted ORDER BY clauses: the client sends a key, never raw SQL.
const SORTS = {
  recommended: 'r.is_featured DESC, avg_rating DESC, review_count DESC, r.name',
  rating: 'avg_rating DESC, review_count DESC, r.name',
  reviews: 'review_count DESC, avg_rating DESC, r.name',
  price_asc: 'r.price_level ASC, avg_rating DESC, r.name',
  price_desc: 'r.price_level DESC, avg_rating DESC, r.name',
  name: 'r.name ASC',
  newest: 'r.created_at DESC, r.id DESC',
};

/**
 * GET /api/restaurants
 *   ?q=        free text: name, cuisine, city, address or a dish on the menu
 *   ?cuisine=  cuisine id         ?city=      city name
 *   ?minRating=4                  ?price=1,2  price levels
 *   ?openNow=1 ?featured=1        ?ids=1,2,3  (for favourites / recently viewed)
 *   ?sort=     one of SORTS       ?page= & ?limit=
 */
router.get('/', async (req, res) => {
  const q = req.query;
  const where = ["r.status = 'approved'"];
  const params = [];

  if (q.q && String(q.q).trim()) {
    const term = likeTerm(String(q.q).trim().slice(0, 80));
    where.push(`(r.name LIKE ? OR c.name LIKE ? OR r.city LIKE ? OR r.address LIKE ? OR r.description LIKE ?
                 OR EXISTS (SELECT 1 FROM dishes d WHERE d.restaurant_id = r.id AND d.name LIKE ?))`);
    params.push(term, term, term, term, term, term);
  }
  if (q.cuisine) {
    where.push('r.cuisine_id = ?');
    params.push(id(q.cuisine, 'cuisine'));
  }
  if (q.city) {
    where.push('r.city = ?');
    params.push(String(q.city).slice(0, 60));
  }
  const minRating = Number(q.minRating);
  if (minRating > 0 && minRating <= 5) {
    where.push('COALESCE(st.avg_rating, 0) >= ?');
    params.push(minRating);
  }
  const prices = String(q.price || '').split(',').map(Number).filter((n) => [1, 2, 3, 4].includes(n));
  if (prices.length) {
    where.push(`r.price_level IN (${prices.map(() => '?').join(',')})`);
    params.push(...prices);
  }
  if (q.featured === '1') where.push('r.is_featured = 1');
  if (q.ids !== undefined) {
    const ids = String(q.ids).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
    if (!ids.length) return res.json({ items: [], total: 0, page: 1, pages: 0 });
    where.push(`r.id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const having = q.openNow === '1' ? 'HAVING is_open = 1' : '';
  const order = SORTS[q.sort] || SORTS.recommended;
  const { limit, page, offset } = paging(q);

  const items = await query(
    `SELECT ${RESTAURANT_COLUMNS} ${RESTAURANT_FROM} ${whereSql} ${having} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM (SELECT r.id, (${IS_OPEN}) AS is_open ${RESTAURANT_FROM} ${whereSql} ${having}) t`,
    params
  );
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

/** GET /api/restaurants/suggest?q= — live autocomplete for the search box */
router.get('/suggest', async (req, res) => {
  const text = String(req.query.q || '').trim().slice(0, 60);
  if (text.length < 2) return res.json({ restaurants: [], cuisines: [], dishes: [] });
  const term = likeTerm(text);
  const [restaurants, cuisines, dishes] = await Promise.all([
    query(
      `SELECT r.id, r.name, r.city, c.name AS cuisine FROM restaurants r JOIN cuisines c ON c.id = r.cuisine_id
        WHERE r.status = 'approved' AND (r.name LIKE ? OR r.city LIKE ?) ORDER BY r.name LIMIT 5`,
      [term, term]
    ),
    query('SELECT id, name, emoji FROM cuisines WHERE name LIKE ? ORDER BY name LIMIT 3', [term]),
    query(
      `SELECT d.id, d.name, r.id AS restaurant_id, r.name AS restaurant FROM dishes d
         JOIN restaurants r ON r.id = d.restaurant_id
        WHERE r.status = 'approved' AND d.name LIKE ? ORDER BY d.name LIMIT 4`,
      [term]
    ),
  ]);
  res.json({ restaurants, cuisines, dishes });
});

/** GET /api/restaurants/:id — full details, menu and rating breakdown */
router.get('/:id', async (req, res) => {
  const restaurantId = id(req.params.id);
  const restaurant = await one(
    `SELECT ${RESTAURANT_COLUMNS}, u.name AS owner_name ${RESTAURANT_FROM}
       LEFT JOIN users u ON u.id = r.owner_id
      WHERE r.id = ?`,
    [restaurantId]
  );
  if (!restaurant) throw notFound('Restaurant');

  // unapproved restaurants are visible only to their owner and admins
  const user = req.user;
  const canPreview = user && (user.role === 'admin' || user.id === restaurant.owner_id);
  if (restaurant.status !== 'approved' && !canPreview) throw notFound('Restaurant');

  const [dishes, distribution, fav, myReview] = await Promise.all([
    query(
      `SELECT id, name, description, category, price, image_url, is_vegetarian, is_spicy, is_available,
              weight_g, calories, protein_g, fat_g, carbs_g, allergens, recommended_for
         FROM dishes WHERE restaurant_id = ?
        ORDER BY FIELD(category, 'Starters','Mains','Sides','Desserts','Drinks'), name`,
      [restaurantId]
    ),
    query(
      `SELECT rating, COUNT(*) AS count FROM reviews
        WHERE restaurant_id = ? AND status = 'visible' GROUP BY rating`,
      [restaurantId]
    ),
    user ? one('SELECT 1 AS yes FROM favorites WHERE user_id = ? AND restaurant_id = ?', [user.id, restaurantId]) : null,
    user ? one('SELECT id FROM reviews WHERE user_id = ? AND restaurant_id = ?', [user.id, restaurantId]) : null,
  ]);

  const ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  distribution.forEach((d) => { ratings[d.rating] = d.count; });

  res.json({
    restaurant: { ...restaurant, is_favorite: !!fav, my_review_id: myReview ? myReview.id : null },
    dishes,
    ratings,
    can_manage: !!canPreview,
  });
});

/** GET /api/restaurants/:id/reviews?sort=newest|highest|lowest|helpful */
router.get('/:id/reviews', async (req, res) => {
  const restaurantId = id(req.params.id);
  const sorts = {
    newest: 'rv.created_at DESC',
    highest: 'rv.rating DESC, rv.created_at DESC',
    lowest: 'rv.rating ASC, rv.created_at DESC',
    helpful: 'helpful_count DESC, rv.created_at DESC',
  };
  const order = sorts[req.query.sort] || sorts.newest;
  const viewerId = req.user ? req.user.id : 0;
  const rating = Number(req.query.rating);
  const ratingSql = rating >= 1 && rating <= 5 ? 'AND rv.rating = ?' : '';
  const params = [viewerId, restaurantId];
  if (ratingSql) params.push(rating);

  const reviews = await query(
    `SELECT rv.id, rv.rating, rv.title, rv.comment, rv.visit_date, rv.owner_reply, rv.owner_reply_at,
            rv.created_at, rv.updated_at, rv.user_id,
            u.name AS author, u.avatar_url AS author_avatar, u.city AS author_city,
            (SELECT COUNT(*) FROM reviews x WHERE x.user_id = u.id AND x.status = 'visible') AS author_reviews,
            (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = rv.id) AS helpful_count,
            EXISTS (SELECT 1 FROM review_votes v WHERE v.review_id = rv.id AND v.user_id = ?) AS voted
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
      WHERE rv.restaurant_id = ? AND rv.status = 'visible' ${ratingSql}
      ORDER BY ${order}`,
    params
  );
  res.json({ items: reviews });
});

/** POST /api/restaurants/:id/reviews — FR4 (customers only, one per restaurant) */
router.post('/:id/reviews', requireRole('customer'), async (req, res) => {
  const restaurantId = id(req.params.id);
  const restaurant = await one("SELECT id FROM restaurants WHERE id = ? AND status = 'approved'", [restaurantId]);
  if (!restaurant) throw notFound('Restaurant');

  const data = validate(req.body, {
    rating: { type: 'int', required: true, min: 1, max: 5 },
    title: { type: 'string', required: true, min: 3, max: 100 },
    comment: { type: 'string', required: true, min: 10, max: 2000, label: 'Review' },
    visit_date: { type: 'date', notFuture: true, label: 'Visit date' },
  });
  if (await one('SELECT id FROM reviews WHERE restaurant_id = ? AND user_id = ?', [restaurantId, req.user.id])) {
    throw new HttpError(409, 'You have already reviewed this restaurant — you can edit your review instead');
  }
  const result = await query(
    'INSERT INTO reviews (restaurant_id, user_id, rating, title, comment, visit_date) VALUES (?, ?, ?, ?, ?, ?)',
    [restaurantId, req.user.id, data.rating, data.title, data.comment, data.visit_date]
  );
  res.status(201).json({ id: result.insertId, message: 'Thank you! Your review has been published.' });
});

module.exports = router;
