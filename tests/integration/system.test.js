const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../models');
const { createUser } = require('../../services/authService');
const reservations = require('../../services/reservationService');
const { createApp } = require('../../app');

let user, admin, people, server, origin;
const marker = Date.now().toString(36);
const future = '2090-01-01';
before(async () => {
  if (process.env.NODE_ENV !== 'test' || !process.env.DB_NAME?.endsWith('Test')) {
    throw new Error('Las pruebas requieren NODE_ENV=test y una base cuyo nombre termine en Test.');
  }
  await db.sequelize.authenticate();
  const personData = { PersonName: 'Prueba', PersonLastname: marker };
  const created = await createUser({ personData, email: marker + '@example.com', password: 'test-password-12345' });
  user = await db.Users.findByPk(created.IdUser, { include: ['Rol', 'Person'] });
  const createdAdmin = await createUser({ personData, email: 'admin-' + marker + '@example.com', password: 'test-password-12345' }, 'admin');
  admin = await db.Users.findByPk(createdAdmin.IdUser, { include: ['Rol', 'Person'] });
  people = [user.Person, await db.Person.create({ ...personData, OwnerId: user.IdUser })];
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await db.sequelize.close();
});
async function trip(capacity = 1) {
  return db.Trip.create({ TripName: marker, StartDate: future, EndDate: '2090-01-03', Capacity: capacity, Price: '100.05' });
}
function browser() {
  let cookie, token;
  return async (path, method = 'GET', body) => {
    const multipart = body instanceof FormData;
    const response = await fetch(origin + path, {
      method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(token ? { 'X-CSRF-Token': token } : {}), ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {})
    });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const json = await response.json();
    if (json.data?.csrfToken) token = json.data.csrfToken;
    return { status: response.status, json };
  };
}
test('concurrent requests cannot book the final seat twice', async () => {
  const item = await trip();
  const results = await Promise.allSettled(people.map(person => reservations.create(user, { IdTrip: item.IdTrip, personIds: [person.IdPerson] })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failed = results.find(result => result.status === 'rejected');
  assert.equal(failed.reason.code, 'NO_CAPACITY');
  assert.equal(await reservations.occupied(item.IdTrip), 1);
});
test('discount and passenger snapshots survive later edits; cancellation is idempotent', async () => {
  const item = await trip();
  await db.Ofert.create({ IdTrip: item.IdTrip, Discount: '12.50', StartDate: '2020-01-01', EndDate: future });
  const result = await reservations.create(user, { IdTrip: item.IdTrip, personIds: [people[0].IdPerson] });
  assert.equal(Number(result.TotalPrice), 87.54);
  const snapshot = result.Passengers[0].PersonName;
  await people[0].update({ PersonName: 'Nuevo nombre' });
  await item.update({ Price: 999 });
  assert.equal((await db.Reservation.findByPk(result.IdReservation, { include: ['Passengers'] })).Passengers[0].PersonName, snapshot);
  await reservations.cancel(user, result.IdReservation);
  await reservations.cancel(user, result.IdReservation);
  assert.equal(await reservations.occupied(item.IdTrip), 0);
  assert.equal(await db.AuditLog.count({ where: { EntityId: result.IdReservation, Action: 'reservation.cancel' } }), 1);
});
test('duplicate passengers and passengers owned by another account cannot be booked', async () => {
  const item = await trip(5);
  await reservations.create(user, { IdTrip: item.IdTrip, personIds: [people[1].IdPerson] });
  await assert.rejects(reservations.create(user, { IdTrip: item.IdTrip, personIds: [people[1].IdPerson] }), { code: 'PASSENGER_ALREADY_BOOKED' });
  await assert.rejects(reservations.create(user, { IdTrip: item.IdTrip, personIds: [admin.Person.IdPerson] }), { code: 'INVALID_PASSENGERS' });
});
test('failed passenger insert rolls back reservation and leaves seats available', async () => {
  const item = await trip();
  const original = db.ReservationPassenger.bulkCreate;
  db.ReservationPassenger.bulkCreate = async () => { throw new Error('simulated insert failure'); };
  try { await assert.rejects(reservations.create(user, { IdTrip: item.IdTrip, personIds: [people[0].IdPerson] }), /simulated/); }
  finally { db.ReservationPassenger.bulkCreate = original; }
  assert.equal(await db.Reservation.count({ where: { IdTrip: item.IdTrip } }), 0);
  assert.equal(await reservations.occupied(item.IdTrip), 0);
});
test('only an administrator can cancel after departure and must give a reason', async () => {
  const item = await trip();
  const result = await reservations.create(user, { IdTrip: item.IdTrip, personIds: [people[0].IdPerson] });
  await item.update({ StartDate: '2020-01-01' });
  await assert.rejects(reservations.cancel(user, result.IdReservation), { code: 'CANCELLATION_CLOSED' });
  await assert.rejects(reservations.cancel(admin, result.IdReservation), { code: 'REASON_REQUIRED' });
  await reservations.cancel(admin, result.IdReservation, 'Corrección administrativa');
  assert.equal(await reservations.occupied(item.IdTrip), 0);
});
test('database-backed session supports login, protected reads and real logout', async () => {
  const request = browser();
  assert.equal((await request('/api/user/csrf')).status, 200);
  const login = await request('/api/user/login', 'POST', { email: user.Email, password: 'test-password-12345' });
  assert.equal(login.status, 200);
  assert.equal(login.json.data.user.Pass, undefined);
  assert.equal((await request('/api/user/me')).status, 200);
  const peopleResult = await request('/api/person');
  assert.equal(peopleResult.status, 200);
  assert.ok(peopleResult.json.data.items.every(person => person.OwnerId === user.IdUser));
  const own = await request('/api/reservations/mine');
  assert.equal(own.status, 200);
  assert.equal((await request('/api/trips')).status, 200);
  assert.equal((await request('/api/user/logout', 'POST')).status, 200);
  assert.equal((await request('/api/user/me')).status, 401);
});
test('admin routes reject missing offers, protect dates and capacity, and cancel whole trips', async () => {
  const request = browser();
  await request('/api/user/csrf');
  await request('/api/user/login', 'POST', { email: admin.Email, password: 'test-password-12345' });
  const creation = await request('/api/trips', 'POST', {
    trip: { TripName: marker, StartDate: future, EndDate: '2090-01-03', Price: 200, Capacity: 2 },
    destinations: ['Playa']
  });
  assert.equal(creation.status, 201);
  const id = creation.json.data.IdTrip;
  await reservations.create(user, { IdTrip: id, personIds: people.map(person => person.IdPerson) });
  assert.equal((await request('/api/trips/' + id, 'PUT', { Capacity: 1 })).status, 409);
  assert.equal((await request('/api/trips/' + id, 'PUT', { StartDate: '2090-01-02' })).status, 409);
  assert.equal((await request('/api/oferts/2147483647', 'PUT', {
    IdTrip: id, Discount: 10, StartDate: '2020-01-01', EndDate: future
  })).status, 404);
  assert.equal((await request('/api/trips/' + id + '/reservations')).status, 200);
  assert.equal((await request('/api/trips/' + id + '/cancel', 'POST', { reason: 'Viaje cancelado' })).status, 200);
  assert.equal(await reservations.occupied(id), 0);
});


test('image uploads, associations and deletion work with actual files and SQL', async () => {
  const sharp = require('sharp');
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const request = browser();
  await request('/api/user/csrf');
  await request('/api/user/login', 'POST', { email: admin.Email, password: 'test-password-12345' });
  const created = await request('/api/trips', 'POST', {
    trip: { TripName: marker + '-image', StartDate: future, EndDate: '2090-01-03', Price: 100, Capacity: 2 },
    destinations: ['Montaña']
  });
  assert.equal(created.status, 201);
  const item = created.json.data;
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#112233' } }).png().toBuffer();
  const upload = new FormData();
  upload.set('IdTrip', String(item.IdTrip));
  upload.append('images', new Blob([image], { type: 'image/png' }), 'image.png');
  const response = await request('/api/images/upload', 'POST', upload);
  assert.equal(response.status, 201);
  const uploaded = response.json.data[0];
  const imagePath = path.join(__dirname, '..', '..', uploaded.ImgURL);
  try {
    assert.equal((await fetch(origin + uploaded.ImgURL)).status, 200);
    const relation = await request('/api/tripImageDestinies', 'POST', {
      IdTrip: item.IdTrip, IdDestiny: item.Destinations[0].IdDestiny, IdImg: uploaded.IdImg
    });
    assert.equal(relation.status, 201);
    const details = await request('/api/tripImageDestinies/' + relation.json.data.IdTripImageDestiny);
    assert.equal(details.status, 200);
    assert.equal(details.json.data.Image.IdImg, uploaded.IdImg);
    assert.equal((await request('/api/images/' + uploaded.IdImg, 'DELETE')).status, 200);
    await assert.rejects(fs.access(imagePath), { code: 'ENOENT' });
    assert.equal(await db.TripImageDestiny.count({ where: { IdImg: uploaded.IdImg } }), 0);
  } finally {
    await fs.unlink(imagePath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
});

test('changing password invalidates every existing database session', async () => {
  const first = browser(), second = browser();
  for (const request of [first, second]) {
    await request('/api/user/csrf');
    assert.equal((await request('/api/user/login', 'POST', { email: user.Email, password: 'test-password-12345' })).status, 200);
  }
  assert.equal((await first('/api/user/change-password', 'POST', {
    currentPassword: 'test-password-12345', password: 'new-test-password-12345'
  })).status, 200);
  assert.equal((await first('/api/user/me')).status, 401);
  assert.equal((await second('/api/user/me')).status, 401);
  await first('/api/user/csrf');
  assert.equal((await first('/api/user/login', 'POST', { email: user.Email, password: 'test-password-12345' })).status, 401);
  assert.equal((await first('/api/user/login', 'POST', { email: user.Email, password: 'new-test-password-12345' })).status, 200);
});
