const request = require('supertest');
const app = require('../../src/app')();
const { pool, resetDatabase, createResource } = require('../helpers/testDb');
describe('reservation concurrency', () => {
  let resource;
  beforeEach(async () => { await resetDatabase(); resource = await createResource(); });
  afterAll(() => pool.end());
  it('allows only one overlapping reservation', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, (_, i) => request(app).post('/api/reservations').send({
      resource_id: resource.id, user_name: `User ${i}`, start_time: '2030-01-10T14:00:00-03:00', end_time: '2030-01-10T15:00:00-03:00',
    })));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(4);
  });
});
