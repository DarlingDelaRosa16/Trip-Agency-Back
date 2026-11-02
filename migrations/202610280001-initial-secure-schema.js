const { Sequelize, DataTypes } = require('sequelize');
const defineModels = require('./schema/v1');

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const names = tables.map(table => typeof table === 'string' ? table : table.tableName);
    if (names.some(name => ['Users', 'Person', 'Trip', 'Rol', 'Reservation'].includes(name))) {
      throw new Error('La migración requiere una base nueva. Configura DB_NAME=TripAgencySecure. La base anterior no se modificó.');
    }
    const schema = new Sequelize({ dialect: 'mssql', logging: false });
    const models = defineModels(schema);
    await queryInterface.sequelize.transaction(async transaction => {
      for (const name of ['Rol', 'Person', 'Users', 'Trip', 'Destiny', 'Img', 'Ofert', 'Reservation', 'ReservationPassenger', 'TripImageDestiny', 'AuditLog']) {
        const model = models[name];
        const fields = Object.fromEntries(Object.entries(model.rawAttributes).map(([key, attribute]) => [key, { ...attribute }]));
        if (name === 'Person') delete fields.OwnerId.references;
        await queryInterface.createTable(model.getTableName(), fields, { transaction });
        for (const index of model.options.indexes) await queryInterface.addIndex(model.getTableName(), index.fields, { ...index, transaction });
      }
      await queryInterface.addConstraint({ tableName: 'Person', schema: 'dbo' }, {
        fields: ['OwnerId'], type: 'foreign key', name: 'FK_Person_Owner',
        references: { table: { tableName: 'Users', schema: 'dbo' }, field: 'IdUser' },
        onDelete: 'NO ACTION', onUpdate: 'NO ACTION', transaction
      });
      await queryInterface.createTable({ tableName: 'Sessions', schema: 'dbo' }, {
        sid: { type: DataTypes.STRING(128), primaryKey: true },
        expires: { type: DataTypes.DATE, allowNull: false },
        data: { type: DataTypes.TEXT, allowNull: false },
        userId: { type: DataTypes.INTEGER, allowNull: true }
      }, { transaction });
      await queryInterface.addIndex({ tableName: 'Sessions', schema: 'dbo' }, ['expires'], { transaction });
      await queryInterface.addIndex({ tableName: 'Sessions', schema: 'dbo' }, ['userId'], { transaction });
      for (const sql of [
        'ALTER TABLE [dbo].[Trip] ADD CONSTRAINT [CK_Trip_Values] CHECK ([Capacity] > 0 AND [Price] > 0 AND [EndDate] >= [StartDate])',
        'ALTER TABLE [dbo].[Ofert] ADD CONSTRAINT [CK_Ofert_Values] CHECK ([Discount] >= 0 AND [Discount] <= 100 AND [EndDate] >= [StartDate])',
        'ALTER TABLE [dbo].[Reservation] ADD CONSTRAINT [CK_Reservation_Values] CHECK ([TotalPrice] >= 0 AND [UnitPrice] >= 0 AND [Discount] >= 0 AND [Discount] <= 100 AND [EndReservationDate] >= [StartReservationDate])'
      ]) await queryInterface.sequelize.query(sql, { transaction });
      await queryInterface.bulkInsert({ tableName: 'Rol', schema: 'dbo' }, [{ RolName: 'client' }, { RolName: 'admin' }], { transaction });
    });
    await schema.close();
  },
  async down() {
    throw new Error('Reversión destructiva deshabilitada. Restaura una copia de seguridad en otra base.');
  }
};
