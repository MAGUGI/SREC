const fs = require('fs');
const path = require('path');
const { getEnv } = require('../src/config/env');

getEnv();
const { pool } = require('../src/config/database');

const directory = path.join(__dirname, '..', 'migrations');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const applied = new Set((await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));
    const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql') && !file.includes('_rollback')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(directory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`[migrate] falhou em ${file}: ${err.message}`, { cause: err });
      }
    }
    console.log(`[migrate] ${files.length} migração(ões) no diretório.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
