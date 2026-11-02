const defaultDb = require('../models');
const { AppError, notFound } = require('../lib/errors');
const { businessDate, reservationPrice } = require('../lib/business');
const { isAdmin } = require('../middleware/auth');

function createReservationService(db) {
  const { Op, Transaction, TableHints } = db.Sequelize;
  const run = work => db.sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, work);
  const lockTrip = async (id, transaction) => {
    const trip = await db.Trip.findByPk(id, { transaction, tableHint: TableHints.UPDLOCK });
    if (!trip) throw notFound();
    return trip;
  };
  const occupied = (IdTrip, transaction) => db.ReservationPassenger.count({
    include: [{ model: db.Reservation, as: 'Reservation', attributes: [], where: { IdTrip, ReservationStatus: true } }],
    transaction
  });
  const audit = (user, action, reservation, transaction, reason) => db.AuditLog.create({
    IdUser: user.IdUser, Action: action, Entity: 'Reservation',
    EntityId: reservation.IdReservation, Reason: reason || null
  }, { transaction });

  async function evaluate(user, { IdTrip, personIds }, transaction) {
    if (!Array.isArray(personIds) || personIds.length < 1 || personIds.length > 100 ||
        personIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(personIds).size !== personIds.length) {
      throw new AppError(422, 'INVALID_PASSENGERS', 'Selecciona personas de tu cuenta sin repetir.');
    }
    const trip = await lockTrip(IdTrip, transaction);
    const today = businessDate();
    if (!trip.TripStatus || trip.StartDate <= today) throw new AppError(409, 'TRIP_UNAVAILABLE', 'El viaje no admite reservas.');
    const people = await db.Person.findAll({ where: { IdPerson: personIds, OwnerId: user.IdUser }, transaction });
    if (people.length !== personIds.length) throw new AppError(422, 'INVALID_PASSENGERS', 'Selecciona personas de tu cuenta sin repetir.');
    const duplicate = await db.ReservationPassenger.count({
      where: { IdPerson: personIds }, include: [{ model: db.Reservation, as: 'Reservation', attributes: [], where: { IdTrip, ReservationStatus: true } }], transaction
    });
    if (duplicate) throw new AppError(409, 'PASSENGER_ALREADY_BOOKED', 'Un pasajero ya tiene reserva para este viaje.');
    const available = trip.Capacity - await occupied(IdTrip, transaction);
    if (available < personIds.length) throw new AppError(409, 'NO_CAPACITY', 'No hay cupos suficientes.');
    const offers = await db.Ofert.findAll({ where: { IdTrip, StartDate: { [Op.lte]: today }, EndDate: { [Op.gte]: today } }, transaction });
    const discount = Math.max(0, ...offers.map(offer => Number(offer.Discount)));
    return { people, quote: {
      IdTrip: trip.IdTrip, personIds: [...personIds], ...reservationPrice(trip.Price, discount, people.length), Discount: discount,
      StartReservationDate: trip.StartDate, EndReservationDate: trip.EndDate, OpenPositions: available
    } };
  }
  async function quote(user, input) {
    return run(async transaction => (await evaluate(user, input, transaction)).quote);
  }
  async function create(user, input) {
    return run(async transaction => {
      const { people, quote } = await evaluate(user, input, transaction);
      const expected = input.expectedQuote;
      if (expected && (expected.TotalPrice !== quote.TotalPrice || expected.StartReservationDate !== quote.StartReservationDate ||
          expected.EndReservationDate !== quote.EndReservationDate)) {
        throw new AppError(409, 'QUOTE_CHANGED', 'El importe o las fechas cambiaron. Revisa y confirma nuevamente.');
      }
      const reservation = await db.Reservation.create({
        IdTrip: quote.IdTrip, IdUser: user.IdUser, UnitPrice: quote.UnitPrice, TotalPrice: quote.TotalPrice, Discount: quote.Discount,
        StartReservationDate: quote.StartReservationDate, EndReservationDate: quote.EndReservationDate, ReservationStatus: true
      }, { transaction });
      await db.ReservationPassenger.bulkCreate(people.map(person => ({
        IdReservation: reservation.IdReservation, IdPerson: person.IdPerson, PersonName: person.PersonName, PersonLastname: person.PersonLastname,
        Dni: person.Dni, BirthDate: person.BirthDate, Sex: person.Sex
      })), { transaction });
      await audit(user, 'reservation.create', reservation, transaction);
      return db.Reservation.findByPk(reservation.IdReservation, { include: ['Passengers'], transaction });
    });
  }
  async function cancel(user, id, reason) {
    const initial = await db.Reservation.findByPk(id);
    if (!initial || (!isAdmin(user) && initial.IdUser !== user.IdUser)) throw notFound();
    return run(async transaction => {
      const trip = await lockTrip(initial.IdTrip, transaction);
      const reservation = await db.Reservation.findByPk(id, { transaction });
      if (!reservation.ReservationStatus) return reservation;
      if (isAdmin(user) && !reason) throw new AppError(422, 'REASON_REQUIRED', 'Indica el motivo de cancelación.');
      if (!isAdmin(user) && trip.StartDate <= businessDate()) {
        throw new AppError(409, 'CANCELLATION_CLOSED', 'El plazo de cancelación terminó.');
      }
      await reservation.update({
        ReservationStatus: false, CancelledAt: new Date(), CancellationReason: reason || null
      }, { transaction });
      await audit(user, 'reservation.cancel', reservation, transaction, reason);
      return reservation;
    });
  }
  async function cancelTrip(user, id, reason) {
    if (!reason) throw new AppError(422, 'REASON_REQUIRED', 'Indica el motivo de cancelación.');
    return run(async transaction => {
      const trip = await lockTrip(id, transaction);
      const reservations = await db.Reservation.findAll({ where: { IdTrip: id, ReservationStatus: true }, transaction });
      for (const reservation of reservations) {
        await reservation.update({ ReservationStatus: false, CancelledAt: new Date(), CancellationReason: reason }, { transaction });
        await audit(user, 'reservation.cancel', reservation, transaction, reason);
      }
      await trip.update({ TripStatus: false }, { transaction });
      await db.AuditLog.create({ IdUser: user.IdUser, Action: 'trip.cancel', Entity: 'Trip', EntityId: id, Reason: reason }, { transaction });
      return trip;
    });
  }
  return { quote, create, cancel, cancelTrip, occupied, lockTrip, run };
}
module.exports = { ...createReservationService(defaultDb), createReservationService };
