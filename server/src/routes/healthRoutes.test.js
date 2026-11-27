const request = require('supertest');
jest.mock('../config/database');
const db = require('../config/database');
const createApp = require('../app');
describe('/health', () => {
  it('reports database health', async () => {
    db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
  it('reports degraded database health', async () => {
    db.query.mockRejectedValue({ code: 'ECONNREFUSED' });
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
  });
});
