const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { corsOptions } = require('./config/cors');
const { writeLimiter } = require('./middlewares/rateLimit');
const errorHandler = require('./middlewares/errorHandler');
const AppError = require('./errors/AppError');
const healthRoutes = require('./routes/healthRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const reservationRoutes = require('./routes/reservationRoutes');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));
  app.use('/health', healthRoutes);
  app.use('/api', writeLimiter);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.get('/', (req, res) => res.json({ name: 'SREC Coworking API', status: 'running', health: '/health' }));
  app.use((req, res, next) => next(AppError.notFound('Rota não encontrada.', 'ROUTE_NOT_FOUND')));
  app.use(errorHandler);
  return app;
}
module.exports = createApp;
