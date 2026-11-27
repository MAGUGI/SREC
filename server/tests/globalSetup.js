const path = require('path');
const { execFileSync } = require('child_process');
const { setTimeout: sleep } = require('timers/promises');
const { Client } = require('pg');

require('./setupEnv');

const SERVER_DIR = path.join(__dirname, '..');
const MAX_ATTEMPTS = 30;

async function waitForDatabase(url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (err) {
      await client.end().catch(() => {});
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`[test] banco de teste inacessível em ${url}: ${err.message}. Rode "npm run db:test:up".`, { cause: err });
      }
      await sleep(1000);
    }
  }
}

// Monta o schema pelo mesmo caminho do sistema real: as migrations versionadas
// (a 0000 cria as tabelas; as seguintes aplicam as constraints). Nenhum arquivo
// de teste cria tabela.
const prepareSchema = () => {
  execFileSync(process.execPath, ['scripts/migrate.js'], { cwd: SERVER_DIR, env: { ...process.env }, stdio: 'pipe' });
};

module.exports = async () => {
  await waitForDatabase(process.env.DATABASE_URL);
  // Com API_BASE_URL a suíte roda contra um servidor externo (ex.: o código
  // recebido, para registrar a linha de base vermelha). O schema é dele.
  if (!process.env.API_BASE_URL) prepareSchema();
};
