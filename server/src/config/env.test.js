const { parseEnv, ConfigError, PORT_PADRAO } = require('./env');

const BASE = { NODE_ENV: 'test', DATABASE_URL: 'postgres://srec:srec@localhost:5432/srec_test' };

describe('parseEnv', () => {
  it('aceita a configuração mínima e aplica os defaults', () => {
    const env = parseEnv(BASE);
    expect(env).toMatchObject({ port: PORT_PADRAO, nodeEnv: 'test', isTest: true, isProduction: false, rateLimitWindowMs: 60000, rateLimitWriteMax: 20 });
    expect(env.corsAllowedOrigins).toEqual([]);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('usa development quando NODE_ENV não é informado', () => {
    expect(parseEnv({ DATABASE_URL: BASE.DATABASE_URL }).nodeEnv).toBe('development');
  });

  it('aceita postgresql:// e converte PORT para número', () => {
    const env = parseEnv({ ...BASE, DATABASE_URL: 'postgresql://u:p@h:5432/d', PORT: '8080' });
    expect(env.databaseUrl).toBe('postgresql://u:p@h:5432/d');
    expect(env.port).toBe(8080);
  });

  it('divide CORS_ALLOWED_ORIGINS por vírgula e remove espaços', () => {
    const env = parseEnv({ ...BASE, CORS_ALLOWED_ORIGINS: 'http://localhost:5173 , https://srec.app' });
    expect(env.corsAllowedOrigins).toEqual(['http://localhost:5173', 'https://srec.app']);
  });

  describe('DATABASE_URL', () => {
    it.each([
      ['ausente', undefined, /DATABASE_URL é obrigatória/],
      ['vazia', '   ', /DATABASE_URL é obrigatória/],
      ['não é URL', 'isso-nao-e-uma-url', /não é uma URL válida/],
      ['protocolo errado', 'mysql://u:p@h:3306/d', /protocolo postgres/],
      ['sem nome de banco', 'postgres://u:p@h:5432', /nome do banco/],
      ['senha mascarada do .env.example original', 'postgres://postgres:***@localhost:5432/srec', /senha mascarada/],
    ])('falha quando %s', (_caso, valor, mensagem) => {
      expect(() => parseEnv({ ...BASE, DATABASE_URL: valor })).toThrow(ConfigError);
      expect(() => parseEnv({ ...BASE, DATABASE_URL: valor })).toThrow(mensagem);
    });
  });

  it('valida PORT', () => {
    expect(() => parseEnv({ ...BASE, PORT: 'abc' })).toThrow(/número inteiro/);
    expect(() => parseEnv({ ...BASE, PORT: '70000' })).toThrow(/entre 1 e 65535/);
    expect(() => parseEnv({ ...BASE, PORT: '0' })).toThrow(/entre 1 e 65535/);
  });

  it('valida NODE_ENV', () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV deve ser/);
  });

  it('valida CORS_ALLOWED_ORIGINS', () => {
    expect(() => parseEnv({ ...BASE, CORS_ALLOWED_ORIGINS: 'localhost:5173' })).toThrow(/não é uma origem válida/);
    expect(() => parseEnv({ ...BASE, CORS_ALLOWED_ORIGINS: 'http://localhost:5173/api' })).toThrow(/sem caminho/);
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/obrigatória quando NODE_ENV=production/);
  });

  it('valida os limites de rate limit', () => {
    expect(() => parseEnv({ ...BASE, RATE_LIMIT_WINDOW_MS: '10' })).toThrow(/RATE_LIMIT_WINDOW_MS deve estar entre/);
    expect(() => parseEnv({ ...BASE, RATE_LIMIT_WRITE_MAX: 'x' })).toThrow(/RATE_LIMIT_WRITE_MAX deve ser um número inteiro/);
  });

  it('reporta todos os problemas, não só o primeiro', () => {
    let erro;
    try {
      parseEnv({ NODE_ENV: 'staging', PORT: 'abc' });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ConfigError);
    expect(erro.problemas).toHaveLength(3);
    expect(erro.message).toMatch(/3 problema\(s\)/);
  });
});
