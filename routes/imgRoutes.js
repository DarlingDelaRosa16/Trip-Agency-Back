const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { params } = require('../middleware/validation');
const { asyncHandler } = require('../lib/errors');
const controller = require('../controllers/imgController');

router.use(requireAdmin);
router.post('/upload', require('../multer/multerConfig'), asyncHandler(controller.upload));
router.delete('/:id', params, asyncHandler(controller.remove));
module.exports = router;
