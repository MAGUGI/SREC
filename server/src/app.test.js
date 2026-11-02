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
});
