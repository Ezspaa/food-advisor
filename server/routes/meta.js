// Lookup data for filters and the home page.
const express = require('express');
const { query } = require('../db');

const router = express.Router();

// GET /api/meta — cuisines (with counts), cities and headline numbers
router.get('/', async (req, res) => {
  const [cuisines, cities, [stats]] = await Promise.all([
    query(
      `SELECT c.id, c.name, c.emoji, COUNT(r.id) AS restaurant_count
         FROM cuisines c
         LEFT JOIN restaurants r ON r.cuisine_id = c.id AND r.status = 'approved'
        GROUP BY c.id ORDER BY c.name`
    ),
    query(
      `SELECT city, COUNT(*) AS restaurant_count FROM restaurants
        WHERE status = 'approved' GROUP BY city ORDER BY restaurant_count DESC, city`
    ),
    query(
      `SELECT (SELECT COUNT(*) FROM restaurants WHERE status = 'approved') AS restaurants,
              (SELECT COUNT(*) FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id WHERE r.status = 'approved') AS dishes,
              (SELECT COUNT(*) FROM reviews WHERE status = 'visible') AS reviews,
              (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers`
    ),
  ]);
  res.json({ cuisines, cities, stats });
});

module.exports = router;
