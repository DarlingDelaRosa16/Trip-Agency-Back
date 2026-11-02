const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const { DataTypes } = require('sequelize');

function defineSession(sequelize) {
  return sequelize.models.Session || sequelize.define('Session', {
    sid: { type: DataTypes.STRING(128), primaryKey: true },
    expires: { type: DataTypes.DATE, allowNull: false },
    data: { type: DataTypes.TEXT, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: true }
  }, { tableName: 'Sessions', schema: 'dbo', timestamps: false, indexes: [{ fields: ['userId'] }, { fields: ['expires'] }] });
}
function createStore(sequelize) {
  const model = defineSession(sequelize);
  const store = new SequelizeStore({
    db: sequelize, table: 'Session', disableTouch: true,
    extendDefaultFields: (defaults, data) => ({ ...defaults, userId: data.userId || null })
  });
  store.destroyUserSessions = userId => model.destroy({ where: { userId } });
  return store;
}
module.exports = { createStore, defineSession };
