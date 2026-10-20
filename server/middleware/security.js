// Security headers and a tiny in-memory rate limiter (no external packages).

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  next();
}

/**
 * Slow down password guessing: after `max` FAILED attempts (4xx responses) from
 * one IP address inside `windowMs`, further requests get 429 until the window ends.
 * Successful logins do not count.
 */
function rateLimit({ windowMs, max, message }) {
  const failures = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let entry = failures.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
      failures.set(key, entry);
    }
    if (entry.count >= max) {
      res.set('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: message || 'Too many attempts, please try again later' });
    }
    res.on('finish', () => { if (res.statusCode >= 400) entry.count += 1; });
    next();
  };
}

module.exports = { securityHeaders, rateLimit };
