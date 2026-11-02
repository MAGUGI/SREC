const rateLimit = require('express-rate-limit');
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const WRITE_MAX = Number(process.env.RATE_LIMIT_WRITE_MAX || 20);
const writeLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: WRITE_MAX,
  skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({ error: 'Limite de requisições excedido.', code: 'RATE_LIMIT_EXCEEDED' });
  },
});
module.exports = { writeLimiter, WINDOW_MS, WRITE_MAX };
