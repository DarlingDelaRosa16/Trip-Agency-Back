const express = require('express');
const db = require('../models');
const { requireAdmin, isAdmin } = require('../middleware/auth');
const { params, pagination, body } = require('../middleware/validation');
const { asyncHandler, AppError, notFound } = require('../lib/errors');
const paginate = require('../lib/pagination');
const reservations = require('../services/reservationService');

module.exports = function catalogRouter({ modelName, key, schema, include = [] }) {
  const router = express.Router();
  const model = db[modelName];
  const visibility = req => isAdmin(req.user) ? include : [
    ...include.filter(item => item !== 'Trip'),
    { model: db.Trip, as: 'Trip', where: { TripStatus: true }, required: true }
  ];
  router.get('/', pagination, asyncHandler(async (req, res) => {
    const result = await model.findAndCountAll({
      include: visibility(req), order: [[key, 'DESC']],
      limit: req.pagination.limit, offset: req.pagination.offset
    });
    res.formatResponse(paginate(result, req.pagination));
  }));
  router.get('/:id', params, asyncHandler(async (req, res) => {
    const item = await model.findOne({ where: { [key]: req.params.id }, include: visibility(req) });
    if (!item) throw notFound();
    res.formatResponse(item);
  }));

  async function write(req, creating) {
    return reservations.run(async transaction => {
      await reservations.lockTrip(req.body.IdTrip, transaction);
      let item;
      if (!creating) {
        item = await model.findByPk(req.params.id, { transaction });
        if (!item) throw notFound();
        if (item.IdTrip !== req.body.IdTrip) throw new AppError(422, 'TRIP_IMMUTABLE', 'No se puede trasladar este registro a otro viaje.');
      }
      if (modelName === 'TripImageDestiny') {
        const destiny = await db.Destiny.findOne({ where: { IdDestiny: req.body.IdDestiny, IdTrip: req.body.IdTrip }, transaction });
        const image = await db.Img.findOne({ where: { IdImg: req.body.IdImg, IdTrip: req.body.IdTrip }, transaction });
        if (!destiny || !image) throw new AppError(422, 'INVALID_RELATION', 'La imagen y el destino deben pertenecer al viaje.');
      }
      item = creating ? await model.create(req.body, { transaction }) : await item.update(req.body, { transaction });
      await db.AuditLog.create({
        IdUser: req.user.IdUser, Action: modelName.toLowerCase() + (creating ? '.create' : '.update'),
        Entity: modelName, EntityId: item[key]
      }, { transaction });
      return item;
    });
  }
  router.post('/', requireAdmin, body(schema), asyncHandler(async (req, res) => res.formatResponse(await write(req, true), 201)));
  router.put('/:id', requireAdmin, params, body(schema), asyncHandler(async (req, res) => res.formatResponse(await write(req, false))));
  router.delete('/:id', requireAdmin, params, asyncHandler(async (req, res) => {
    const initial = await model.findByPk(req.params.id);
    if (!initial) throw notFound();
    await reservations.run(async transaction => {
      await reservations.lockTrip(initial.IdTrip, transaction);
      const item = await model.findByPk(req.params.id, { transaction });
      if (!item) throw notFound();
      await item.destroy({ transaction });
      await db.AuditLog.create({ IdUser: req.user.IdUser, Action: modelName.toLowerCase() + '.delete', Entity: modelName, EntityId: req.params.id }, { transaction });
    });
    res.formatResponse(null);
  }));
  return router;
};
