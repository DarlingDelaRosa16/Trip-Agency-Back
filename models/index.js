const Sequelize = require('sequelize');
const config = require('../config/database');
const defineModels = require('./schema');
const sequelize = new Sequelize(config);
// SQL DATE has no time zone. Tedious returns midnight UTC as a Date; the
// default Sequelize MSSQL parser formats it in local time and subtracts a day.
sequelize.connectionManager.refreshTypeParser({ calendarDate: {
  types: { mssql: [40] },
  parse(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : value; }
} });
module.exports = { ...defineModels(sequelize), sequelize, Sequelize };
