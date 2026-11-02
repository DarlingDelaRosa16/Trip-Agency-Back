const auth = require('../services/authService');
const { csrfToken } = require('../middleware/auth');

const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
const save = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));

exports.csrf = (req, res) => res.formatResponse({ csrfToken: csrfToken(req) });
exports.me = (req, res) => res.formatResponse({ user: auth.publicUser(req.user), csrfToken: csrfToken(req) });
exports.createUser = async (req, res) => res.formatResponse(await auth.createUser(req.body), 201);
exports.login = async (req, res) => {
  const { user, authVersion } = await auth.authenticate(req.body.email, req.body.password);
  await regenerate(req);
  req.session.userId = user.IdUser;
  req.session.authVersion = authVersion;
  req.session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const token = csrfToken(req);
  await save(req);
  res.formatResponse({ user, csrfToken: token });
};
exports.logout = async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
  res.clearCookie('tripagency.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.formatResponse(null, 200, 'Sesión cerrada.');
};
exports.changePassword = async (req, res) => {
  await auth.changePassword(req.user.IdUser, req.body.currentPassword, req.body.password);
  await req.sessionStore.destroyUserSessions(req.user.IdUser);
  res.clearCookie('tripagency.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.formatResponse(null, 200, 'Contraseña actualizada. Inicia sesión nuevamente.');
};
