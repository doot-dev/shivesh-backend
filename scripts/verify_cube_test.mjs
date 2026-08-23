/**
 * End-to-end proof of the field-technician CUBE TEST api.
 *
 * Builds a complete throwaway graph (client -> project -> order -> technician
 * assignment), logs in as that technician over real HTTP, then exercises the
 * cube-test endpoints — including the authorization boundary that a technician
 * who is NOT assigned to an order cannot see or touch its cube tests.
 *
 * Every row it creates is deleted again in the finally block.
 *
 *   node scripts/verify_cube_test.mjs
 */
import db from '../src/config/database.js';
import { hashPassword } from '../src/helper/passwordHelper.js';

const BASE = `http://localhost:${process.env.PORT || 3001}/api/v1/mobile`;
const PASSWORD = 'Verify#12345';
const STAMP = Date.now();

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { authorization: token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const ids = {
  tech: null,
  otherTech: null,
  client: null,
  project: null,
  order: null,
  assignment: null,
};

try {
  // ── Fixtures ───────────────────────────────────────────────────────────────
  const tech = await db.user.create({
    data: {
      name: 'Cube Verify Tech',
      employeeId: `EMP-CUBE-${STAMP}`,
      userName: `__cube_tech_${STAMP}`,
      password: hashPassword(PASSWORD),
      role: 'FIELD_TECHNICIAN',
      menuAccess: {},
    },
  });
  ids.tech = tech.id;

  const otherTech = await db.user.create({
    data: {
      name: 'Unassigned Tech',
      employeeId: `EMP-CUBE2-${STAMP}`,
      userName: `__cube_other_${STAMP}`,
      password: hashPassword(PASSWORD),
      role: 'FIELD_TECHNICIAN',
      menuAccess: {},
    },
  });
  ids.otherTech = otherTech.id;

  const client = await db.client.create({
    data: {
      clientId: `CL-VERIFY-${STAMP}`,
      companyName: 'Cube Verify Client',
      ownerName: 'Owner',
      contactNumber: '9000000002',
      email: `cube_verify_${STAMP}@example.test`,
      address: 'Test address',
    },
  });
  ids.client = client.id;

  const project = await db.project.create({
    data: {
      projectId: `PR-VERIFY-${STAMP}`,
      projectName: 'Cube Verify Project',
      clientId: client.id,
      siteName: 'Test Site',
      projectLocation: 'Test Location',
    },
  });
  ids.project = project.id;

  const order = await db.order.create({
    data: {
      orderId: `ORD-VERIFY-${STAMP}`,
      projectId: project.id,
      clientId: client.id,
      productName: 'RMC',
      productGrade: 'M25',
      quantity: '30',
      status: 'IN_PROGRESS',
      deliveryStatus: 'IN_TRANSIT',
    },
  });
  ids.order = order.id;

  const assignment = await db.orderTechnician.create({
    data: { orderId: order.id, userId: tech.id },
  });
  ids.assignment = assignment.id;

  console.log(`Fixtures ready — order ${order.orderId}\n`);

  // ── Log in as both technicians ─────────────────────────────────────────────
  const login = await api('POST', '/tech/auth/login', {
    body: { userName: `__cube_tech_${STAMP}`, password: PASSWORD },
  });
  const token = login.json?.data?.token;
  check('assigned technician logs in', login.status === 200 && !!token);

  const otherLogin = await api('POST', '/tech/auth/login', {
    body: { userName: `__cube_other_${STAMP}`, password: PASSWORD },
  });
  const otherToken = otherLogin.json?.data?.token;
  check('second technician logs in', otherLogin.status === 200 && !!otherToken);

  const code = order.orderId;

  // ── The assigned order appears in the tech's list ──────────────────────────
  const list = await api('GET', '/tech/orders?type=active', { token });
  const found = (list.json?.data || []).find((o) => o.orderId === code);
  check('assigned order appears in the technician\'s order list', !!found);
  check(
    'order payload nests vendors[] (the key the app parses)',
    found ? Array.isArray(found.vendors) : false,
  );

  // ── Cube tests start empty ─────────────────────────────────────────────────
  const empty = await api('GET', `/tech/orders/${code}/cube-test`, { token });
  check('cube list on assigned order -> 200', empty.status === 200, `got ${empty.status}`);
  check('cube list starts empty', Array.isArray(empty.json?.data) && empty.json.data.length === 0);

  // ── Create a standard-period cube test ─────────────────────────────────────
  const casting = new Date();
  casting.setDate(casting.getDate() - 3);

  const created = await api('POST', `/tech/orders/${code}/cube-test`, {
    token,
    body: {
      castingDate: casting.toISOString(),
      quantity: '6 cubes',
      period: 'SEVEN_DAYS',
    },
  });
  check('create cube test -> 201', created.status === 201, `got ${created.status}`);

  const cubeId = created.json?.data?.id;
  check('create returns an id', !!cubeId);

  // toDate must be castingDate + 7 days, computed server-side.
  if (created.json?.data?.toDate) {
    const to = new Date(created.json.data.toDate);
    const days = Math.round((to - casting) / 86400000);
    check(`toDate computed as casting + 7 days (got ${days})`, days === 7);
  }

  // ── It now shows in the list ───────────────────────────────────────────────
  const after = await api('GET', `/tech/orders/${code}/cube-test`, { token });
  check('cube list now returns 1 entry', after.json?.data?.length === 1);

  // ── Validation ─────────────────────────────────────────────────────────────
  const missing = await api('POST', `/tech/orders/${code}/cube-test`, {
    token,
    body: { quantity: '6' },
  });
  check('missing required fields -> 400', missing.status === 400, `got ${missing.status}`);

  const badPeriod = await api('POST', `/tech/orders/${code}/cube-test`, {
    token,
    body: { castingDate: casting.toISOString(), quantity: '6', period: 'NONSENSE' },
  });
  check('invalid period -> 422', badPeriod.status === 422, `got ${badPeriod.status}`);

  const futureCustom = await api('POST', `/tech/orders/${code}/cube-test`, {
    token,
    body: {
      castingDate: casting.toISOString(),
      quantity: '6',
      period: 'CUSTOM',
      customDate: new Date(Date.now() + 86400000 * 5).toISOString(),
    },
  });
  check('future CUSTOM date -> 400', futureCustom.status === 400, `got ${futureCustom.status}`);

  const customNoDate = await api('POST', `/tech/orders/${code}/cube-test`, {
    token,
    body: { castingDate: casting.toISOString(), quantity: '6', period: 'CUSTOM' },
  });
  check('CUSTOM without customDate -> 400', customNoDate.status === 400, `got ${customNoDate.status}`);

  // ── AUTHORIZATION: an unassigned technician is locked out ──────────────────
  const foreignList = await api('GET', `/tech/orders/${code}/cube-test`, {
    token: otherToken,
  });
  check(
    'UNASSIGNED tech cannot list cube tests -> 404',
    foreignList.status === 404,
    `got ${foreignList.status}`,
  );

  const foreignCreate = await api('POST', `/tech/orders/${code}/cube-test`, {
    token: otherToken,
    body: {
      castingDate: casting.toISOString(),
      quantity: '99',
      period: 'SEVEN_DAYS',
    },
  });
  check(
    'UNASSIGNED tech cannot create a cube test -> 404',
    foreignCreate.status === 404,
    `got ${foreignCreate.status}`,
  );

  const foreignDelete = await api('DELETE', `/tech/orders/${code}/cube-test/${cubeId}`, {
    token: otherToken,
  });
  check(
    'UNASSIGNED tech cannot delete a cube test -> 404',
    foreignDelete.status === 404,
    `got ${foreignDelete.status}`,
  );

  // ── Delete (soft) by the assigned tech ─────────────────────────────────────
  const del = await api('DELETE', `/tech/orders/${code}/cube-test/${cubeId}`, { token });
  check('assigned tech deletes the cube test -> 200', del.status === 200, `got ${del.status}`);

  const emptyAgain = await api('GET', `/tech/orders/${code}/cube-test`, { token });
  check('cube list is empty after delete', emptyAgain.json?.data?.length === 0);
} catch (err) {
  fail++;
  console.error('\nERROR during verification:', err.message);
} finally {
  // ── Cleanup, children first ────────────────────────────────────────────────
  if (ids.order) await db.cubeTest.deleteMany({ where: { orderId: ids.order } }).catch(() => {});
  if (ids.assignment)
    await db.orderTechnician.deleteMany({ where: { orderId: ids.order } }).catch(() => {});
  if (ids.order) await db.notification.deleteMany({ where: { orderId: ids.order } }).catch(() => {});
  if (ids.order) await db.order.delete({ where: { id: ids.order } }).catch(() => {});
  if (ids.project) await db.project.delete({ where: { id: ids.project } }).catch(() => {});
  if (ids.client) await db.client.delete({ where: { id: ids.client } }).catch(() => {});
  if (ids.tech) await db.user.delete({ where: { id: ids.tech } }).catch(() => {});
  if (ids.otherTech) await db.user.delete({ where: { id: ids.otherTech } }).catch(() => {});
  console.log('\nCleaned up all fixtures.');
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
