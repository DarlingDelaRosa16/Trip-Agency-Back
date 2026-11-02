const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { randomUUID } = require('crypto');
const path = require('path');
const db = require('./models');
const { createStore } = require('./config/session');
const { csrf, loadUser } = require('./middleware/auth');
const { AppError, asyncHandler } = require('./lib/errors');

function createApp(options = {}) {
  const secret = options.secret || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
  const production = process.env.NODE_ENV === 'production';
  const origins = (process.env.FRONTEND_ORIGINS || (production ? '' : 'http://localhost:5173,http://localhost:3000')).split(',').filter(Boolean);
  if (production && !origins.length) throw new Error('Configura FRONTEND_ORIGINS.');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
  app.use((req, res, next) => { req.id = randomUUID(); res.setHeader('X-Request-Id', req.id); next(); });
  app.use(helmet());
  app.use(cors({ credentials: true, origin: (origin, callback) => {
    if (!origin || origins.includes(origin)) return callback(null, true);
    callback(new AppError(403, 'ORIGIN_FORBIDDEN', 'Origen no permitido.'));
  } }));
  app.use(require('./middleware/responseFormatter'));
  app.get('/health/live', (req, res) => res.formatResponse({ status: 'ok' }));
  app.get('/health/ready', asyncHandler(async (req, res) => {
    try { await db.sequelize.authenticate(); res.formatResponse({ status: 'ready' }); }
    catch { throw new AppError(503, 'NOT_READY', 'Servicio no disponible.'); }
  }));
  app.use('/api', rateLimit({
    windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes.'))
  }));
  app.use(express.json({ limit: '100kb' }));
  // Public trip photos may be embedded by the web client on the same site.
  app.use('/uploads', helmet.crossOriginResourcePolicy({ policy: 'same-site' }), express.static(path.join(__dirname, 'uploads'), { dotfiles: 'deny' }));
  const store = options.store || createStore(db.sequelize);
  app.locals.sessionStore = store;
  app.use(session({
    name: 'tripagency.sid', secret, store, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
  }));
  app.use((req, res, next) => {
    if (req.session.expiresAt && req.session.expiresAt <= Date.now()) {
      return req.session.destroy(error => error ? next(error) : next(new AppError(401, 'SESSION_EXPIRED', 'La sesión expiró.')));
    }
    next();
  });
  app.use(loadUser(db));
  app.use('/api', csrf);
  for (const [prefix, file] of [
    ['user', 'userRoutes'], ['person', 'personRoutes'], ['roles', 'rolRoutes'],
    ['oferts', 'ofertsRoutes'], ['destinies', 'destinyRoutes'], ['trips', 'tripRoutes'],
    ['reservations', 'reservationRoutes'], ['groups', 'groupRoutes'], ['images', 'imgRoutes'], ['tripImageDestinies', 'tripImageDestinyRoutes']
  ]) app.use('/api/' + prefix, require('./routes/' + file));
  app.use('/api/reservacionUserPersons', (req, res, next) =>
    next(new AppError(410, 'ENDPOINT_REMOVED', 'Usa /api/person y /api/reservations/:id.')));
  app.use('/api-docs', require('swagger-ui-express').serve, require('swagger-ui-express').setup(require('./swaggerConfig')));
  app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Ruta no encontrada.')));
  app.use(require('./middleware/errorHandler'));
  return app;
}
module.exports = { createApp };
