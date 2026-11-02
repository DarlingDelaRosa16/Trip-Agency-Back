const db = require('../models');
const reservations = require('../services/reservationService');
const { AppError, notFound } = require('../lib/errors');
const { isAdmin } = require('../middleware/auth');
const paginate = require('../lib/pagination');
const { businessDate } = require('../lib/business');

async function serialize(trip) {
  return { ...trip.toJSON(), OpenPositions: trip.Capacity - await reservations.occupied(trip.IdTrip) };
}
exports.list = async (req, res) => {
  const result = await db.Trip.findAndCountAll({
    where: isAdmin(req.user) ? {} : { TripStatus: true },
    include: ['Destinations', 'Images', 'Offers'], distinct: true,
    order: [['IdTrip', 'DESC']], limit: req.pagination.limit, offset: req.pagination.offset
  });
  result.rows = await Promise.all(result.rows.map(serialize));
  res.formatResponse(paginate(result, req.pagination));
};
exports.get = async (req, res) => {
  const trip = await db.Trip.findOne({
    where: { IdTrip: req.params.id, ...(!isAdmin(req.user) ? { TripStatus: true } : {}) },
    include: ['Destinations', 'Images', 'Offers']
  });
  if (!trip) throw notFound();
  res.formatResponse(await serialize(trip));
};
exports.create = async (req, res) => {
  if (req.body.trip.StartDate <= businessDate()) throw new AppError(422, 'PAST_DEPARTURE', 'La fecha de salida debe ser futura.');
  const result = await db.sequelize.transaction(async transaction => {
    const trip = await db.Trip.create(req.body.trip, { transaction });
    await db.Destiny.bulkCreate(req.body.destinations.map(Destiny => ({ Destiny, IdTrip: trip.IdTrip })), { transaction });
    await db.AuditLog.create({ IdUser: req.user.IdUser, Action: 'trip.create', Entity: 'Trip', EntityId: trip.IdTrip }, { transaction });
    return db.Trip.findByPk(trip.IdTrip, { include: ['Destinations', 'Images', 'Offers'], transaction });
  });
  res.formatResponse(await serialize(result), 201);
};
exports.update = async (req, res) => {
  const result = await reservations.run(async transaction => {
    const trip = await reservations.lockTrip(req.params.id, transaction);
    const { destinations, ...changes } = req.body;
    const merged = { ...trip.toJSON(), ...changes };
    if (changes.StartDate && changes.StartDate <= businessDate()) throw new AppError(422, 'PAST_DEPARTURE', 'La fecha de salida debe ser futura.');
    if (merged.EndDate < merged.StartDate) throw new AppError(422, 'INVALID_DATES', 'Fechas inválidas.');
    const used = await reservations.occupied(trip.IdTrip, transaction);
    if (merged.Capacity < used) throw new AppError(409, 'CAPACITY_IN_USE', 'La capacidad es menor que los cupos ocupados.');
    if (used && ((changes.StartDate && changes.StartDate !== trip.StartDate) ||
        (changes.EndDate && changes.EndDate !== trip.EndDate))) {
      throw new AppError(409, 'DATES_IN_USE', 'No se pueden cambiar fechas con reservas confirmadas.');
    }
    await trip.update(changes, { transaction });
    if (destinations) {
      const existing = await db.Destiny.findAll({ where: { IdTrip: trip.IdTrip }, transaction });
      const remaining = [...existing], added = [];
      for (const name of destinations) {
        const index = remaining.findIndex(item => item.Destiny === name);
        if (index >= 0) remaining.splice(index, 1); else added.push(name);
      }
      const removedIds = remaining.map(item => item.IdDestiny);
      if (removedIds.length && (await db.Img.count({ where: { IdDestiny: removedIds }, transaction }) ||
          await db.TripImageDestiny.count({ where: { IdDestiny: removedIds }, transaction }))) {
        throw new AppError(409, 'DESTINATION_IN_USE', 'El destino tiene imágenes vinculadas. Retira esas imágenes antes de quitar el destino.');
      }
      if (removedIds.length) await db.Destiny.destroy({ where: { IdDestiny: removedIds }, transaction });
      if (added.length) await db.Destiny.bulkCreate(added.map(Destiny => ({ Destiny, IdTrip: trip.IdTrip })), { transaction });
    }
    await db.AuditLog.create({ IdUser: req.user.IdUser, Action: 'trip.update', Entity: 'Trip', EntityId: trip.IdTrip }, { transaction });
    return db.Trip.findByPk(trip.IdTrip, { include: ['Destinations', 'Images', 'Offers'], transaction });
  });
  res.formatResponse(await serialize(result));
};
exports.archive = async (req, res) => {
  await reservations.run(async transaction => {
    const trip = await reservations.lockTrip(req.params.id, transaction);
    await trip.update({ TripStatus: false }, { transaction });
    await db.AuditLog.create({ IdUser: req.user.IdUser, Action: 'trip.archive', Entity: 'Trip', EntityId: trip.IdTrip }, { transaction });
  });
  res.formatResponse(null);
};
exports.cancel = async (req, res) => res.formatResponse(await reservations.cancelTrip(req.user, req.params.id, req.body.reason));
