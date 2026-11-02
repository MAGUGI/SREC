const request = require('supertest');
const app = require('../../src/app')();
const { pool, resetDatabase, createResource } = require('../helpers/testDb');
describe('reservation status', () => {
  let reservation;
  beforeEach(async () => {
    await resetDatabase();
    const resource = await createResource();
    reservation = (await pool.query('INSERT INTO reservations (resource_id,user_name,start_time,end_time) VALUES ($1,$2,$3,$4) RETURNING *', [resource.id, 'A', '2030-01-10T14:00:00-03:00', '2030-01-10T15:00:00-03:00'])).rows[0];
  });
  afterAll(() => pool.end());
  it('rejects an unknown status', async () => {
    const response = await request(app).patch(`/api/reservations/${reservation.id}/status`).send({ status: 'banana' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_RESERVATION_STATUS');
  });
});
