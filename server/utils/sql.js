// Shared SQL fragments so every page computes ratings and "open now" the same way.

// Average rating + number of visible reviews per restaurant.
const RATING_STATS = `
  LEFT JOIN (
    SELECT restaurant_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS review_count
      FROM reviews WHERE status = 'visible' GROUP BY restaurant_id
  ) st ON st.restaurant_id = r.id`;

// 1 when the current server time is inside opening hours (handles past-midnight).
const IS_OPEN = `
  CASE
    WHEN r.opens_at IS NULL OR r.closes_at IS NULL THEN 0
    WHEN r.opens_at < r.closes_at THEN CURTIME() >= r.opens_at AND CURTIME() < r.closes_at
    ELSE CURTIME() >= r.opens_at OR CURTIME() < r.closes_at
  END`;

const RESTAURANT_COLUMNS = `
  r.id, r.name, r.description, r.city, r.address, r.phone, r.website, r.price_level,
  TIME_FORMAT(r.opens_at, '%H:%i') AS opens_at, TIME_FORMAT(r.closes_at, '%H:%i') AS closes_at,
  r.image_url, r.status, r.is_featured, r.owner_id, r.created_at, r.updated_at,
  c.id AS cuisine_id, c.name AS cuisine, c.emoji AS cuisine_emoji,
  COALESCE(st.avg_rating, 0) AS avg_rating, COALESCE(st.review_count, 0) AS review_count,
  (${IS_OPEN}) AS is_open`;

const RESTAURANT_FROM = `
  FROM restaurants r
  JOIN cuisines c ON c.id = r.cuisine_id
  ${RATING_STATS}`;

/** Escape % and _ so user text is matched literally inside LIKE patterns. */
const likeTerm = (s) => `%${String(s).replace(/[\\%_]/g, (ch) => '\\' + ch)}%`;

/** Read ?page & ?limit safely. */
function paging(q, defLimit = 12, maxLimit = 50) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || defLimit, 1), maxLimit);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}

module.exports = { RATING_STATS, IS_OPEN, RESTAURANT_COLUMNS, RESTAURANT_FROM, likeTerm, paging };
