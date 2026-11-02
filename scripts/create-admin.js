const db = require('../models');
const { parse, register } = require('../middleware/validation');
const { createUser } = require('../services/authService');

async function main() {
  const input = parse(register, {
    email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
    personData: { PersonName: 'Administrador', PersonLastname: 'Agencia' }
  });
  if (await db.Users.findOne({ where: { Email: input.email } })) throw new Error('La cuenta ya existe.');
  await createUser(input, 'admin');
  console.log('Administrador creado.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.sequelize.close());
