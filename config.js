// Central configuration. Values come from environment variables (loaded from
// .env by Node's built-in --env-file-if-exists flag), with local defaults.
module.exports = {
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'food_advisor',
  },
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
};
