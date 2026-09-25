// Self-check for client team access (docs/06): each demo role against each
// guarded route, project scope, old-token fallback, and instant deactivation.
// Needs the demo contacts (scripts/backfill_client_contacts.mjs --demo) and a
// running backend.
//
//   BASE=http://localhost:3001 node scripts/verify_client_access.mjs
import assert from 'node:assert/strict';
import 'dotenv/config';
import { generateToken } from '../src/config/jwtConfig.js';
import db from '../src/config/database.js';

const BASE = `${process.env.BASE ?? 'http://localhost:3001'}/api/v1/mobile/client`;

async function call(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { authorization: token }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(phone) {
  const r = await call(null, 'POST', '/auth/verify-otp', { phone, otp: '1111' });
  assert.equal(r.status, 200, `login ${phone}: ${r.body?.message}`);
  return r.body.data.token;
}

const owner = await login('9000000111');
const engineer = await login('9000000333');
const accounts = await login('9000000444');

// Who am I
const meOwner = (await call(owner, 'GET', '/me')).body.data;
const meEng = (await call(engineer, 'GET', '/me')).body.data;
assert.equal(meOwner.role.name, 'Owner');
assert.equal(meEng.role.name, 'Site Engineer');
assert.equal(meEng.allProjects, false);
assert.ok(!meEng.permissions.includes('bills.view'));

// Route × role: [method, path, body, owner, engineer, accounts]
// A POST with an empty body answers 400 once the guard lets it through.
const matrix = [
  ['GET', '/orders', null, 200, 200, 200],
  ['POST', '/orders', {}, 400, 400, 403],
  ['POST', '/orders/ORD-0000-0000/cancel', {}, 400, 403, 403],
  ['POST', '/orders/ORD-0000-0000/comments', {}, 400, 400, 403],
  ['POST', '/orders/ORD-0000-0000/tm/x/reject', {}, 400, 400, 403],
  ['GET', '/cube-tests', null, 200, 200, 403],
  ['GET', '/bills', null, 200, 403, 200],
  ['GET', '/credit', null, 200, 403, 200],
  ['GET', '/ledger', null, 200, 403, 200],
  ['GET', '/payments', null, 200, 403, 200],
  ['GET', '/team', null, 200, 403, 403],
  ['GET', '/roles', null, 200, 403, 403],
  ['GET', '/projects', null, 200, 200, 200],
  ['GET', '/profile', null, 200, 200, 200],
  ['GET', '/notifications', null, 200, 200, 200],
];
for (const [method, path, body, ...want] of matrix) {
  const got = [];
  for (const token of [owner, engineer, accounts]) {
    const r = await call(token, method, path, body);
    got.push(r.status);
    if (r.status === 403) assert.equal(r.body.code, 'ROLE_FORBIDDEN', `${method} ${path} 403 must say ROLE_FORBIDDEN`);
  }
  assert.deepEqual(got, want, `${method} ${path}: owner/engineer/accounts`);
}

// Project scope: the engineer sees only his projects, and only their orders.
const scope = new Set(meEng.projects.map((p) => p.projectId));
for (const p of (await call(engineer, 'GET', '/projects')).body.data) assert.ok(scope.has(p.projectId), `project ${p.projectId} leaked`);
for (const type of ['active', 'past']) {
  for (const o of (await call(engineer, 'GET', `/orders?type=${type}&limit=200`)).body.data) {
    assert.ok(scope.has(o.project.projectId), `order ${o.orderId} leaked`);
  }
}

// A token from an old app build (no contactId) acts as the Owner.
const sahyadri = await db.client.findFirst({ where: { clientId: 'CL-2026-0010' } });
const legacy = generateToken({ type: 'CLIENT', id: sahyadri.id, clientId: sahyadri.clientId, name: sahyadri.companyName, phone: sahyadri.contactNumber });
assert.equal((await call(legacy, 'GET', '/me')).body.data.role.name, 'Owner');

// Team rules for the owner in the app.
const team = (await call(owner, 'GET', '/team')).body.data;
const rakesh = team.find((c) => c.phone === '9000000333');
const ownerRole = await db.clientRole.findFirst({ where: { isSystem: true } });
assert.equal((await call(owner, 'POST', '/team', { name: 'X', phone: '9000000999', roleId: ownerRole.id })).status, 403, 'app cannot make an Owner');
assert.notEqual((await call(owner, 'PUT', `/team/${meOwner.contactId}`, { isActive: false })).status, 200, 'owner cannot switch themselves off');
assert.equal((await call(owner, 'POST', '/team', { name: 'X', phone: '9900112233', roleId: rakesh.role.id })).status, 409, 'Q6: number of another company');

// Deactivation takes effect on the very next request; reactivation restores it.
assert.equal((await call(owner, 'PUT', `/team/${rakesh.id}`, { isActive: false })).status, 200);
assert.equal((await call(engineer, 'GET', '/me')).status, 401, 'deactivated contact must be refused');
assert.equal((await call(owner, 'PUT', `/team/${rakesh.id}`, { isActive: true })).status, 200);
assert.equal((await call(engineer, 'GET', '/me')).status, 200);

console.log(`verify_client_access: OK (${matrix.length} routes × 3 roles, scope, legacy token, team rules, deactivation)`);
await db.$disconnect();
