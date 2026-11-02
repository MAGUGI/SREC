const express = require('express');
const db = require('../config/database');
const { APP_TIMEZONE } = require('../config/time');
const { version } = require('../../package.json');
const router = express.Router();

router.get('/', async (req, res) => {
  const startedAt = process.hrtime.bigint();
  try {
    await db.query('SELECT 1');
  } catch (err) {
    return res.status(503).json({ status: 'degraded', database: 'down', reason: err.code || 'unknown', uptimeSeconds: Math.round(process.uptime()), version });
  }
  const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  return res.json({ status: 'ok', database: 'up', databaseLatencyMs: Number(latencyMs.toFixed(2)), timezone: APP_TIMEZONE, uptimeSeconds: Math.round(process.uptime()), version });
});
module.exports = router;
