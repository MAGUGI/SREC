const { Client } = require('pg');

require('./setupEnv');

// Derruba o schema de teste ao fim, para a próxima execução provar de novo que
// initDb + migrations sobem um banco vazio. KEEP_TEST_DB=1 preserva os dados
// para investigar uma falha com psql.
module.exports = async () => {
  if (process.env.KEEP_TEST_DB === '1' || process.env.API_BASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP TABLE IF EXISTS reservations, resources, schema_migrations CASCADE');
  } finally {
    await client.end();
  }
};
