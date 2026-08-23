/**
 * End-to-end proof of the field-technician credential login + cube-test API.
 *
 * Creates a THROWAWAY technician, logs in with username/password over real
 * HTTP, verifies the 30-day JWT is accepted by a protected route, then deletes
 * the account again. Nothing else in the database is touched.
 *
 *   node scripts/verify_tech_login.mjs
 *
 * Requires the server to already be running on PORT (default 3001).
 */
import db from '../src/config/database.js';
import { hashPassword } from '../src/helper/passwordHelper.js';
import { encrypt } from '../src/helper/security.js';
import jsonwebtoken from 'jsonwebtoken';

const BASE = `http://localhost:${process.env.PORT || 3001}/api/v1/mobile`;
const USERNAME = `__verify_tech_${Date.now()}`;
const PASSWORD = 'Verify#12345';

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

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: token } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { authorization: token } : {},
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

let userId = null;
let adminId = null;

try {
  // ── Fixtures ───────────────────────────────────────────────────────────────
  const tech = await db.user.create({
    data: {
      name: 'Verify Technician',
      employeeId: `EMP-VERIFY-${Date.now()}`,
      userName: USERNAME,
      password: hashPassword(PASSWORD),
      role: 'FIELD_TECHNICIAN',
      menuAccess: {},
      phone: '9000000001',
    },
  });
  userId = tech.id;
  console.log(`Created throwaway technician id=${userId}\n`);

  // ── 1. Login with correct credentials ──────────────────────────────────────
  const ok = await post('/tech/auth/login', {
    userName: USERNAME,
    password: PASSWORD,
  });
  check('login with correct credentials -> 200', ok.status === 200, `got ${ok.status}`);
  const token = ok.json?.data?.token;
  check('login returns a token', typeof token === 'string' && token.length > 0);
  check('login reports 30-day expiry', ok.json?.data?.expiresInDays === 30);

  // ── 2. The token really is a 30-day JWT ────────────────────────────────────
  if (token) {
    const decoded = jsonwebtoken.decode(
      (await import('../src/helper/security.js')).decrypt(token),
    );
    const days = Math.round((decoded.exp - decoded.iat) / 86400);
    check(`JWT expiry is 30 days (got ${days})`, days === 30);
    check('JWT carries FIELD_TECH type', decoded?.data?.type === 'FIELD_TECH');
  }

  // ── 3. Wrong password is rejected ──────────────────────────────────────────
  const bad = await post('/tech/auth/login', {
    userName: USERNAME,
    password: 'WrongPassword!',
  });
  check('wrong password -> 401', bad.status === 401, `got ${bad.status}`);
  check(
    'wrong password gives generic message (no user enumeration)',
    bad.json?.message === 'Invalid username or password',
  );

  // ── 4. Session endpoint accepts the token ──────────────────────────────────
  const sess = await get('/tech/auth/session', token);
  check('session with valid token -> 200', sess.status === 200, `got ${sess.status}`);
  check('session returns the right technician', sess.json?.data?.userName === USERNAME);

  // ── 5. Protected data route accepts the token ──────────────────────────────
  const orders = await get('/tech/orders?type=active', token);
  check('orders list with token -> 200', orders.status === 200, `got ${orders.status}`);
  check('orders payload is an array', Array.isArray(orders.json?.data));

  // ── 6. Cube-test route is reachable and scoped ─────────────────────────────
  const cube = await get('/tech/orders/DEFINITELY-NOT-AN-ORDER/cube-test', token);
  check(
    'cube-test on an unassigned/missing order -> 404 (scoped, not leaked)',
    cube.status === 404,
    `got ${cube.status}`,
  );

  // ── 7. An ADMIN user cannot log in through the field app ───────────────────
  const adminName = `__verify_admin_${Date.now()}`;
  const admin = await db.user.create({
    data: {
      name: 'Verify Admin',
      employeeId: `EMP-VADM-${Date.now()}`,
      userName: adminName,
      password: hashPassword(PASSWORD),
      role: 'ADMIN',
      menuAccess: {},
    },
  });
  adminId = admin.id;
  const adminTry = await post('/tech/auth/login', {
    userName: adminName,
    password: PASSWORD,
  });
  check('ADMIN cannot log into the field app -> 401', adminTry.status === 401, `got ${adminTry.status}`);

  // ── 8. Legacy AES password still verifies (no flag day) ────────────────────
  await db.user.update({
    where: { id: userId },
    data: { password: encrypt('LegacyPass1') },
  });
  const legacy = await post('/tech/auth/login', {
    userName: USERNAME,
    password: 'LegacyPass1',
  });
  check(
    'legacy AES-encrypted password still logs in -> 200',
    legacy.status === 200,
    `got ${legacy.status}`,
  );

  // ── 9. Change password upgrades the row to bcrypt ──────────────────────────
  const legacyToken = legacy.json?.data?.token;
  const changed = await post(
    '/tech/auth/change-password',
    { oldPassword: 'LegacyPass1', newPassword: 'BrandNew#99' },
    legacyToken,
  );
  check('change-password -> 200', changed.status === 200, `got ${changed.status}`);

  const after = await db.user.findFirst({ where: { id: userId } });
  check(
    'password row upgraded to bcrypt after change',
    /^\$2[aby]\$\d{2}\$/.test(after.password),
  );

  const newLogin = await post('/tech/auth/login', {
    userName: USERNAME,
    password: 'BrandNew#99',
  });
  check('login with the new password -> 200', newLogin.status === 200, `got ${newLogin.status}`);

  const oldLogin = await post('/tech/auth/login', {
    userName: USERNAME,
    password: 'LegacyPass1',
  });
  check('old password no longer works -> 401', oldLogin.status === 401, `got ${oldLogin.status}`);
} catch (err) {
  fail++;
  console.error('\nERROR during verification:', err.message);
} finally {
  // ── Cleanup — leave the database exactly as we found it ────────────────────
  if (userId) await db.user.delete({ where: { id: userId } }).catch(() => {});
  if (adminId) await db.user.delete({ where: { id: adminId } }).catch(() => {});
  console.log('\nCleaned up throwaway accounts.');
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
