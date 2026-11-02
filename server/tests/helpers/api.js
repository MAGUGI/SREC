const request = require('supertest');
const { pool } = require('../../src/config/database');

let app;

// Alvo das requisições: o app em memória (padrão) ou um servidor externo,
// quando API_BASE_URL está definida. O segundo modo existe para rodar esta
// mesma suíte contra o código recebido e registrar quantos casos reprovam.
const target = () => {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  if (!app) app = require('../../src/app')();
  return app;
};

const api = () => request(target());

const resetDatabase = () => pool.query('TRUNCATE reservations, resources RESTART IDENTITY CASCADE');

const insertResource = async ({ name = 'Sala Azul', type = 'meeting_room', capacity = 8 } = {}) => {
  const { rows } = await pool.query('INSERT INTO resources (name, type, capacity) VALUES ($1, $2, $3) RETURNING *', [name, type, capacity]);
  return rows[0];
};

const insertReservation = async ({ resourceId, userName = 'Ana', start, end, status = 'scheduled' }) => {
  const { rows } = await pool.query(
    'INSERT INTO reservations (resource_id, user_name, start_time, end_time, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [resourceId, userName, start, end, status],
  );
  return rows[0];
};

const countReservations = async () => Number((await pool.query('SELECT COUNT(*) AS n FROM reservations')).rows[0].n);

const statusOf = async (id) => (await pool.query('SELECT status FROM reservations WHERE id = $1', [id])).rows[0]?.status;

/** Janela no dia 10/01/2030, horário de Brasília: slot('14:00', '15:00'). */
const slot = (start, end, day = '2030-01-10') => ({
  start_time: `${day}T${start}:00-03:00`,
  end_time: `${day}T${end}:00-03:00`,
});

module.exports = { api, pool, resetDatabase, insertResource, insertReservation, countReservations, statusOf, slot };
