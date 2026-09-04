const db = require('../config/database');

const ReservationModel = {
  async create(resource_id, user_name, start_time, end_time) {
    const query = `
      INSERT INTO reservations (resource_id, user_name, start_time, end_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await db.query(query, [resource_id, user_name, start_time, end_time]);
    return result.rows[0];
  },

  async findAll() {
    const query = 'SELECT * FROM reservations ORDER BY start_time ASC';
    const result = await db.query(query);
    return result.rows;
  },

  async findById(id) {
    const query = 'SELECT * FROM reservations WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  },

  async findByResourceId(resource_id) {
    const query = 'SELECT * FROM reservations WHERE resource_id = $1 ORDER BY start_time ASC';
    const result = await db.query(query, [resource_id]);
    return result.rows;
  },

  async updateStatus(id, status) {
    const query = `
      UPDATE reservations
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await db.query(query, [status, id]);
    return result.rows[0];
  },

  async delete(id) {
    const query = 'DELETE FROM reservations WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);
    return result.rows[0];
  },

  async checkAvailability(resource_id, start_time, end_time) {
    const query = `
      SELECT id FROM reservations 
      WHERE resource_id = $1 
      AND status != 'cancelled'
      AND (
        (start_time < $3 AND end_time > $2)
      )
      LIMIT 1;
    `;
    const result = await db.query(query, [resource_id, start_time, end_time]);
    return result.rows.length === 0;
  },
};

module.exports = ReservationModel;
