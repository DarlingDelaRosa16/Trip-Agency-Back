const bcrypt = require('bcrypt');
const db = require('../models');
const { AppError } = require('../lib/errors');

function publicUser(user) {
  const values = user.toJSON ? user.toJSON() : { ...user };
  delete values.Pass;
  delete values.AuthVersion;
  return values;
}
async function createUser({ personData, email, password }, roleName = 'client') {
  const hash = await bcrypt.hash(password, 12);
  return db.sequelize.transaction(async transaction => {
    const role = await db.Rol.findOne({ where: { RolName: roleName }, transaction });
    if (!role) throw new AppError(503, 'SETUP_REQUIRED', 'Falta completar la configuración de roles.');
    const person = await db.Person.create(personData, { transaction });
    const user = await db.Users.create({
      IdRol: role.IdRol, IdPerson: person.IdPerson, Email: email, Pass: hash
    }, { transaction });
    await person.update({ OwnerId: user.IdUser }, { transaction });
    return publicUser(user);
  });
}
async function authenticate(email, password) {
  const user = await db.Users.scope('withPassword').findOne({ where: { Email: email }, include: ['Rol', 'Person'] });
  const fallback = '$2b$12$XxW9Td1b3Z0a0vM8b8N1eOIF6VYCvY1SpRZC8V8RsW8AKXhF6z2ma';
  const valid = await bcrypt.compare(password, user?.Pass || fallback);
  if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
  return { user: publicUser(user), authVersion: user.AuthVersion };
}
async function changePassword(userId, currentPassword, password) {
  const user = await db.Users.scope('withPassword').findByPk(userId);
  if (!user || !await bcrypt.compare(currentPassword, user.Pass)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Contraseña actual incorrecta.');
  }
  const hash = await bcrypt.hash(password, 12);
  await db.Users.update({ Pass: hash, AuthVersion: db.Sequelize.literal('[AuthVersion] + 1') }, { where: { IdUser: userId } });
}
module.exports = { createUser, authenticate, changePassword, publicUser };
