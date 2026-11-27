const { getEnv, ConfigError } = require('./config/env');

// Falha rápida: configuração inválida impede o boot e nomeia cada variável errada.
let env;
try {
  env = getEnv();
} catch (err) {
  if (!(err instanceof ConfigError) || require.main !== module) throw err;
  console.error(`\n[boot] ${err.message}\n`);
  process.exit(1);
}

const { APP_TIMEZONE } = require('./config/time');
process.env.TZ = process.env.TZ || APP_TIMEZONE;
const createApp = require('./app');
const { pool } = require('./config/database');

const PORT = env.port;
const app = createApp();

async function startServer() {
  const server = app.listen(PORT, () => console.log(`[boot] SREC ouvindo na porta ${PORT}`));
  const shutdown = () => server.close(() => pool.end(() => process.exit(0)));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}

if (require.main === module) {
  startServer().catch(async (err) => {
    console.error('[boot] falha ao iniciar; abortando', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}

module.exports = app;
