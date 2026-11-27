const path = require('node:path');
const { URL } = require('node:url');

class ConfigError extends Error {
  constructor(problemas) {
    super(
      `Configuração de ambiente inválida (${problemas.length} problema(s)):\n` +
        `${problemas.map((p) => `  - ${p}`).join('\n')}\n\n` +
        'Copie server/.env.example para server/.env e preencha os valores, ou use `docker compose up`.',
    );
    this.name = 'ConfigError';
    this.problemas = problemas;
  }
}

const AMBIENTES = ['development', 'test', 'production'];
const PROTOCOLOS_POSTGRES = ['postgres:', 'postgresql:'];
const PORT_PADRAO = 5000;

const vazio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

function lerInteiro(source, chave, padrao, { min, max }, problemas) {
  if (vazio(source[chave])) return padrao;
  const bruto = String(source[chave]).trim();
  if (!/^-?\d+$/.test(bruto)) {
    problemas.push(`${chave} deve ser um número inteiro, recebido "${bruto}"`);
    return padrao;
  }
  const numero = Number.parseInt(bruto, 10);
  if (numero < min || numero > max) {
    problemas.push(`${chave} deve estar entre ${min} e ${max}, recebido ${numero}`);
    return padrao;
  }
  return numero;
}

function validarDatabaseUrl(source, problemas) {
  if (vazio(source.DATABASE_URL)) {
    problemas.push('DATABASE_URL é obrigatória e não está definida');
    return undefined;
  }
  const valor = String(source.DATABASE_URL).trim();
  let url;
  try {
    url = new URL(valor);
  } catch {
    problemas.push('DATABASE_URL não é uma URL válida. Formato esperado: postgres://usuario:senha@host:porta/banco');
    return undefined;
  }
  if (!PROTOCOLOS_POSTGRES.includes(url.protocol)) {
    problemas.push(`DATABASE_URL deve usar o protocolo postgres:// ou postgresql://, recebido "${url.protocol}//"`);
  } else if (!url.hostname) {
    problemas.push('DATABASE_URL não informa host');
  } else if (!url.pathname || url.pathname === '/') {
    problemas.push('DATABASE_URL não informa o nome do banco (o caminho depois da barra)');
  } else if (url.password.includes('*')) {
    problemas.push('DATABASE_URL contém senha mascarada ("***"). Substitua pelo valor real antes de iniciar o servidor.');
  } else {
    return valor;
  }
  return undefined;
}

function validarOrigens(source, problemas) {
  if (vazio(source.CORS_ALLOWED_ORIGINS)) return [];
  const origens = String(source.CORS_ALLOWED_ORIGINS).split(',').map((o) => o.trim()).filter(Boolean);
  for (const origem of origens) {
    try {
      const { protocol, pathname } = new URL(origem);
      if (protocol !== 'http:' && protocol !== 'https:') throw new Error('protocolo');
      if (pathname !== '/' && pathname !== '') {
        problemas.push(`CORS_ALLOWED_ORIGINS: "${origem}" deve ser apenas a origem (protocolo + host + porta), sem caminho`);
      }
    } catch {
      problemas.push(`CORS_ALLOWED_ORIGINS: "${origem}" não é uma origem válida. Formato esperado: http://localhost:5173`);
    }
  }
  return origens;
}

/** Valida um objeto no formato de process.env. Função pura: não lê nem escreve process.env. */
function parseEnv(source = {}) {
  const problemas = [];

  const nodeEnv = vazio(source.NODE_ENV) ? 'development' : String(source.NODE_ENV).trim();
  if (!AMBIENTES.includes(nodeEnv)) {
    problemas.push(`NODE_ENV deve ser um de ${AMBIENTES.join(', ')}, recebido "${nodeEnv}"`);
  }

  const port = lerInteiro(source, 'PORT', PORT_PADRAO, { min: 1, max: 65535 }, problemas);
  const databaseUrl = validarDatabaseUrl(source, problemas);
  const corsAllowedOrigins = validarOrigens(source, problemas);
  if (nodeEnv === 'production' && corsAllowedOrigins.length === 0) {
    problemas.push('CORS_ALLOWED_ORIGINS é obrigatória quando NODE_ENV=production');
  }
  const rateLimitWindowMs = lerInteiro(source, 'RATE_LIMIT_WINDOW_MS', 60000, { min: 1000, max: 3600000 }, problemas);
  const rateLimitWriteMax = lerInteiro(source, 'RATE_LIMIT_WRITE_MAX', 20, { min: 1, max: 100000 }, problemas);

  if (problemas.length > 0) throw new ConfigError(problemas);

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port,
    databaseUrl,
    corsAllowedOrigins: Object.freeze(corsAllowedOrigins),
    rateLimitWindowMs,
    rateLimitWriteMax,
  });
}

let memo = null;

/** Único ponto que chama dotenv. Variáveis já presentes no ambiente (CI, compose) vencem o .env. */
function getEnv() {
  if (memo) return memo;
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });
  memo = parseEnv(process.env);
  return memo;
}

function resetEnvCache() {
  memo = null;
}

module.exports = { parseEnv, getEnv, resetEnvCache, ConfigError, PORT_PADRAO };
