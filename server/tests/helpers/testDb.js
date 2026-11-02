const { pool } = require('../../src/config/database');
const resetDatabase = async () => pool.query('TRUNCATE reservations, resources RESTART IDENTITY CASCADE');
const createResource = async (name = 'Sala Azul', type = 'meeting_room', capacity = 8) => {
  const result = await pool.query('INSERT INTO resources (name, type, capacity) VALUES ($1, $2, $3) RETURNING *', [name, type, capacity]);
  return result.rows[0];
};
module.exports = { pool, resetDatabase, createResource };
