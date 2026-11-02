const { test } = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../migrations/202610280001-initial-secure-schema');
test('migration refuses to alter an existing legacy database', async () => {
  let changed = false;
  await assert.rejects(migration.up({
    showAllTables: async () => ['Person', 'Users'],
    sequelize: { transaction: async () => { changed = true; } }
  }), /base nueva/);
  assert.equal(changed, false);
});
test('SQL Server queries use an update lock for reservation serialization', () => {
  const db = require('../models');
  const query = db.sequelize.getQueryInterface().queryGenerator.selectQuery(db.Trip.getTableName(), {
    tableHint: db.Sequelize.TableHints.UPDLOCK, where: { IdTrip: 1 }
  }, db.Trip);
  assert.match(query, /WITH \(UPDLOCK\)/);
});

test('initial schema generates tables, constraints and unique email without connecting', async () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize({ dialect: 'mssql', logging: false });
  const queryInterface = sequelize.getQueryInterface();
  const statements = [];
  sequelize.query = async sql => { statements.push(sql); return []; };
  sequelize.transaction = async work => work({});
  queryInterface.showAllTables = async () => [];
  await migration.up(queryInterface);
  assert.equal(statements.filter(sql => sql.includes('CREATE TABLE')).length, 12);
  assert.match(statements.find(sql => sql.includes('CREATE TABLE [dbo].[Users]')), /UNIQUE/);
  assert.ok(statements.some(sql => sql.includes('FK_Person_Owner')));
  assert.ok(statements.some(sql => sql.includes('CK_Trip_Values')));
});
