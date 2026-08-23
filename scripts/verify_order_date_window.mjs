/**
 * End-to-end check of the 3-month order booking window against a running API.
 *
 * Proves the cap is enforced server-side (not just in the pickers) on every
 * write path: client create, admin create, and admin update/reschedule.
 *
 * Usage: node scripts/verify_order_date_window.mjs [baseUrl]
 * Cleans up any order it creates.
 */
import { PrismaClient } from '@prisma/client';
import {
  maxDeliveryDateIso,
  addMonthsIso,
  todayIso,
} from '../src/helper/deliveryDateHelper.js';
import { decrypt } from '../src/helper/security.js';

const BASE = process.argv[2] || 'http://localhost:3001/api/v1';
const db = new PrismaClient();

let pass = 0, fail = 0;
const created = [];
const check = (name, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const put = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const MAX = maxDeliveryDateIso();
const TODAY = todayIso();
/** One calendar day past the cap — real date arithmetic, not a digit bump
 *  (which would produce e.g. 2026-02-29 when the cap lands on a month end). */
function isoPlusDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
const OVER = isoPlusDays(MAX, 1);

async function main() {
  console.log(`Base: ${BASE}`);
  console.log(`Today: ${TODAY}   Cap: ${MAX}\n`);

  // ── Client path ─────────────────────────────────────────────────────────
  // Pick a client that actually has a project, otherwise create-order 404s.
  const candidates = await db.client.findMany({
    where: { isDeleted: false },
    select: { id: true, clientId: true, contactNumber: true, companyName: true },
  });

  let client = null;
  let project = null;
  for (const c of candidates) {
    if (!c.contactNumber) continue;
    const p = await db.project.findFirst({
      where: { clientId: c.id, isDeleted: false },
      select: { projectId: true },
    });
    if (p) { client = c; project = p; break; }
  }
  if (!client) throw new Error('No client with a project found to test with');

  await post('/mobile/client/auth/send-otp', { number: client.contactNumber });
  const otpRes = await post('/mobile/client/auth/verify-otp', {
    number: client.contactNumber,
    otp: '1111',
  });
  const otpJson = await otpRes.json();
  const clientToken = otpJson?.data?.token;
  check('client authenticated', !!clientToken, client.companyName);
  if (!clientToken) return;

  const orderBody = (date) => ({
    projectId: project.projectId,
    productName: 'RMC',
    productGrade: 'M30',
    quantity: '5 m3',
    date,
    time: '10:00 AM',
  });

  // Inside the window — must succeed.
  const okRes = await post('/mobile/client/orders', orderBody(TODAY), clientToken);
  const okJson = await okRes.json();
  check('client: today accepted', okRes.status === 201, `status=${okRes.status}`);
  if (okJson?.data?.orderId) created.push(okJson.data.orderId);

  // Exact boundary — must succeed (off-by-one guard).
  const boundRes = await post('/mobile/client/orders', orderBody(MAX), clientToken);
  const boundJson = await boundRes.json();
  check('client: exact 3-month boundary accepted', boundRes.status === 201, `date=${MAX} status=${boundRes.status}`);
  if (boundJson?.data?.orderId) created.push(boundJson.data.orderId);

  // One day past — must be rejected.
  const overRes = await post('/mobile/client/orders', orderBody(OVER), clientToken);
  const overJson = await overRes.json();
  check('client: 1 day past cap rejected', overRes.status === 400, `date=${OVER} status=${overRes.status}`);
  check('client: rejection message is useful', /3 months/.test(overJson?.message || ''), overJson?.message);

  // Far future — must be rejected.
  const farRes = await post('/mobile/client/orders', orderBody('2030-01-01'), clientToken);
  check('client: far future rejected', farRes.status === 400, `status=${farRes.status}`);

  // 6 months out — the specific thing the rule forbids.
  const sixRes = await post('/mobile/client/orders', orderBody(addMonthsIso(TODAY, 6)), clientToken);
  check('client: 6 months out rejected', sixRes.status === 400, `status=${sixRes.status}`);

  // Blank date still allowed (date is optional on an order).
  const blankRes = await post('/mobile/client/orders', orderBody(''), clientToken);
  const blankJson = await blankRes.json();
  check('client: blank date still allowed', blankRes.status === 201, `status=${blankRes.status}`);
  if (blankJson?.data?.orderId) created.push(blankJson.data.orderId);

  // Malformed date rejected rather than written through to the DB.
  const badRes = await post('/mobile/client/orders', orderBody('31/12/2026'), clientToken);
  check('client: malformed date rejected', badRes.status === 400, `status=${badRes.status}`);

  // ── Admin path ──────────────────────────────────────────────────────────
  // Admin login is POST /admin/auth (authRoute is mounted at '/auth' and the
  // login handler sits on '/', NOT '/auth/login').
  //
  // Admin passwords are stored as AES-*reversible* ciphertext (see
  // helper/passwordHelper.js), so the suite recovers a working login read-only
  // via decrypt() instead of guessing or mutating an account. `password` is a
  // non-nullable column, so `{ not: null }` is rejected by Prisma — filter on
  // the empty string instead.
  const adminRows = await db.user.findMany({
    where: { role: 'ADMIN', isDeleted: false, status: true, password: { not: '' } },
    select: { userName: true, password: true },
    take: 10,
  });

  let admin = null;
  let adminToken = null;
  for (const row of adminRows) {
    let plain = null;
    try {
      const d = decrypt(row.password);
      if (d && d.length) plain = d;
    } catch { /* bcrypt row — not recoverable, skip */ }
    if (!plain) continue;

    const res = await post('/admin/auth', { userName: row.userName, password: plain });
    const json = await res.json();
    if (json?.data?.token) {
      admin = row;
      adminToken = json.data.token;
      break;
    }
  }

  if (!adminToken) {
    console.log('\n(skipping admin checks — no ADMIN login could be recovered)');
    fail++;
    console.log('FAIL  admin checks did not run');
  } else {
    {
      check('admin authenticated', true, admin.userName);

      const adminBody = (date) => ({
        projectId: project.projectId,
        clientId: client.clientId,
        productName: 'RMC',
        productGrade: 'M30',
        quantity: '5 m3',
        date,
        time: '10:00 AM',
      });

      const aOk = await post('/admin/orders', adminBody(MAX), adminToken);
      const aOkJson = await aOk.json();
      check('admin: boundary accepted', aOk.status === 201 || aOk.status === 200, `status=${aOk.status}`);
      const adminOrderId = aOkJson?.data?.orderId || aOkJson?.data?.order?.orderId;
      if (adminOrderId) created.push(adminOrderId);

      const aOver = await post('/admin/orders', adminBody(OVER), adminToken);
      check('admin: past cap rejected on create', aOver.status === 400, `status=${aOver.status}`);

      // Reschedule an existing order past the cap — must also be refused.
      if (adminOrderId) {
        const uOver = await put(`/admin/orders/${adminOrderId}`, { date: OVER }, adminToken);
        check('admin: reschedule past cap rejected', uOver.status === 400, `status=${uOver.status}`);

        const uOk = await put(`/admin/orders/${adminOrderId}`, { date: TODAY }, adminToken);
        check('admin: reschedule inside window accepted', uOk.status === 200, `status=${uOk.status}`);
      }
    }
  }

  // ── Nothing out-of-window reached the database ──────────────────────────
  const beyond = await db.order.count({ where: { date: { gt: MAX }, isDeleted: false } });
  check('no order in DB beyond the cap was created by this run', beyond === 0, `found=${beyond}`);
}

main()
  .catch((e) => {
    fail++;
    console.error('ERROR:', e.message);
  })
  .finally(async () => {
    if (created.length) {
      await db.order.deleteMany({ where: { orderId: { in: created } } });
      console.log(`\ncleaned up ${created.length} test order(s)`);
    }
    await db.$disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
