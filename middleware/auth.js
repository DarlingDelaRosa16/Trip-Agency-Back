const { randomBytes, timingSafeEqual } = require('crypto');
const { AppError } = require('../lib/errors');

const csrfToken = req => {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
  return req.session.csrfToken;
};
const csrf = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = req.session.csrfToken;
  const supplied = req.get('X-CSRF-Token');
  if (!expected || !supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return next(new AppError(403, 'CSRF_INVALID', 'Actualiza la sesión e intenta nuevamente.'));
  }
  next();
};
const requireUser = (req, res, next) => {
  if (!req.user) return next(new AppError(401, 'AUTH_REQUIRED', 'Inicia sesión para continuar.'));
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.user) return next(new AppError(401, 'AUTH_REQUIRED', 'Inicia sesión para continuar.'));
  if (req.user.Rol?.RolName !== 'admin') return next(new AppError(403, 'FORBIDDEN', 'No tienes permisos para esta operación.'));
  next();
};
const isAdmin = user => user?.Rol?.RolName === 'admin';
function loadUser(db) {
  return async (req, res, next) => {
    try {
      if (req.session.userId) {
        req.user = await db.Users.findByPk(req.session.userId, { attributes: { include: ['AuthVersion'] }, include: ['Rol', 'Person'] });
        if (!req.user || req.session.authVersion !== req.user.AuthVersion) {
          return req.session.destroy(error => error ? next(error) : next(new AppError(401, 'SESSION_EXPIRED', 'La sesión ya no es válida.')));
        }
      }
      next();
    } catch (error) { next(error); }
  };
}
module.exports = { csrfToken, csrf, requireUser, requireAdmin, isAdmin, loadUser };
