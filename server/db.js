// MySQL connection pool. All queries use `?` placeholders, so user input is
// always escaped by the driver and never concatenated into SQL (NFR Security).
const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,      // DATETIME -> 'YYYY-MM-DD HH:MM:SS' strings in JSON
  decimalNumbers: true,   // DECIMAL -> JS numbers
  charset: 'utf8mb4',
});

/** Run a query and return only the rows (or the OkPacket for writes). */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Return the first row of a query or null. */
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = { pool, query, one };
