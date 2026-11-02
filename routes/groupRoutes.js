const router = require('express').Router();
const { z } = require('zod');
const { requireUser } = require('../middleware/auth');
const v = require('../middleware/validation');
const { asyncHandler } = require('../lib/errors');
const service = require('../services/groupService');
const paginate = require('../lib/pagination');
const input = z.object({ name: z.string().trim().min(1).max(60).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Nombre inválido.'),
  personIds: z.array(z.number().int().positive().max(2147483647)).max(100).refine(ids => new Set(ids).size === ids.length, 'No repitas integrantes.') }).strict();
router.use(requireUser);
router.get('/', v.pagination, asyncHandler(async (req,res) => res.formatResponse(paginate(await service.list(req.user, req.pagination), req.pagination))));
router.get('/:id', v.params, asyncHandler(async (req,res) => res.formatResponse(await service.detail(req.user, req.params.id))));
router.post('/', v.body(input), asyncHandler(async (req,res) => res.formatResponse(await service.save(req.user, null, req.body), 201)));
router.put('/:id', v.params, v.body(input), asyncHandler(async (req,res) => res.formatResponse(await service.save(req.user, req.params.id, req.body))));
router.delete('/:id', v.params, asyncHandler(async (req,res) => { await service.remove(req.user, req.params.id); res.formatResponse(null); }));
module.exports = router;
