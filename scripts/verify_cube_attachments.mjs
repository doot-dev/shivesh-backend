// Self-check for cube tests from the client app with many attachments (014):
// Owner / Site Engineer log and edit tests and add files at any time, Accounts
// can't, a client may remove only files a client contact added, and
// CubeTest.fileUrl always mirrors the newest live attachment.
// Needs the demo contacts (backfill_client_contacts.mjs --demo), migration 014
// and a running backend. Cleans up after itself (soft-deletes its test).
//
//   BASE=http://localhost:3001 node scripts/verify_cube_attachments.mjs
import assert from 'node:assert/strict';
import 'dotenv/config';
import db from '../src/config/database.js';

const BASE = `${process.env.BASE ?? 'http://localhost:3001'}/api/v1/mobile/client`;

async function call(token, method, path, { json, form } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(json && { 'Content-Type': 'application/json' }), ...(token && { authorization: token }) },
    body: form ?? (json ? JSON.stringify(json) : undefined),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(phone) {
  const r = await call(null, 'POST', '/auth/verify-otp', { json: { phone, otp: '1111' } });
  assert.equal(r.status, 200, `login ${phone}: ${r.body?.message}`);
  return r.body.data.token;
}

const pdf = (name) => [new Blob(['%PDF-1.4\n% verify\n'], { type: 'application/pdf' }), name];
function form(fields, files = [], field = 'files') {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const [blob, name] of files) f.append(field, blob, name);
  return f;
}

const owner = await login('9000000111');
const engineer = await login('9000000333');
const accounts = await login('9000000444');

// A delivered concrete order in the engineer's project, delivery date not in the future.
const today = new Date().toLocaleDateString('en-CA');
const engOrders = (await call(engineer, 'GET', '/orders?limit=200')).body.data;
const list = Array.isArray(engOrders) ? engOrders : engOrders.orders ?? engOrders.items;
const order = list.find((o) => o.date && o.date <= today && o.status !== 'CANCELLED');
assert.ok(order, 'no delivered order in the engineer\'s project to test on');
const path = `/orders/${order.orderId}/cube-test`;
console.log(`testing on ${order.orderId} (${order.date})`);

// 1. Owner logs a test with two files.
let r = await call(owner, 'POST', path, { form: form({ castingDate: order.date, quantity: '3', period: 'SEVEN_DAYS' }, [pdf('a.pdf'), pdf('b.pdf')]) });
assert.equal(r.status, 201, r.body?.message);
const ct = r.body.data;
assert.equal(ct.attachments.length, 2);
assert.equal(ct.status, 'RESULT_ADDED');
assert.equal(ct.addedByType, 'CLIENT_CONTACT');
assert.equal(ct.fileUrl, ct.attachments[1].fileUrl, 'fileUrl mirrors the newest attachment');

// 2. Site Engineer edits it and adds a file later (old single `file` field too).
r = await call(engineer, 'PUT', `${path}/${ct.id}`, { form: form({ quantity: '6' }, [pdf('c.pdf')], 'file') });
assert.equal(r.status, 200, r.body?.message);
assert.equal(r.body.data.quantity, '6');
assert.equal(r.body.data.attachments.length, 3);
assert.equal(r.body.data.attachments[2].addedByName, 'Rakesh Pawar');

// 3. Accounts may view but not log or edit.
assert.equal((await call(accounts, 'POST', path, { form: form({ castingDate: order.date, quantity: '3', period: 'SEVEN_DAYS' }) })).status, 403);
r = await call(accounts, 'PUT', `${path}/${ct.id}`, { form: form({ quantity: '9' }) });
assert.equal(r.status, 403);
assert.equal(r.body.code, 'ROLE_FORBIDDEN', 'the app must not log out on this 403');

// 4. A file the lab added can't be removed from the client app; the client's own can.
const lab = await db.cubeTestAttachment.create({
  data: { cubeTestId: ct.id, fileUrl: '/uploads/cube-tests/x/lab.pdf', fileName: 'lab.pdf', addedByType: 'FIELD_TECH', createdAt: new Date(Date.now() + 60_000) },
});
await db.cubeTest.update({ where: { id: ct.id }, data: { fileUrl: lab.fileUrl } });
r = await call(owner, 'DELETE', `${path}/${ct.id}/attachments/${lab.id}`);
assert.equal(r.status, 403);
assert.equal(r.body.code, 'ROLE_FORBIDDEN');
r = await call(owner, 'DELETE', `${path}/${ct.id}/attachments/${ct.attachments[0].id}`);
assert.equal(r.status, 200, r.body?.message);
assert.equal(r.body.data.attachments.length, 3);
assert.equal(r.body.data.fileUrl, lab.fileUrl, 'newest live attachment still mirrored');

// 5. Removing every file drops the test back to SCHEDULED/DUE.
await db.cubeTestAttachment.updateMany({ where: { cubeTestId: ct.id }, data: { isDeleted: true } });
const last = await db.cubeTestAttachment.create({ data: { cubeTestId: ct.id, fileUrl: '/uploads/x.pdf', addedByType: 'CLIENT_CONTACT' } });
r = await call(owner, 'DELETE', `${path}/${ct.id}/attachments/${last.id}`);
assert.equal(r.status, 200);
assert.equal(r.body.data.fileUrl, null);
assert.notEqual(r.body.data.status, 'RESULT_ADDED');

// 6. Lists carry the attachments; bad input and other clients' orders are refused.
r = await call(engineer, 'GET', path);
assert.equal(r.status, 200);
assert.ok(Array.isArray(r.body.data.find((t) => t.id === ct.id).attachments));
r = await call(owner, 'GET', `/cube-tests?dateFrom=${order.date}&dateTo=${order.date}`);
assert.ok(Array.isArray(r.body.data.find((t) => t.id === ct.id)?.attachments), 'feed row has attachments');
assert.equal((await call(owner, 'POST', path, { form: form({ castingDate: order.date, quantity: '3', period: 'NINE_DAYS' }) })).status, 422);
assert.equal((await call(owner, 'POST', '/orders/ORD-0000-0000/cube-test', { form: form({ castingDate: order.date, quantity: '3', period: 'SEVEN_DAYS' }) })).status, 404);

await db.cubeTest.update({ where: { id: ct.id }, data: { isDeleted: true } });
await db.$disconnect();
console.log('verify_cube_attachments: all checks passed');
