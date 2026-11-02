const router = require('express').Router();
const controller = require('../controllers/tripController');
const { requireAdmin } = require('../middleware/auth');
const v = require('../middleware/validation');
const { asyncHandler } = require('../lib/errors');

router.get('/', v.pagination, asyncHandler(controller.list));
router.get('/:id/reservations', requireAdmin, v.params, v.adminReservationsQuery, asyncHandler(require('../controllers/reservationController').byTrip));
router.get('/:id', v.params, asyncHandler(controller.get));
router.post('/', requireAdmin, v.body(v.createTrip), asyncHandler(controller.create));
router.put('/:id', requireAdmin, v.params, v.body(v.updateTrip), asyncHandler(controller.update));
router.delete('/:id', requireAdmin, v.params, asyncHandler(controller.archive));
router.post('/:id/cancel', requireAdmin, v.params, v.body(v.cancellation), asyncHandler(controller.cancel));
module.exports = router;
