// Site feedback from testers and visitors (floating "Feedback" button).
// Anyone can send feedback (logged in or not); admins read it in the admin panel.
const express = require('express');
const { query } = require('../db');
const { validate } = require('../utils/validate');
const { rateLimit } = require('../middleware/security');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, countAll: true, message: 'Thanks! You have sent a lot of feedback already — please try again later.' });

// POST /api/feedback
router.post('/', limiter, async (req, res) => {
  const d = validate(req.body, {
    rating: { type: 'int', required: true, min: 1, max: 5 },
    category: { type: 'enum', required: true, values: ['design', 'usability', 'bug', 'idea', 'other'] },
    message: { type: 'string', required: true, min: 5, max: 1000 },
    email: { type: 'email' },
    page: { type: 'string', max: 200 },
    device: { type: 'enum', values: ['mobile', 'tablet', 'desktop'] },
  });
  await query(
    'INSERT INTO feedback (user_id, rating, category, message, email, page, device) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user ? req.user.id : null, d.rating, d.category, d.message, d.email, d.page, d.device]
  );
  res.status(201).json({ message: 'Thank you! Your feedback helps us improve Food Advisor.' });
});

module.exports = router;
