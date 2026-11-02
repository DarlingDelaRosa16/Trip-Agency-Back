const db = require('../models');
const { AppError, notFound } = require('../lib/errors');
const { isAdmin } = require('../middleware/auth');
const paginate = require('../lib/pagination');

const findOwned = (req, transaction) => db.Person.findOne({
  where: { IdPerson: req.params.id, ...(!isAdmin(req.user) ? { OwnerId: req.user.IdUser } : {}) },
  transaction, ...(transaction ? { tableHint: db.Sequelize.TableHints.UPDLOCK } : {})
});
exports.list = async (req, res) => {
  const result = await db.Person.findAndCountAll({
    where: isAdmin(req.user) ? {} : { OwnerId: req.user.IdUser },
    order: [['IdPerson', 'DESC']], limit: req.pagination.limit, offset: req.pagination.offset
  });
  res.formatResponse(paginate(result, req.pagination));
};
exports.get = async (req, res) => {
  const person = await findOwned(req);
  if (!person) throw notFound();
  res.formatResponse(person);
};
exports.create = async (req, res) => res.formatResponse(await db.Person.create({
  ...req.body, OwnerId: req.user.IdUser
}), 201);
exports.update = async (req, res) => {
  const result = await db.sequelize.transaction(async transaction => {
    const person = await findOwned(req, transaction);
    if (!person) throw notFound();
    await person.update(req.body, { transaction });
    if (isAdmin(req.user)) await db.AuditLog.create({
      IdUser: req.user.IdUser, Action: 'person.update', Entity: 'Person', EntityId: person.IdPerson
    }, { transaction });
    return person;
  });
  res.formatResponse(result);
};
exports.remove = async (req, res) => {
  await db.sequelize.transaction(async transaction => {
    const person = await findOwned(req, transaction);
    if (!person) throw notFound();
    if (await db.Users.count({ where: { IdPerson: person.IdPerson }, transaction }) ||
        await db.ReservationPassenger.count({ where: { IdPerson: person.IdPerson }, transaction }) ||
        await db.TravelGroupMember.count({ where: { IdPerson: person.IdPerson }, transaction })) {
      throw new AppError(409, 'PERSON_REFERENCED', 'La persona tiene una cuenta, pertenece a grupos o tiene historial de reservas.');
    }
    await person.destroy({ transaction });
    if (isAdmin(req.user)) await db.AuditLog.create({
      IdUser: req.user.IdUser, Action: 'person.delete', Entity: 'Person', EntityId: person.IdPerson
    }, { transaction });
  });
  res.formatResponse(null);
};
