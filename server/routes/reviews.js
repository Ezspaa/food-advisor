// FR5 — edit/delete own review, plus "helpful" votes and reporting (FR13 input).
const express = require('express');
const { query, one } = require('../db');
const { validate, id } = require('../utils/validate');
const { HttpError, notFound, forbidden } = require('../utils/http-error');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function ownReview(reviewId, user) {
  const review = await one('SELECT * FROM reviews WHERE id = ?', [reviewId]);
  if (!review) throw notFound('Review');
  if (review.user_id !== user.id) throw forbidden('You can only change your own reviews');
  return review;
}

// PUT /api/reviews/:id — the author edits their review
router.put('/:id', requireRole('customer'), async (req, res) => {
  const review = await ownReview(id(req.params.id), req.user);
  const data = validate(req.body, {
    rating: { type: 'int', required: true, min: 1, max: 5 },
    title: { type: 'string', required: true, min: 3, max: 100 },
    comment: { type: 'string', required: true, min: 10, max: 2000, label: 'Review' },
    visit_date: { type: 'date', notFuture: true, label: 'Visit date' },
  });
  await query(
    'UPDATE reviews SET rating = ?, title = ?, comment = ?, visit_date = ? WHERE id = ?',
    [data.rating, data.title, data.comment, data.visit_date, review.id]
  );
  res.json({ message: 'Your review has been updated' });
});

// DELETE /api/reviews/:id — the author deletes their review
router.delete('/:id', requireAuth, async (req, res) => {
  const review = await ownReview(id(req.params.id), req.user);
  await query('DELETE FROM reviews WHERE id = ?', [review.id]);
  res.json({ message: 'Your review has been deleted' });
});

// POST /api/reviews/:id/helpful — toggle a "helpful" vote
router.post('/:id/helpful', requireAuth, async (req, res) => {
  const reviewId = id(req.params.id);
  const review = await one("SELECT id, user_id FROM reviews WHERE id = ? AND status = 'visible'", [reviewId]);
  if (!review) throw notFound('Review');
  if (review.user_id === req.user.id) throw new HttpError(400, "You can't vote for your own review");

  const existing = await one('SELECT 1 AS yes FROM review_votes WHERE review_id = ? AND user_id = ?', [reviewId, req.user.id]);
  if (existing) await query('DELETE FROM review_votes WHERE review_id = ? AND user_id = ?', [reviewId, req.user.id]);
  else await query('INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)', [reviewId, req.user.id]);
  const { count } = await one('SELECT COUNT(*) AS count FROM review_votes WHERE review_id = ?', [reviewId]);
  res.json({ voted: !existing, helpful_count: count });
});

// POST /api/reviews/:id/report — flag inappropriate content for the admins
router.post('/:id/report', requireAuth, async (req, res) => {
  const reviewId = id(req.params.id);
  const review = await one('SELECT id, user_id FROM reviews WHERE id = ?', [reviewId]);
  if (!review) throw notFound('Review');
  if (review.user_id === req.user.id) throw new HttpError(400, "You can't report your own review");
  const data = validate(req.body, {
    reason: { type: 'enum', required: true, values: ['spam', 'offensive', 'fake', 'off-topic', 'other'] },
    details: { type: 'string', max: 300 },
  });
  const existing = await one('SELECT id FROM review_reports WHERE review_id = ? AND reporter_id = ?', [reviewId, req.user.id]);
  if (existing) throw new HttpError(409, 'You have already reported this review');
  await query(
    'INSERT INTO review_reports (review_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)',
    [reviewId, req.user.id, data.reason, data.details]
  );
  res.status(201).json({ message: 'Thanks — an administrator will look at this review' });
});

module.exports = router;
