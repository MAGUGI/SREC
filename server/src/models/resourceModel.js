const db = require('../config/database');

const ResourceModel = {
  async create(name, type, capacity) {
    const query = `
      INSERT INTO resources (name, type, capacity)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await db.query(query, [name, type, capacity]);
    return result.rows[0];
  },

  async findAll() {
    const query = 'SELECT * FROM resources ORDER BY id ASC';
    const result = await db.query(query);
    return result.rows;
  },

  async findById(id) {
    const query = 'SELECT * FROM resources WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  },

  async update(id, name, type, capacity) {
    const query = `
      UPDATE resources
      SET name = $1, type = $2, capacity = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const result = await db.query(query, [name, type, capacity, id]);
    return result.rows[0];
  },

  async delete(id) {
    const query = 'DELETE FROM resources WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);
    return result.rows[0];
  },
};

module.exports = ResourceModel;
