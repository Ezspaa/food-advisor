// FR2/FR3 — search dishes across all approved restaurants.
const express = require('express');
const { query } = require('../db');
const { id } = require('../utils/validate');
const { likeTerm, paging } = require('../utils/sql');

const router = express.Router();

const SORTS = {
  recommended: 'avg_rating DESC, d.name',
  price_asc: 'd.price ASC, d.name',
  price_desc: 'd.price DESC, d.name',
  name: 'd.name ASC',
  rating: 'avg_rating DESC, d.name',
};

/**
 * GET /api/dishes?q=&cuisine=&city=&vegetarian=1&spicy=1&maxPrice=&category=&sort=&page=
 */
router.get('/', async (req, res) => {
  const q = req.query;
  const where = ["r.status = 'approved'", 'd.is_available = 1'];
  const params = [];

  if (q.q && String(q.q).trim()) {
    const term = likeTerm(String(q.q).trim().slice(0, 80));
    where.push('(d.name LIKE ? OR d.description LIKE ? OR r.name LIKE ? OR c.name LIKE ?)');
    params.push(term, term, term, term);
  }
  if (q.cuisine) { where.push('r.cuisine_id = ?'); params.push(id(q.cuisine, 'cuisine')); }
  if (q.city) { where.push('r.city = ?'); params.push(String(q.city).slice(0, 60)); }
  if (q.vegetarian === '1') where.push('d.is_vegetarian = 1');
  if (q.spicy === '1') where.push('d.is_spicy = 1');
  if (['Starters', 'Mains', 'Sides', 'Desserts', 'Drinks'].includes(q.category)) {
    where.push('d.category = ?'); params.push(q.category);
  }
  const maxPrice = Number(q.maxPrice);
  if (maxPrice > 0) { where.push('d.price <= ?'); params.push(maxPrice); }
  const minRating = Number(q.minRating);
  if (minRating > 0 && minRating <= 5) { where.push('COALESCE(st.avg_rating, 0) >= ?'); params.push(minRating); }

  const from = `
    FROM dishes d
    JOIN restaurants r ON r.id = d.restaurant_id
    JOIN cuisines c ON c.id = r.cuisine_id
    LEFT JOIN (SELECT restaurant_id, ROUND(AVG(rating), 1) AS avg_rating FROM reviews
                WHERE status = 'visible' GROUP BY restaurant_id) st ON st.restaurant_id = r.id
    WHERE ${where.join(' AND ')}`;
  const { limit, page, offset } = paging(q, 12);
  const order = SORTS[q.sort] || SORTS.recommended;

  const items = await query(
    `SELECT d.id, d.name, d.description, d.category, d.price, d.image_url, d.is_vegetarian, d.is_spicy,
            r.id AS restaurant_id, r.name AS restaurant, r.city, r.image_url AS restaurant_image,
            c.name AS cuisine, c.emoji AS cuisine_emoji, COALESCE(st.avg_rating, 0) AS avg_rating
     ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${from}`, params);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

module.exports = router;
