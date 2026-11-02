const db = require('../models');
const service = require('../services/reservationService');
const { notFound } = require('../lib/errors');
const { isAdmin } = require('../middleware/auth');
const paginate = require('../lib/pagination');
const responsible = { model: db.Users, as: 'User', attributes: ['IdUser','IdPerson','IdRol','Email'],
  include: [{ model: db.Person, as: 'Person', attributes: ['IdPerson','PersonName','PersonLastname','Phone'] }] };

exports.mine = async (req, res) => {
  const result = await db.Reservation.findAndCountAll({ where: { IdUser: req.user.IdUser }, include: ['Trip'], order: [['IdReservation','DESC']], limit: req.pagination.limit, offset: req.pagination.offset });
  res.formatResponse(paginate(result,req.pagination));
};
exports.byTrip = async (req, res) => {
  const IdTrip = req.params.id;
  if (!await db.Trip.findByPk(IdTrip,{ attributes: ['IdTrip'] })) throw notFound();
  const where = { IdTrip, ...(req.reservationStatus === 'confirmed' ? { ReservationStatus: true } : req.reservationStatus === 'cancelled' ? { ReservationStatus: false } : {}) };
  const [result, confirmedCount, cancelledCount] = await Promise.all([
    db.Reservation.findAndCountAll({ where, include: [responsible], order: [['IdReservation','DESC']], limit: req.pagination.limit, offset: req.pagination.offset }),
    db.Reservation.count({ where: { IdTrip, ReservationStatus: true } }),
    db.Reservation.count({ where: { IdTrip, ReservationStatus: false } })
  ]);
  const ids = result.rows.map(row => row.IdReservation);
  const counts = ids.length ? await db.ReservationPassenger.findAll({ attributes: ['IdReservation',[db.sequelize.fn('COUNT',db.sequelize.col('IdPerson')),'count']], where: { IdReservation: ids }, group: ['IdReservation'], raw: true }) : [];
  const byId = new Map(counts.map(row => [row.IdReservation,Number(row.count)]));
  result.rows = result.rows.map(row => ({ ...row.toJSON(), PassengerCount: byId.get(row.IdReservation) || 0 }));
  res.formatResponse({ ...paginate(result,req.pagination), summary: { confirmedCount, cancelledCount } });
};
exports.get = async (req, res) => {
  const admin = isAdmin(req.user), where = { IdReservation: req.params.id, ...(!admin ? { IdUser: req.user.IdUser } : {}) };
  const reservation = await db.Reservation.findOne({ where, include: ['Trip','Passengers',...(admin ? [responsible] : [])] });
  if (!reservation) throw notFound();
  res.formatResponse(reservation);
};
exports.quote = async (req,res) => res.formatResponse(await service.quote(req.user,req.body));
exports.create = async (req,res) => res.formatResponse(await service.create(req.user,req.body),201);
exports.cancel = async (req,res) => res.formatResponse(await service.cancel(req.user,req.params.id,req.body.reason));
