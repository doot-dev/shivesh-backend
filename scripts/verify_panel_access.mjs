// Panel role engine check (2026-09-28). Creates throw-away roles + users,
// checks what each may read and write, then deletes them. LOCAL DB only.
//
//   BASE=http://localhost:3002 ADMIN_USER=amit.joshi ADMIN_PASS=123456 node scripts/verify_panel_access.mjs
import assert from 'node:assert/strict';
import db from '../src/config/database.js';

const BASE = `${process.env.BASE ?? 'http://localhost:3001'}/api/v1/admin`;
const call = async (token, method, path, body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const login = async (userName, password) => (await call(null, 'POST', '/auth', { userName, password })).body?.data?.token;

const admin = await login(process.env.ADMIN_USER ?? 'amit.joshi', process.env.ADMIN_PASS ?? '123456');
assert.ok(admin, 'admin login');

const project = await db.project.findFirst({ where: { isDeleted: false, projectProducts: { some: {} } }, select: { projectId: true, client: { select: { clientId: true } } } });
const vendor = await db.vendor.findFirst({ where: { isDeleted: false }, select: { id: true } });
const P = project.projectId; const C = project.client.clientId;

const made = [];
async function persona(name, permissions) {
  const role = await call(admin, 'POST', '/roles', { name, description: 'verify_panel_access', permissions });
  assert.ok([200, 201].includes(role.status), `create role ${name}: ${JSON.stringify(role.body)}`);
  const roleId = role.body.data.id;
  const userName = name.toLowerCase().replace(/\W+/g, '.');
  made.push({ roleId, userName });
  const user = await call(admin, 'POST', '/user', { name, employeeId: `QA-${roleId}`, userName, password: 'Qa@12345', role: 'PROJECT_MANAGER', roleId });
  assert.ok([200, 201].includes(user.status), `create user ${name}: ${JSON.stringify(user.body)}`);
  const token = await login(userName, 'Qa@12345');
  assert.ok(token, `login ${userName}`);
  return token;
}

const expect = async (token, cases) => {
  for (const [method, path, want, body] of cases) {
    const r = await call(token, method, path, body ?? (method === 'GET' ? undefined : {}));
    const ok = Array.isArray(want) ? want.includes(r.status) : r.status === want;
    assert.ok(ok, `${method} ${path}: got ${r.status}, want ${want}`);
  }
};

try {
  // 1. Books orders only: every dropdown must load, no master data may change.
  const taker = await persona('QA Order Taker', ['orders.view', 'orders.create']);
  await expect(taker, [
    ['GET', '/client/list', 200], ['GET', '/project/list', 200], ['GET', '/product', 200],
    ['GET', '/vendor', 200], ['GET', `/vendor/${vendor.id}/locations`, 200], ['GET', '/subcategory', 200],
    ['GET', '/orders/field-techs', 200], ['GET', `/project/${P}/product/list`, 200],
    ['GET', `/client/${C}`, 403], ['POST', '/project/product/create', 403], ['PUT', `/project/${P}/technicians`, 403],
    ['POST', '/vendor/locations', 403], ['PUT', `/client/${C}/credit`, 403], ['GET', `/reports/clients/${C}/credit`, 403],
    ['POST', '/orders', [400, 404, 422]], // through the guard; the empty body is refused by validation
  ]);

  // 2. Views projects and the credit gauge, nothing else.
  const viewer = await persona('QA Project Viewer', ['projects.view', 'projectProducts.view', 'creditScore.view']);
  await expect(viewer, [
    ['GET', `/project/${P}`, 200], ['GET', `/project/${P}/product/list`, 200],
    ['POST', '/project/product/create', 403], ['PUT', '/project/product', 403], ['PUT', `/project/${P}/technicians`, 403],
    ['POST', '/project/PRJ-2026-0010/commissions', 403], ['PUT', '/project', 403],
  ]);
  const gauge = (await call(viewer, 'GET', `/reports/clients/${C}/credit`)).body.data;
  assert.deepEqual(Object.keys(gauge).sort(), ['band', 'position', 'usedPct'], 'creditScore.view alone: gauge, no amounts');

  // 3. Amounts only: the ₹ line without the gauge.
  const money = await persona('QA Credit Amounts', ['creditAmounts.view']);
  const amounts = (await call(money, 'GET', `/reports/clients/${C}/credit`)).body.data;
  assert.ok('limit' in amounts && !('band' in amounts), 'creditAmounts.view alone: amounts, no gauge');

  // 4. Client viewer without the KYC / credit / team sub-modules sees none of them.
  const clientViewer = await persona('QA Client Viewer', ['clients.view']);
  const details = (await call(clientViewer, 'GET', `/client/${C}`)).body.data;
  assert.ok(!('kycDocuments' in details) && !('creditLimit' in details), 'no KYC/credit without their sub-permissions');
  await expect(clientViewer, [['GET', `/client/${C}/contacts`, 403], ['POST', '/client/upload-kyc', 403]]);

  console.log('verify_panel_access: OK (lookups open, sub-modules gated, credit gauge/amounts split)');
} finally {
  for (const { roleId, userName } of made) {
    await db.user.deleteMany({ where: { userName } });
    await db.rolePermission.deleteMany({ where: { roleId } });
    await db.role.delete({ where: { id: roleId } }).catch(() => {});
  }
  await db.$disconnect();
}
