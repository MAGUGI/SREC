const request = require('supertest');
jest.mock('./config/database');
const db = require('./config/database');
const createApp = require('./app');
describe('HTTP surface', () => {
  beforeEach(() => { jest.clearAllMocks(); db.query.mockResolvedValue({ rows: [] }); });
  it('sends security headers', async () => {
    const response = await request(createApp()).get('/api/resources');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('returns a JSON not found response', async () => {
    const response = await request(createApp()).get('/missing');
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('code');
  });
  it('returns JSON status on GET /', async () => {
    const response = await request(createApp()).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'SREC Coworking API', status: 'running', health: '/health' });
  });
  it('returns 400 INVALID_JSON on malformed JSON payload (PR #60)', async () => {
    const response = await request(createApp())
      .post('/api/resources')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'INVALID_JSON' });
  });
});
