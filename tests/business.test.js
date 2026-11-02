const { test } = require('node:test');
const assert = require('node:assert/strict');
const { businessDate, reservationPrice } = require('../lib/business');
const v = require('../middleware/validation');
const { extension } = require('../services/imageService');
const { publicUser } = require('../services/authService');

test('business dates follow Santo Domingo at midnight', () => {
  assert.equal(businessDate(new Date('2026-10-29T03:59:59Z')), '2026-10-28');
  assert.equal(businessDate(new Date('2026-10-29T04:00:00Z')), '2026-10-29');
});
test('prices round per passenger and retain decimal precision', () => {
  assert.deepEqual(reservationPrice('100.05', '12.50', 3), { UnitPrice: '87.54', TotalPrice: '262.62' });
  assert.deepEqual(reservationPrice('0.10', '0', 3), { UnitPrice: '0.10', TotalPrice: '0.30' });
  assert.deepEqual(reservationPrice('100', '100', 2), { UnitPrice: '0.00', TotalPrice: '0.00' });
  assert.throws(() => reservationPrice('99999999.99', 0, 2), { code: 'TOTAL_TOO_LARGE' });
});
test('registration rejects role assignment and validates bcrypt byte limit', () => {
  const input = { email: 'A@EXAMPLE.COM', password: 'secure-password-123', personData: { PersonName: 'Ana', PersonLastname: 'Perez' } };
  assert.equal(v.register.parse(input).email, 'a@example.com');
  assert.equal(v.register.safeParse({ ...input, rolId: 2 }).success, false);
  assert.equal(v.register.safeParse({ ...input, password: 'ñ'.repeat(40) }).success, false);
  assert.equal(v.register.safeParse({ ...input, personData: { ...input.personData, OwnerId: 5 } }).success, false);
});
test('reservation input rejects price, another user and duplicate passengers', () => {
  assert.equal(v.reservation.safeParse({ IdTrip: 1, personIds: [1, 2] }).success, true);
  for (const body of [
    { IdTrip: 1, personIds: [] }, { IdTrip: 1, personIds: [1, 1] },
    { IdTrip: 1, personIds: [1], TotalPrice: 1 }, { IdTrip: 1, personIds: [1], IdUser: 5 }
  ]) assert.equal(v.reservation.safeParse(body).success, false);
});
test('trip validation rejects invalid dates, capacities and writable availability', () => {
  const trip = { TripName: 'Viaje', StartDate: '2027-02-28', EndDate: '2027-03-01', Price: 10, Capacity: 5 };
  assert.equal(v.createTrip.safeParse({ trip, destinations: ['Playa'] }).success, true);
  assert.equal(v.createTrip.safeParse({ trip: { ...trip, StartDate: '2027-02-30' }, destinations: ['Playa'] }).success, false);
  assert.equal(v.createTrip.safeParse({ trip: { ...trip, Capacity: -1 }, destinations: ['Playa'] }).success, false);
  assert.equal(v.updateTrip.safeParse({ OpenPositions: 99 }).success, false);
});
test('passwords never appear in public user serialization', () => {
  assert.deepEqual(publicUser({ IdUser: 1, Pass: 'secret' }), { IdUser: 1 });
  const user = require('../models').Users.build({ IdUser: 1, Pass: 'hash' });
  assert.equal(publicUser(user).Pass, undefined);
});
test('image upload rejects executable content even with an image filename', () => {
  assert.throws(() => extension(Buffer.from('<svg onload="alert(1)">')), { code: 'INVALID_IMAGE' });
  assert.throws(() => extension(Buffer.from('not an image')), { code: 'INVALID_IMAGE' });
});
