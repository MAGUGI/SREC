const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error('Origin not allowed');
    error.statusCode = 403;
    error.code = 'ORIGIN_NOT_ALLOWED';
    return callback(error);
  },
};
module.exports = { allowedOrigins, corsOptions };
