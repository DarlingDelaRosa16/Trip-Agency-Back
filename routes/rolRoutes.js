const router = require('express').Router();
const db = require('../models');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../lib/errors');
router.get('/', requireAdmin, asyncHandler(async (req, res) => res.formatResponse(await db.Rol.findAll({ order: [['IdRol', 'ASC']] }))));
module.exports = router;
