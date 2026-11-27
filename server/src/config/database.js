const { Pool } = require('pg');
const { APP_TIMEZONE } = require('./time');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c timezone=${APP_TIMEZONE}`,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL Database');
});
pool.on('error', (err) => {
  console.error('[db] erro em cliente ocioso do pool', err.message);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
