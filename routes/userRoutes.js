const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/userController');
const validation = require('../middleware/validation');
const { requireUser } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../lib/errors');

const limited = () => new AppError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Intenta más tarde.');
const byIp = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res, next) => next(limited()) });
const byAccount = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: req => req.body.email,
  standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res, next) => next(limited())
});
router.get('/csrf', controller.csrf);
router.get('/me', requireUser, controller.me);
router.post('/create', byIp, validation.body(validation.register), asyncHandler(controller.createUser));
router.post('/login', byIp, validation.body(validation.login), byAccount, asyncHandler(controller.login));
router.post('/logout', requireUser, asyncHandler(controller.logout));
router.post('/change-password', requireUser, byIp, validation.body(validation.changePassword), asyncHandler(controller.changePassword));
module.exports = router;
