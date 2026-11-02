const request = require('supertest');
const app = require('../../src/app')();
describe('central error handling', () => {
  it('returns a JSON 400 for a malformed identifier', async () => {
    const response = await request(app).get('/api/resources/abc');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_ID_PARAM');
  });
});
