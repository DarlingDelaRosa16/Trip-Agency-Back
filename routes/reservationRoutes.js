const router = require('express').Router();
const controller = require('../controllers/reservationController');
const { requireUser } = require('../middleware/auth');
const v = require('../middleware/validation');
const { asyncHandler } = require('../lib/errors');

router.use(requireUser);
router.get('/mine', v.pagination, asyncHandler(controller.mine));
router.get('/:id', v.params, asyncHandler(controller.get));
router.post('/quote', v.body(v.reservationQuote), asyncHandler(controller.quote));
router.post('/', v.body(v.reservation), asyncHandler(controller.create));
router.post('/:id/cancel', v.params, v.body(v.cancellation), asyncHandler(controller.cancel));
module.exports = router;
