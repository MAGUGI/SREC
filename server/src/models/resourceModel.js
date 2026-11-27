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

  async update(id, fields) {
    const query = `
      UPDATE resources
      SET name = COALESCE($1, name), type = COALESCE($2, type),
          capacity = COALESCE($3, capacity), updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const result = await db.query(query, [fields.name || null, fields.type || null, fields.capacity ?? null, id]);
    return result.rows[0];
  },

  async delete(id) {
    const query = 'DELETE FROM resources WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);
    return result.rows[0];
  },
};

module.exports = ResourceModel;
