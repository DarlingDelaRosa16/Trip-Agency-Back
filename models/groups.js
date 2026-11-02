const { DataTypes: T } = require('sequelize');
module.exports = (sequelize, { Users, Person }) => {
  const TravelGroup = sequelize.define('TravelGroup', {
    IdGroup: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
    OwnerId: { type: T.INTEGER, allowNull: false }, Name: { type: T.STRING(60), allowNull: false }
  }, { tableName: 'TravelGroup', schema: 'dbo', timestamps: false, indexes: [{ unique: true, fields: ['OwnerId', 'Name'] }] });
  const TravelGroupMember = sequelize.define('TravelGroupMember', {
    IdGroupMember: { type: T.INTEGER, primaryKey: true, autoIncrement: true },
    IdGroup: { type: T.INTEGER, allowNull: false }, IdPerson: { type: T.INTEGER, allowNull: false }
  }, { tableName: 'TravelGroupMember', schema: 'dbo', timestamps: false, indexes: [{ unique: true, fields: ['IdGroup', 'IdPerson'] }, { fields: ['IdPerson'] }] });
  TravelGroup.belongsTo(Users, { foreignKey: 'OwnerId', as: 'Owner' });
  TravelGroup.hasMany(TravelGroupMember, { foreignKey: 'IdGroup', as: 'Members' });
  TravelGroupMember.belongsTo(TravelGroup, { foreignKey: 'IdGroup', as: 'Group' });
  TravelGroupMember.belongsTo(Person, { foreignKey: 'IdPerson', as: 'Person' });
  return { TravelGroup, TravelGroupMember };
};
