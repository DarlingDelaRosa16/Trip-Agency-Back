const { DataTypes: T } = require('sequelize');

module.exports = function defineModels(sequelize) {
  const id = () => ({ type: T.INTEGER, primaryKey: true, autoIncrement: true });
  const reference = (model, key, nullable = false) => ({
    type: T.INTEGER, allowNull: nullable,
    references: { model, key }, onDelete: 'NO ACTION', onUpdate: 'NO ACTION'
  });
  const text = (length, nullable = false) => ({ type: T.STRING(length), allowNull: nullable });
  const define = (name, fields, options = {}) => sequelize.define(name, fields, {
    tableName: name, schema: 'dbo', timestamps: false, ...options
  });

  const Rol = define('Rol', { IdRol: id(), RolName: { ...text(20), unique: true } });
  const Person = define('Person', {
    IdPerson: id(), OwnerId: reference('Users', 'IdUser', true),
    Dni: text(50, true), PersonName: text(50), PersonLastname: text(50),
    BirthDate: { type: T.DATEONLY, allowNull: true }, Phone: text(50, true),
    Email: text(254, true), Sex: text(1, true)
  }, { indexes: [{ fields: ['OwnerId'] }] });
  const Users = define('Users', {
    IdUser: id(), IdRol: reference('Rol', 'IdRol'), IdPerson: reference('Person', 'IdPerson'),
    Email: { ...text(254), unique: true }, Pass: text(255),
    AuthVersion: { type: T.INTEGER, allowNull: false, defaultValue: 0 }
  }, { defaultScope: { attributes: { exclude: ['Pass', 'AuthVersion'] } }, scopes: { withPassword: {} } });
  const Trip = define('Trip', {
    IdTrip: id(), TripName: text(255), StartDate: { type: T.DATEONLY, allowNull: false },
    EndDate: { type: T.DATEONLY, allowNull: false }, Price: { type: T.DECIMAL(10, 2), allowNull: false },
    TripDescription: { type: T.TEXT, allowNull: true },
    Capacity: { type: T.INTEGER, allowNull: false },
    TripStatus: { type: T.BOOLEAN, allowNull: false, defaultValue: true }
  });
  const Destiny = define('Destiny', {
    IdDestiny: id(), Destiny: text(255), IdTrip: reference('Trip', 'IdTrip')
  }, { indexes: [{ fields: ['IdTrip'] }] });
  const Img = define('Img', {
    IdImg: id(), ImgURL: text(500), IdTrip: reference('Trip', 'IdTrip'),
    IdDestiny: reference('Destiny', 'IdDestiny', true)
  }, { indexes: [{ fields: ['IdTrip'] }] });
  const Ofert = define('Ofert', {
    IdOfert: id(), IdTrip: reference('Trip', 'IdTrip'), OfertDescription: text(1000, true),
    Discount: { type: T.DECIMAL(5, 2), allowNull: false },
    StartDate: { type: T.DATEONLY, allowNull: false }, EndDate: { type: T.DATEONLY, allowNull: false }
  }, { indexes: [{ fields: ['IdTrip'] }] });
  const Reservation = define('Reservation', {
    IdReservation: id(), IdTrip: reference('Trip', 'IdTrip'), IdUser: reference('Users', 'IdUser'),
    TotalPrice: { type: T.DECIMAL(10, 2), allowNull: false },
    UnitPrice: { type: T.DECIMAL(10, 2), allowNull: false },
    Discount: { type: T.DECIMAL(5, 2), allowNull: false },
    StartReservationDate: { type: T.DATEONLY, allowNull: false },
    EndReservationDate: { type: T.DATEONLY, allowNull: false },
    ReservationStatus: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
    CreatedAt: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
    CancelledAt: { type: T.DATE, allowNull: true }, CancellationReason: text(500, true)
  }, { indexes: [{ fields: ['IdUser'] }, { fields: ['IdTrip', 'ReservationStatus'] }] });
  const ReservationPassenger = define('ReservationPassenger', {
    IdReservationPassenger: id(), IdReservation: reference('Reservation', 'IdReservation'),
    IdPerson: reference('Person', 'IdPerson'),
    PersonName: text(50), PersonLastname: text(50), Dni: text(50, true),
    BirthDate: { type: T.DATEONLY, allowNull: true }, Sex: text(1, true)
  }, { indexes: [{ unique: true, fields: ['IdReservation', 'IdPerson'] }, { fields: ['IdPerson'] }] });
  const TripImageDestiny = define('TripImageDestiny', {
    IdTripImageDestiny: id(), IdTrip: reference('Trip', 'IdTrip'),
    IdDestiny: reference('Destiny', 'IdDestiny'), IdImg: reference('Img', 'IdImg')
  }, { indexes: [{ unique: true, fields: ['IdTrip', 'IdDestiny', 'IdImg'] }] });
  const AuditLog = define('AuditLog', {
    IdAuditLog: id(), IdUser: reference('Users', 'IdUser'), Action: text(80),
    Entity: text(80), EntityId: { type: T.INTEGER, allowNull: false },
    Reason: text(500, true), CreatedAt: { type: T.DATE, allowNull: false, defaultValue: T.NOW }
  });

  Users.belongsTo(Person, { foreignKey: 'IdPerson', as: 'Person' });
  Users.belongsTo(Rol, { foreignKey: 'IdRol', as: 'Rol' });
  Person.belongsTo(Users, { foreignKey: 'OwnerId', as: 'Owner' });
  Trip.hasMany(Destiny, { foreignKey: 'IdTrip', as: 'Destinations' });
  Trip.hasMany(Img, { foreignKey: 'IdTrip', as: 'Images' });
  Trip.hasMany(Ofert, { foreignKey: 'IdTrip', as: 'Offers' });
  for (const model of [Destiny, Img, Ofert, Reservation, TripImageDestiny]) {
    model.belongsTo(Trip, { foreignKey: 'IdTrip', as: 'Trip' });
  }
  Img.belongsTo(Destiny, { foreignKey: 'IdDestiny', as: 'Destiny' });
  Reservation.belongsTo(Users, { foreignKey: 'IdUser', as: 'User' });
  Reservation.hasMany(ReservationPassenger, { foreignKey: 'IdReservation', as: 'Passengers' });
  ReservationPassenger.belongsTo(Reservation, { foreignKey: 'IdReservation', as: 'Reservation' });
  ReservationPassenger.belongsTo(Person, { foreignKey: 'IdPerson', as: 'Person' });
  TripImageDestiny.belongsTo(Destiny, { foreignKey: 'IdDestiny', as: 'Destiny' });
  TripImageDestiny.belongsTo(Img, { foreignKey: 'IdImg', as: 'Image' });
  const groups = require('./groups')(sequelize, { Users, Person });
  return { ...groups, Rol, Person, Users, Trip, Destiny, Img, Ofert, Reservation, ReservationPassenger, TripImageDestiny, AuditLog };
};
