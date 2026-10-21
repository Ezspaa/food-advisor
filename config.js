// Central configuration. Values come from environment variables (loaded from
// .env by Node's built-in --env-file-if-exists flag), with local defaults.
//
// Cloud hosting: a single connection URL is also accepted, e.g.
//   DATABASE_URL=mysql://user:password@host:3306/food_advisor
// (Railway provides it as MYSQL_URL). Set DB_SSL=true for managed MySQL
// services that require TLS.
function fromUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || undefined,
    };
  } catch (e) {
    return {};
  }
}

const url = fromUrl(process.env.DATABASE_URL || process.env.MYSQL_URL || '');
const env = process.env;

module.exports = {
  port: Number(env.PORT) || 3000,
  db: {
    host: env.DB_HOST || url.host || env.MYSQLHOST || 'localhost',
    port: Number(env.DB_PORT) || url.port || Number(env.MYSQLPORT) || 3306,
    user: env.DB_USER || url.user || env.MYSQLUSER || 'root',
    password: env.DB_PASSWORD ?? url.password ?? env.MYSQLPASSWORD ?? '',
    database: env.DB_NAME || url.database || env.MYSQLDATABASE || 'food_advisor',
    ...(env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: env.DB_SSL_STRICT !== 'false' } } : {}),
  },
  sessionDays: Number(env.SESSION_DAYS) || 7,
  // number of proxies in front of the app (1 on Railway/Render), or "loopback" locally
  trustProxy: env.TRUST_PROXY ? (Number.isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY)) : 'loopback',
  // password of the sample accounts — CHANGE it on a public server
  demoPassword: env.DEMO_PASSWORD || 'Password123',
};
