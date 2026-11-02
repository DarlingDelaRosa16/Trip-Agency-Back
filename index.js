const db = require('./models');
const { createApp } = require('./app');

async function start() {
  const app = createApp();
  await db.sequelize.authenticate();
  const server = app.listen(Number(process.env.PORT || 3000), () => console.log('TripAgency disponible.'));
  const shutdown = () => {
    server.close(async () => {
      app.locals.sessionStore.stopExpiringSessions();
      await db.sequelize.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
if (require.main === module) start().catch(error => {
  console.error('No se pudo iniciar TripAgency:', error.name);
  process.exitCode = 1;
});
module.exports = { start };
