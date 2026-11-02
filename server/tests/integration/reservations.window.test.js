const request = require('supertest');
const app = require('../../src/app')();
const { pool, resetDatabase, createResource } = require('../helpers/testDb');
describe('reservation window', () => {
  let resource;
  beforeEach(async () => { await resetDatabase(); resource = await createResource(); });
  afterAll(() => pool.end());
  it('rejects an inverted interval', async () => {
    const response = await request(app).post('/api/reservations').send({ resource_id: resource.id, user_name: 'A', start_time: '2030-01-10T16:00:00-03:00', end_time: '2030-01-10T15:00:00-03:00' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('END_BEFORE_START');
  });
});
