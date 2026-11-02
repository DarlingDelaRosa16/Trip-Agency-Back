const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('../models');
const { createApp } = require('../app');

let server, origin, hash;
const user = { IdUser: 7, IdPerson: 3, Email: 'client@example.com', Rol: { RolName: 'client' }, AuthVersion: 0 };
const original = { findByPk: db.Users.findByPk, scope: db.Users.scope, personFind: db.Person.findOne, transaction: db.sequelize.transaction };
before(async () => {
  hash = await bcrypt.hash('correct-password-123', 4);
  db.Users.findByPk = async id => id === 7 ? user : null;
  db.Users.scope = () => ({ findOne: async ({ where }) => where.Email === user.Email ? { ...user, Pass: hash } : null });
  db.Person.findOne = async () => null;
  const app = createApp({ secret: 'test-secret'.repeat(8), store: new session.MemoryStore() });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  db.Users.findByPk = original.findByPk;
  db.Users.scope = original.scope;
  db.Person.findOne = original.personFind;
  db.sequelize.transaction = original.transaction;
  if (server) await new Promise(resolve => server.close(resolve));
  await db.sequelize.close();
});
function client() {
  let cookie, token;
  return {
    async request(path, options = {}) {
      const response = await fetch(origin + path, {
        ...options, headers: {
          ...(cookie ? { Cookie: cookie } : {}), ...(token ? { 'X-CSRF-Token': token } : {}),
          ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers
        }, body: options.body ? JSON.stringify(options.body) : undefined
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const json = await response.json();
      if (json.data?.csrfToken) token = json.data.csrfToken;
      return { response, json };
    }
  };
}
test('protected data requires authentication', async () => {
  const result = await client().request('/api/person');
  assert.equal(result.response.status, 401);
});
test('mutations require CSRF even for login', async () => {
  const result = await client().request('/api/user/login', { method: 'POST', body: { email: user.Email, password: 'correct-password-123' } });
  assert.equal(result.response.status, 403);
  assert.equal(result.json.error.code, 'CSRF_INVALID');
});
test('login uses bcrypt, renews session, returns no password and enforces permissions', async () => {
  const browser = client();
  await browser.request('/api/user/csrf');
  const bad = await browser.request('/api/user/login', { method: 'POST', body: { email: user.Email, password: 'incorrect-password' } });
  assert.equal(bad.response.status, 401);
  const login = await browser.request('/api/user/login', { method: 'POST', body: { email: user.Email, password: 'correct-password-123' } });
  assert.equal(login.response.status, 200);
  assert.equal(login.json.data.user.Pass, undefined);
  assert.match(login.response.headers.get('set-cookie'), /HttpOnly/);
  const me = await browser.request('/api/user/me');
  assert.equal(me.json.data.user.IdUser, 7);
  const roles = await browser.request('/api/roles');
  assert.equal(roles.response.status, 403);
  const trip = await browser.request('/api/trips', { method: 'POST', body: {} });
  assert.equal(trip.response.status, 403);
  const otherPerson = await browser.request('/api/person/123');
  assert.equal(otherPerson.response.status, 404);
  const tampered = await browser.request('/api/reservations', { method: 'POST', body: { IdTrip: 1, personIds: [3], TotalPrice: 1 } });
  assert.equal(tampered.response.status, 422);
  const logout = await browser.request('/api/user/logout', { method: 'POST' });
  assert.equal(logout.response.status, 200);
  assert.equal((await browser.request('/api/user/me')).response.status, 401);
});
test('untrusted origins and malformed JSON are rejected without leaking SQL', async () => {
  const forbidden = await client().request('/api/user/csrf', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(forbidden.response.status, 403);
  const response = await fetch(origin + '/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_JSON');
});
test('legacy passenger routes have an explicit migration response', async () => {
  const result = await client().request('/api/reservacionUserPersons/1');
  assert.equal(result.response.status, 410);
});
test('internal failures return a generic error with a request identifier', async () => {
  const browser = client();
  await browser.request('/api/user/csrf');
  db.sequelize.transaction = async () => { throw new Error('SQL containing private credentials'); };
  const result = await browser.request('/api/user/create', {
    method: 'POST', body: { email: 'new@example.com', password: 'secure-password-123', personData: { PersonName: 'Ana', PersonLastname: 'Perez' } }
  });
  assert.equal(result.response.status, 500);
  assert.equal(JSON.stringify(result.json).includes('private credentials'), false);
  assert.ok(result.json.error.requestId);
  db.sequelize.transaction = original.transaction;
});

test('password version changes invalidate existing sessions', async () => {
  const browser = client();
  await browser.request('/api/user/csrf');
  await browser.request('/api/user/login', { method: 'POST', body: { email: user.Email, password: 'correct-password-123' } });
  user.AuthVersion = 1;
  try {
    const result = await browser.request('/api/user/me');
    assert.equal(result.response.status, 401);
    assert.equal(result.json.error.code, 'SESSION_EXPIRED');
  } finally { user.AuthVersion = 0; }
});
