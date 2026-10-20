// =====================================================================
//  Food Advisor — Node.js / Express server
//  Serves the static front-end (public/) and a JSON REST API (/api/*).
// =====================================================================
const path = require('path');
const express = require('express');
const config = require('./config');
const { pool } = require('./server/db');
const { loadUser } = require('./server/middleware/auth');
const { securityHeaders } = require('./server/middleware/security');

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '100kb' }));

// ---------- API ----------
const api = express.Router();
api.use(loadUser); // attaches req.user when a valid token is sent
api.use('/auth', require('./server/routes/auth'));
api.use('/meta', require('./server/routes/meta'));
api.use('/restaurants', require('./server/routes/restaurants'));
api.use('/dishes', require('./server/routes/dishes'));
api.use('/reviews', require('./server/routes/reviews'));
api.use('/me', require('./server/routes/me'));
api.use('/owner', require('./server/routes/owner'));
api.use('/admin', require('./server/routes/admin'));
api.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', time: new Date().toISOString() });
});
api.use((req, res) => res.status(404).json({ error: 'API endpoint not found' }));
app.use('/api', api);

// ---------- Front-end ----------
// `extensions` lets /restaurant?id=3 serve public/restaurant.html
// `no-cache` = always revalidate with the ETag, so edits show up immediately
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
}));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// ---------- Errors ----------
// Every thrown error (including async ones — Express 5 forwards them) ends here.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This record already exists' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(422).json({ error: 'A referenced record does not exist' });
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`, err);
  const dbDown = ['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(err.code);
  res.status(dbDown ? 503 : 500).json({
    error: dbDown ? 'The database is not available. Is MySQL running and has `npm run db:setup` been run?' : 'Something went wrong on our side',
  });
});

app.listen(config.port, async () => {
  console.log(`\n  🍽️  Food Advisor running at http://localhost:${config.port}\n`);
  try {
    await pool.query('SELECT 1 FROM users LIMIT 1');
    console.log(`  ✅ Connected to MySQL database "${config.db.database}"\n`);
  } catch (err) {
    console.warn(`  ⚠️  Database problem: ${err.message}\n     Run "npm run db:setup" (see README.md).\n`);
  }
});
