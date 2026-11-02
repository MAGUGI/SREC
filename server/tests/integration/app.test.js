const express = require('express');
const request = require('supertest');
const { api, pool, resetDatabase } = require('../helpers/api');

// A-08 monta o middleware em memória: contra servidor externo não se aplica.
const inProcess = process.env.API_BASE_URL ? it.skip : it;

describe('contrato geral da API', () => {
  beforeEach(resetDatabase);
  afterAll(() => pool.end());

  it('A-01 GET / → 200 em JSON', async () => {
    const response = await api().get('/');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'running' });
  });

  it('A-02 rota desconhecida → 404 em JSON, não em HTML (BE-04)', async () => {
    const response = await api().get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({ code: 'ROUTE_NOT_FOUND' });
  });

  // BE-10 (#49): o erro do express.json() não tem `code`; o errorHandler
  // agora o reconhece pelo `type` do body-parser.
  it('A-03 JSON malformado → 400 INVALID_JSON, não 500 (BE-04, #49)', async () => {
    const response = await api().post('/api/resources').set('Content-Type', 'application/json').send('{"name": "Sala",');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({ code: 'INVALID_JSON' });
  });

  it('A-03b corpo acima de 100kb → 413 PAYLOAD_TOO_LARGE, não 500 (BE-08, #49)', async () => {
    const response = await api().post('/api/resources').send({ name: 'x'.repeat(200 * 1024), type: 'workstation' });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it.each([
    ['GET', '/api/resources/abc'],
    ['GET', '/api/reservations/999999'],
    ['POST', '/api/reservations'],
    ['PUT', '/api/resources/1'],
    ['DELETE', '/api/nope'],
  ])('A-04 envelope de erro uniforme em %s %s: { error, code } e nada de stack', async (method, path) => {
    const response = await api()[method.toLowerCase()](path).send({});

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(typeof response.body.error).toBe('string');
    expect(typeof response.body.code).toBe('string');
    expect(JSON.stringify(response.body)).not.toMatch(/at .*\.js|node_modules|reservations_|SELECT /);
  });

  it('A-05 GET /health → 200 com banco de pé (BUG-11)', async () => {
    const response = await api().get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('A-06 cabeçalhos de segurança e sem X-Powered-By (BE-08)', async () => {
    const response = await api().get('/api/resources');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
  });

  it('A-07 CORS recusa origem desconhecida com 403 e aceita a do client (BE-08)', async () => {
    const evil = await api().get('/api/resources').set('Origin', 'https://exemplo-malicioso.test');
    const client = await api().get('/api/resources').set('Origin', 'http://localhost:5173');

    expect(evil.status).toBe(403);
    expect(evil.body).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    expect(client.status).toBe(200);
    expect(client.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  // O limiter lê RATE_LIMIT_WRITE_MAX na carga do módulo, e a suíte sobe esse
  // valor para não tropeçar nele. Aqui o módulo real é recarregado isolado com
  // limite 3, para provar o 429 sem esperar 20 requisições.
  inProcess('A-08 escrita acima do limite → 429 e leitura não é limitada (BE-08)', async () => {
    const previous = process.env.RATE_LIMIT_WRITE_MAX;
    process.env.RATE_LIMIT_WRITE_MAX = '3';
    let writeLimiter;
    jest.isolateModules(() => {
      ({ writeLimiter } = require('../../src/middlewares/rateLimit'));
    });
    process.env.RATE_LIMIT_WRITE_MAX = previous;

    const app = express();
    app.use(writeLimiter);
    app.all('/', (req, res) => res.json({ ok: true }));

    const writes = [];
    for (let i = 0; i < 5; i += 1) writes.push((await request(app).post('/')).status);
    const reads = [];
    for (let i = 0; i < 5; i += 1) reads.push((await request(app).get('/')).status);

    expect(writes).toEqual([200, 200, 200, 429, 429]);
    expect(reads).toEqual([200, 200, 200, 200, 200]);
  });
});
