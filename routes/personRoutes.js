const router = require('express').Router();
const controller = require('../controllers/personController');
const { requireUser } = require('../middleware/auth');
const v = require('../middleware/validation');
const { asyncHandler } = require('../lib/errors');

router.use(requireUser);
router.get('/', v.pagination, asyncHandler(controller.list));
router.get('/:id', v.params, asyncHandler(controller.get));
router.post('/', v.body(v.person), asyncHandler(controller.create));
router.put('/:id', v.params, v.body(v.person), asyncHandler(controller.update));
router.delete('/:id', v.params, asyncHandler(controller.remove));
module.exports = router;
