// =====================================================================
//  End-to-end API tests — one block per functional requirement.
//  Uses only Node's built-in test runner and fetch (no third-party libs).
//
//    1. npm run db:setup     (fresh sample data)
//    2. npm start            (in another terminal)
//    3. npm test
// =====================================================================
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const PASSWORD = 'Password123';
const stamp = Date.now();

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const login = async (email, password = PASSWORD) => (await api('POST', '/auth/login', { body: { email, password } })).data.token;

let admin; let owner; let customer; let otherCustomer; let otherOwner;
let customerId; let restaurantId; let dishId; let reviewId;

before(async () => {
  const health = await fetch(BASE + '/health').catch(() => null);
  if (!health || !health.ok) throw new Error(`Server not reachable at ${BASE}. Start it with "npm start" first.`);
  admin = await login('admin@foodadvisor.kz');
  otherCustomer = await login('timur@mail.kz');
  otherOwner = await login('marco@foodadvisor.kz');
});

describe('FR1 — register, log in, log out', () => {
  test('rejects invalid registration data with field errors (422)', async () => {
    const r = await api('POST', '/auth/register', { body: { name: 'A', email: 'nope', password: '123', role: 'admin' } });
    assert.equal(r.status, 422);
    assert.ok(r.data.details.name && r.data.details.email && r.data.details.password && r.data.details.role);
  });
  test('registers a customer and an owner', async () => {
    const c = await api('POST', '/auth/register', { body: { name: 'Test Customer', email: `cust${stamp}@test.kz`, password: PASSWORD, role: 'customer' } });
    assert.equal(c.status, 201);
    customer = c.data.token;
    customerId = c.data.user.id;
    const o = await api('POST', '/auth/register', { body: { name: 'Test Owner', email: `own${stamp}@test.kz`, password: PASSWORD, role: 'owner' } });
    assert.equal(o.status, 201);
    owner = o.data.token;
  });
  test('refuses a duplicate email (409)', async () => {
    const r = await api('POST', '/auth/register', { body: { name: 'Again', email: `cust${stamp}@test.kz`, password: PASSWORD, role: 'customer' } });
    assert.equal(r.status, 409);
  });
  test('wrong password gives a generic 401', async () => {
    const r = await api('POST', '/auth/login', { body: { email: `cust${stamp}@test.kz`, password: 'Wrong1234' } });
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'Incorrect email or password');
  });
  test('/auth/me returns the logged-in user and never the password hash', async () => {
    const r = await api('GET', '/auth/me', { token: customer });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'customer');
    assert.equal(r.data.user.password_hash, undefined);
  });
  test('logout invalidates the token', async () => {
    const t = await login(`cust${stamp}@test.kz`);
    assert.equal((await api('POST', '/auth/logout', { token: t })).status, 200);
    assert.equal((await api('GET', '/auth/me', { token: t })).status, 401);
  });
});

describe('FR2 — search and filter', () => {
  test('filters by cuisine, city, rating and price together', async () => {
    const r = await api('GET', '/restaurants?city=Almaty&minRating=3&price=3,4&sort=rating');
    assert.equal(r.status, 200);
    r.data.items.forEach((x) => {
      assert.equal(x.city, 'Almaty');
      assert.ok(x.avg_rating >= 3);
      assert.ok([3, 4].includes(x.price_level));
    });
  });
  test('free-text search also matches dishes on the menu', async () => {
    const r = await api('GET', '/restaurants?q=plov');
    assert.ok(r.data.items.some((x) => x.name === 'Samarkand Plov Centre'));
  });
  test('dish search filters vegetarian dishes under a price', async () => {
    const r = await api('GET', '/dishes?vegetarian=1&maxPrice=2000');
    assert.ok(r.data.total > 0);
    r.data.items.forEach((d) => { assert.equal(d.is_vegetarian, 1); assert.ok(d.price <= 2000); });
  });
  test('SQL injection attempts are treated as plain text', async () => {
    const r = await api('GET', `/restaurants?q=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 0);
    assert.equal((await api('GET', '/meta')).status, 200); // users table still exists
  });
  test('pending restaurants are not listed publicly', async () => {
    const r = await api('GET', '/restaurants?q=Baursak');
    assert.ok(!r.data.items.some((x) => x.name === 'Baursak & Co')); // pending in the sample data
  });
});

describe('FR8 / FR12 — restaurant management and approval', () => {
  const body = {
    name: `Test Kitchen ${stamp}`, cuisine_id: 1, description: 'A restaurant created by the automated test suite.',
    city: 'Aktobe', address: 'Test street 1', phone: '+7 700 000 00 00', price_level: 2, opens_at: '09:00', closes_at: '22:00',
  };
  test('customers cannot use owner endpoints (403)', async () => {
    assert.equal((await api('POST', '/owner/restaurants', { token: customer, body })).status, 403);
  });
  test('owner creates a restaurant that starts as pending', async () => {
    const r = await api('POST', '/owner/restaurants', { token: owner, body });
    assert.equal(r.status, 201);
    restaurantId = r.data.id;
    assert.equal((await api('GET', `/restaurants/${restaurantId}`)).status, 404);           // hidden from the public
    assert.equal((await api('GET', `/restaurants/${restaurantId}`, { token: owner })).status, 200); // owner can preview
  });
  test('another owner cannot edit or delete it', async () => {
    assert.equal((await api('PUT', `/owner/restaurants/${restaurantId}`, { token: otherOwner, body })).status, 404);
    assert.equal((await api('DELETE', `/owner/restaurants/${restaurantId}`, { token: otherOwner })).status, 404);
  });
  test('owner updates own restaurant', async () => {
    const r = await api('PUT', `/owner/restaurants/${restaurantId}`, { token: owner, body: { ...body, price_level: 3 } });
    assert.equal(r.status, 200);
  });
  test('admin approves it and it becomes public', async () => {
    assert.equal((await api('PATCH', `/admin/restaurants/${restaurantId}/status`, { token: admin, body: { status: 'approved' } })).status, 200);
    const r = await api('GET', `/restaurants/${restaurantId}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.restaurant.price_level, 3);
  });
});

describe('FR3 / FR9 — dishes', () => {
  test('owner adds, edits and toggles a dish', async () => {
    const add = await api('POST', `/owner/restaurants/${restaurantId}/dishes`, { token: owner, body: { name: 'Test Plov', category: 'Mains', price: 2500, is_vegetarian: false } });
    assert.equal(add.status, 201);
    dishId = add.data.id;
    assert.equal((await api('PUT', `/owner/dishes/${dishId}`, { token: owner, body: { name: 'Test Plov XL', category: 'Mains', price: 3100, is_available: true } })).status, 200);
    assert.equal((await api('PATCH', `/owner/dishes/${dishId}/availability`, { token: owner, body: { is_available: false } })).status, 200);
    const page = await api('GET', `/restaurants/${restaurantId}`);
    const dish = page.data.dishes.find((d) => d.id === dishId);
    assert.equal(dish.name, 'Test Plov XL');
    assert.equal(dish.price, 3100);
    assert.equal(dish.is_available, 0);
  });
  test('negative prices are rejected', async () => {
    const r = await api('POST', `/owner/restaurants/${restaurantId}/dishes`, { token: owner, body: { name: 'Bad', category: 'Mains', price: -5 } });
    assert.equal(r.status, 422);
  });
  test('another owner cannot delete the dish', async () => {
    assert.equal((await api('DELETE', `/owner/dishes/${dishId}`, { token: otherOwner })).status, 404);
  });
});

describe('FR4 / FR5 / FR10 — reviews', () => {
  test('owners cannot write reviews', async () => {
    assert.equal((await api('POST', `/restaurants/${restaurantId}/reviews`, { token: owner, body: { rating: 5, title: 'My own place', comment: 'Trying to review myself.' } })).status, 403);
  });
  test('customer submits a review and the average updates', async () => {
    const r = await api('POST', `/restaurants/${restaurantId}/reviews`, { token: customer, body: { rating: 4, title: 'Nice test', comment: 'Lovely food and friendly staff.', visit_date: '2026-10-01' } });
    assert.equal(r.status, 201);
    reviewId = r.data.id;
    const page = await api('GET', `/restaurants/${restaurantId}`);
    assert.equal(page.data.restaurant.avg_rating, 4);
    assert.equal(page.data.restaurant.review_count, 1);
  });
  test('only one review per restaurant (409)', async () => {
    assert.equal((await api('POST', `/restaurants/${restaurantId}/reviews`, { token: customer, body: { rating: 5, title: 'Again', comment: 'Second review attempt.' } })).status, 409);
  });
  test('future visit dates and out-of-range ratings are rejected', async () => {
    const r = await api('PUT', `/reviews/${reviewId}`, { token: customer, body: { rating: 6, title: 'Bad', comment: 'Invalid rating value here.', visit_date: '2099-01-01' } });
    assert.equal(r.status, 422);
    assert.ok(r.data.details.rating && r.data.details.visit_date);
  });
  test('author edits the review; others cannot', async () => {
    assert.equal((await api('PUT', `/reviews/${reviewId}`, { token: customer, body: { rating: 5, title: 'Even better', comment: 'Came back and it was even better.' } })).status, 200);
    assert.equal((await api('PUT', `/reviews/${reviewId}`, { token: otherCustomer, body: { rating: 1, title: 'Hack', comment: 'Editing someone else.' } })).status, 403);
  });
  test('helpful vote toggles', async () => {
    const a = await api('POST', `/reviews/${reviewId}/helpful`, { token: otherCustomer });
    assert.deepEqual([a.data.voted, a.data.helpful_count], [true, 1]);
    const b = await api('POST', `/reviews/${reviewId}/helpful`, { token: otherCustomer });
    assert.deepEqual([b.data.voted, b.data.helpful_count], [false, 0]);
  });
  test('owner sees the review and replies publicly', async () => {
    const list = await api('GET', `/owner/reviews?restaurant=${restaurantId}`, { token: owner });
    assert.ok(list.data.items.some((x) => x.id === reviewId));
    assert.equal((await api('PUT', `/owner/reviews/${reviewId}/reply`, { token: owner, body: { reply: 'Thank you for visiting!' } })).status, 200);
    assert.equal((await api('PUT', `/owner/reviews/${reviewId}/reply`, { token: otherOwner, body: { reply: 'Not my restaurant' } })).status, 404);
  });
});

describe('FR6 / FR7 — profile and favourites', () => {
  test('customer updates profile', async () => {
    const r = await api('PUT', '/me', { token: customer, body: { name: 'Test Customer Updated', email: `cust${stamp}@test.kz`, city: 'Almaty', bio: 'Automated tester' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.city, 'Almaty');
  });
  test('cannot take another user\'s email', async () => {
    const r = await api('PUT', '/me', { token: customer, body: { name: 'X Y', email: 'admin@foodadvisor.kz' } });
    assert.equal(r.status, 409);
  });
  test('favourites: save, sync from guest storage, remove', async () => {
    assert.equal((await api('PUT', `/me/favorites/${restaurantId}`, { token: customer })).status, 200);
    const sync = await api('POST', '/me/favorites/sync', { token: customer, body: { ids: [1, 2, 99999] } });
    assert.ok(sync.data.ids.includes(restaurantId) && sync.data.ids.includes(1) && !sync.data.ids.includes(99999));
    assert.equal((await api('DELETE', `/me/favorites/${restaurantId}`, { token: customer })).status, 200);
    const ids = (await api('GET', '/me/favorites/ids', { token: customer })).data.ids;
    assert.ok(!ids.includes(restaurantId));
  });
  test('password change requires the current password', async () => {
    assert.equal((await api('PUT', '/me/password', { token: customer, body: { current_password: 'nope', new_password: 'NewPass123' } })).status, 422);
    assert.equal((await api('PUT', '/me/password', { token: customer, body: { current_password: PASSWORD, new_password: 'NewPass123' } })).status, 200);
    assert.ok(await login(`cust${stamp}@test.kz`, 'NewPass123'));
  });
});

describe('FR11 / FR13 — administration and moderation', () => {
  test('non-admins cannot open admin endpoints', async () => {
    assert.equal((await api('GET', '/admin/users', { token: customer })).status, 403);
    assert.equal((await api('GET', '/admin/users', { token: owner })).status, 403);
    assert.equal((await api('GET', '/admin/users')).status, 401);
  });
  test('report → admin hides the review → rating recalculated', async () => {
    assert.equal((await api('POST', `/reviews/${reviewId}/report`, { token: otherCustomer, body: { reason: 'fake' } })).status, 201);
    const reports = await api('GET', '/admin/reports?status=open', { token: admin });
    const report = reports.data.items.find((p) => p.review_id === reviewId);
    assert.ok(report);
    assert.equal((await api('PATCH', `/admin/reports/${report.id}`, { token: admin, body: { action: 'hide' } })).status, 200);
    const page = await api('GET', `/restaurants/${restaurantId}`);
    assert.equal(page.data.restaurant.review_count, 0);
  });
  test('blocking a user logs them out and prevents login', async () => {
    assert.equal((await api('PUT', `/admin/users/${customerId}`, { token: admin, body: { role: 'customer', status: 'blocked' } })).status, 200);
    assert.equal((await api('GET', '/auth/me', { token: customer })).status, 401);
    assert.equal((await api('POST', '/auth/login', { body: { email: `cust${stamp}@test.kz`, password: 'NewPass123' } })).status, 403);
  });
  test('admin edits any restaurant\'s information', async () => {
    const r = await api('PUT', `/admin/restaurants/${restaurantId}`, { token: admin, body: {
      name: 'Renamed by admin', cuisine_id: 1, description: 'Description corrected by an administrator.', city: 'Aktobe', address: 'Test street 2', price_level: 1,
    } });
    assert.equal(r.status, 200);
    assert.equal((await api('GET', `/restaurants/${restaurantId}`)).data.restaurant.name, 'Renamed by admin');
  });
});

after(async () => {
  // clean up everything the tests created (cascades remove dishes, reviews, favourites…)
  if (restaurantId) await api('DELETE', `/admin/restaurants/${restaurantId}`, { token: admin });
  const users = await api('GET', `/admin/users?q=${stamp}`, { token: admin });
  for (const u of users.data.items || []) await api('DELETE', `/admin/users/${u.id}`, { token: admin });
});
