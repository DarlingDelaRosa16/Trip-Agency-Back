const db = require('../models');
const { AppError, notFound } = require('../lib/errors');
const personAttributes = ['IdPerson','PersonName','PersonLastname','Dni','BirthDate','Sex','Phone','Email'];
const include = [{ model: db.TravelGroupMember, as: 'Members', include: [{ model: db.Person, as: 'Person', attributes: personAttributes }] }];
const dto = group => ({ IdGroup: group.IdGroup, name: group.Name,
  memberCount: group.Members.length, members: group.Members.map(member => member.Person.toJSON()).sort((a,b) => a.IdPerson - b.IdPerson) });
const find = (user, id, transaction, lock = false) => db.TravelGroup.findOne({
  where: { IdGroup: id, OwnerId: user.IdUser }, transaction,
  ...(lock ? { tableHint: db.Sequelize.TableHints.UPDLOCK } : {})
});
async function detail(user, id, transaction) {
  const group = await db.TravelGroup.findOne({ where: { IdGroup: id, OwnerId: user.IdUser }, include, transaction });
  if (!group) throw notFound(); return dto(group);
}
async function save(user, id, { name, personIds }) {
  try {
    return await db.sequelize.transaction(async transaction => {
      let group;
      if (id) { group = await find(user, id, transaction, true); if (!group) throw notFound(); }
      if (personIds.length) {
        const people = await db.Person.findAll({ where: { IdPerson: personIds, OwnerId: user.IdUser }, attributes: ['IdPerson'], transaction, tableHint: db.Sequelize.TableHints.UPDLOCK });
        if (people.length !== personIds.length) throw new AppError(422, 'INVALID_PASSENGERS', 'Selecciona personas de tu cuenta sin repetir.');
      }
      if (group) { await group.update({ Name: name }, { transaction }); await db.TravelGroupMember.destroy({ where: { IdGroup: id }, transaction }); }
      else group = await db.TravelGroup.create({ Name: name, OwnerId: user.IdUser }, { transaction });
      if (personIds.length) await db.TravelGroupMember.bulkCreate(personIds.map(IdPerson => ({ IdGroup: group.IdGroup, IdPerson })), { transaction });
      await db.AuditLog.create({ IdUser: user.IdUser, Action: id ? 'group.update' : 'group.create', Entity: 'TravelGroup', EntityId: group.IdGroup }, { transaction });
      return detail(user, group.IdGroup, transaction);
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') throw new AppError(409, 'GROUP_NAME_TAKEN', 'Ya tienes un grupo con ese nombre.');
    throw error;
  }
}
async function remove(user, id) {
  return db.sequelize.transaction(async transaction => {
    const group = await find(user, id, transaction, true); if (!group) throw notFound();
    await db.TravelGroupMember.destroy({ where: { IdGroup: id }, transaction });
    await group.destroy({ transaction });
    await db.AuditLog.create({ IdUser: user.IdUser, Action: 'group.delete', Entity: 'TravelGroup', EntityId: id }, { transaction });
  });
}
async function list(user, pagination) {
  const result = await db.TravelGroup.findAndCountAll({ where: { OwnerId: user.IdUser }, order: [['IdGroup', 'DESC']], limit: pagination.limit, offset: pagination.offset });
  const ids = result.rows.map(group => group.IdGroup);
  const counts = ids.length ? await db.TravelGroupMember.findAll({ attributes: ['IdGroup', [db.sequelize.fn('COUNT', db.sequelize.col('IdPerson')), 'count']], where: { IdGroup: ids }, group: ['IdGroup'], raw: true }) : [];
  const byId = new Map(counts.map(row => [row.IdGroup, Number(row.count)]));
  return { count: result.count, rows: result.rows.map(group => ({ IdGroup: group.IdGroup, name: group.Name, memberCount: byId.get(group.IdGroup) || 0 })) };
}
module.exports = { detail, save, remove, list };
