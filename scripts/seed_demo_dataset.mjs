// Demo dataset for the client demo: a realistic spread of orders across the
// single order status (NEW → CONFIRMED → DISPATCHED → REACHED → COMPLETED, plus
// DELAYED, CANCELLED and a credit hold), with trucks, challans, auto-bills,
// payments, cube tests and comments.
//
// Everything goes through the real HTTP APIs (admin panel + client app), so the
// server's own rules apply: price freeze, credit gate, status transitions,
// billIfReady on the accepted quantity, payment allocation, notifications.
// Only at the very end are history orders back-dated in the DB, so their bills
// age into "overdue" the way they would have naturally.
//
//   node scripts/seed_demo_dataset.mjs --reset      # hide old orders/bills first (recommended)
//   BASE=http://localhost:3001 CHALLAN_IMG=/tmp/demo-challan.jpg node scripts/seed_demo_dataset.mjs --reset
//
// --reset soft-deletes (isDeleted) every existing order, bill and cube test,
// reverses active payments and clears notifications. Nothing is hard-deleted:
// back up first anyway.
import fs from 'fs';
import db from '../src/config/database.js';

const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 3001}`;
const CHALLAN_IMG = process.env.CHALLAN_IMG || '/tmp/demo-challan.jpg';
const ADMIN = { userName: process.env.ADMIN_USER || 'Shivesh', password: process.env.ADMIN_PASS || '123456' };
const OTP = '1111';
const RESET = process.argv.includes('--reset');

const ymd = (d) => d.toLocaleDateString('en-CA'); // local YYYY-MM-DD
const today = new Date();
const TODAY = ymd(today);
const TOMORROW = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d + n); };

async function call(method, path, { token, body, form } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { authorization: token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.message || JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

async function adminToken() {
  const r = await call('POST', '/api/v1/admin/auth', { body: ADMIN });
  return r.data.token;
}
const clientTokens = {};
async function clientToken(phone) {
  if (clientTokens[phone]) return clientTokens[phone];
  await call('POST', '/api/v1/mobile/client/auth/send-otp', { body: { phone } });
  const r = await call('POST', '/api/v1/mobile/client/auth/verify-otp', { body: { phone, otp: OTP } });
  clientTokens[phone] = r.data.token;
  return r.data.token;
}

const challanBuf = fs.existsSync(CHALLAN_IMG) ? fs.readFileSync(CHALLAN_IMG) : null;

// ── The dataset ────────────────────────────────────────────────────────────
// trucks: [qty, outcome] — accept (challan + accepted), reject (rejected at
// site), reached (at site, challan pending), transit (on the way).
const T = { RAHUL: 54, RAMESH: 39, SURESH: 40, VIKAS: 41, GANESH: 42 };
const PLAN = [
  // Sahyadri Infraprojects — the main demo client
  { key: 'S1', client: 'CL-2026-0010', project: 'PRJ-2026-0024', p: 'RMC', g: 'M25', qty: 18, tech: T.RAHUL, final: 'COMPLETED', date: '2026-08-12', time: '09:00',
    trucks: [[6, 'accept'], [6, 'accept'], [6, 'accept']], pay: { on: '2026-09-05', mode: 'CHEQUE', ref: '004519', bank: 'HDFC Bank, Pune' } },
  { key: 'S2', client: 'CL-2026-0010', project: 'PRJ-2026-0024', p: 'RMC', g: 'M25', qty: 12, tech: T.RAHUL, final: 'COMPLETED', date: '2026-09-18', time: '08:30',
    trucks: [[6, 'accept'], [6, 'reject', 'Slump not OK at site — rejected by site engineer']],
    cube: [['SEVEN_DAYS', '3'], ['TWENTYEIGHT_DAYS', '3']], castOn: '2026-09-18' },
  { key: 'S3', client: 'CL-2026-0010', project: 'PRJ-2026-0024', p: 'RMC', g: 'M25', qty: 18, tech: T.RAHUL, final: 'REACHED', date: TODAY, time: '08:30',
    trucks: [[6, 'accept'], [6, 'reached'], [6, 'transit']], cube: [['SEVEN_DAYS', '3']], castOn: TODAY,
    comments: [['admin', 'Third truck left the plant at 10:40, ETA 30 min.']] },
  { key: 'S4', client: 'CL-2026-0010', project: 'PRJ-2026-0024', p: 'RMC', g: 'M25', qty: 12, tech: T.RAHUL, final: 'DISPATCHED', date: TODAY, time: '11:00',
    trucks: [[6, 'transit']] },
  { key: 'S5', client: 'CL-2026-0010', project: 'PRJ-2026-0024', p: 'RMC', g: 'M25', qty: 24, tech: T.RAHUL, final: 'CONFIRMED', date: TOMORROW, time: '09:00',
    comments: [['client:9000000111', 'Please send the pump by 8:30, slab pour on the 4th floor.']] },
  { key: 'S6', client: 'CL-2026-0010', project: 'PRJ-2026-0024', p: 'RMC', g: 'M25', qty: 9, final: 'NEW', date: TOMORROW, time: '14:00',
    viaClient: '9000000333' }, // placed by Rakesh Pawar, site engineer

  // Marathon NextGen Realty — overdue, part-paid
  { key: 'M1', client: 'CL-2026-0007', project: 'PRJ-2026-0020', p: 'RMC', g: 'M30', qty: 30, tech: T.RAMESH, final: 'COMPLETED', date: '2026-07-22', time: '07:30',
    trucks: [[6, 'accept'], [6, 'accept'], [6, 'accept'], [6, 'accept'], [6, 'accept']], pay: { part: 0.5, on: '2026-08-30', mode: 'BANK_TRANSFER', ref: 'NEFT/UTR 2208HDFC4471' } },
  { key: 'M2', client: 'CL-2026-0007', project: 'PRJ-2026-0020', p: 'RMC', g: 'M30', qty: 18, tech: T.RAMESH, final: 'DELAYED', date: TODAY, time: '10:00',
    trucks: [[6, 'transit']], comments: [['admin', 'Plant batching unit down for 45 min — truck delayed, revised ETA 12:15.']] },
  { key: 'M3', client: 'CL-2026-0007', project: 'PRJ-2026-0020', p: 'RMC', g: 'M25', qty: 15, final: 'NEW', date: TOMORROW, time: '10:30' },

  // Godrej Properties — paid, confirmed, cancelled
  { key: 'G1', client: 'CL-2026-0008', project: 'PRJ-2026-0021', p: 'RMC', g: 'M40', qty: 24, tech: T.SURESH, final: 'COMPLETED', date: '2026-09-02', time: '08:00',
    trucks: [[6, 'accept'], [6, 'accept'], [6, 'accept'], [6, 'accept']], pay: { on: '2026-09-20', mode: 'ONLINE', ref: 'RTGS/UTR GP-092026-118' } },
  { key: 'G2', client: 'CL-2026-0008', project: 'PRJ-2026-0021', p: 'RMC', g: 'M40', qty: 30, tech: T.SURESH, final: 'CONFIRMED', date: TOMORROW, time: '07:00' },
  { key: 'G3', client: 'CL-2026-0008', project: 'PRJ-2026-0021', p: 'RMC', g: 'M40', qty: 12, final: 'CANCELLED', date: TOMORROW, time: '15:00',
    viaClient: '9900223344', cancelReason: 'Slab pour postponed by the structural consultant' },

  // Runwal Group — unpaid bill, on the road, credit hold
  { key: 'R1', client: 'CL-2026-0009', project: 'PRJ-2026-0022', p: 'RMC', g: 'M20', qty: 36, tech: T.VIKAS, final: 'COMPLETED', date: '2026-09-10', time: '08:00',
    trucks: [[6, 'accept'], [6, 'accept'], [6, 'accept'], [6, 'accept'], [6, 'accept'], [6, 'accept']] },
  { key: 'R2', client: 'CL-2026-0009', project: 'PRJ-2026-0022', p: 'RMC', g: 'M20', qty: 12, tech: T.VIKAS, final: 'DISPATCHED', date: TODAY, time: '12:30',
    trucks: [[6, 'transit'], [6, 'transit']] },
  { key: 'R3', client: 'CL-2026-0009', project: 'PRJ-2026-0022', p: 'RMC', g: 'M20', qty: 'OVER_LIMIT', final: 'HOLD', date: TOMORROW, time: '06:30' },

  // Neelam Enterprises — 60+ days overdue, trucks at site today
  { key: 'N1', client: 'CL-2026-0003', project: 'PRJ-2026-0016', p: 'RMC', g: 'M603', qty: 20, tech: T.GANESH, final: 'COMPLETED', date: '2026-06-05', time: '09:30',
    trucks: [[5, 'accept'], [5, 'accept'], [5, 'accept'], [5, 'accept']] },
  { key: 'N2', client: 'CL-2026-0003', project: 'PRJ-2026-0016', p: 'RMC', g: 'M603', qty: 10, tech: T.GANESH, final: 'REACHED', date: TODAY, time: '09:00',
    trucks: [[5, 'reached'], [5, 'reached']] },

  // Vastu Buildcon — bill due tomorrow
  { key: 'V1', client: 'CL-2025-0004', project: 'PRJ-2026-0019', p: 'RMC-NEW', g: 'M10', qty: 15, tech: T.GANESH, final: 'COMPLETED', date: '2026-08-28', time: '10:00',
    trucks: [[5, 'accept'], [5, 'accept'], [5, 'accept']] },
];

const STEPS = { CONFIRMED: ['CONFIRMED'], DISPATCHED: ['CONFIRMED', 'DISPATCHED'], DELAYED: ['CONFIRMED', 'DISPATCHED', 'DELAYED'], REACHED: ['CONFIRMED', 'DISPATCHED', 'REACHED'], COMPLETED: ['CONFIRMED', 'DISPATCHED', 'REACHED', 'COMPLETED'] };
let truckSeq = 4100;
const truckNo = () => `MH12${['AB', 'CD', 'EF', 'GH', 'JK'][truckSeq % 5]}${truckSeq++}`;

async function run() {
  const admin = await adminToken();
  const A = (method, path, opts = {}) => call(method, `/api/v1/admin${path}`, { token: admin, ...opts });

  if (RESET) {
    const o = await db.order.updateMany({ where: { isDeleted: false }, data: { isDeleted: true } });
    const b = await db.bill.updateMany({ where: { isDeleted: false }, data: { isDeleted: true } });
    const c = await db.cubeTest.updateMany({ where: { isDeleted: false }, data: { isDeleted: true } });
    const a = await db.paymentAllocation.updateMany({ where: { isReversed: false }, data: { isReversed: true } });
    const p = await db.payment.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'REVERSED', reversalReason: 'Demo data reset' } });
    const n = await db.notification.deleteMany({});
    console.log(`reset: hid ${o.count} orders, ${b.count} bills, ${c.count} cube tests; reversed ${p.count} payments (${a.count} allocations); cleared ${n.count} notifications`);
  }

  const made = {};
  for (const s of PLAN) {
    const client = await db.client.findFirst({ where: { clientId: s.client, isDeleted: false } });
    const project = await db.project.findFirst({ where: { projectId: s.project, clientId: client.id, isDeleted: false } });
    const pp = await db.projectProduct.findFirst({ where: { projectId: project.id, productName: s.p, productGrade: s.g } });
    let qty = s.qty;
    if (qty === 'OVER_LIMIT') qty = Math.max(60, Math.ceil(((client.creditLimit || 500000) * 1.05) / (pp?.costPrice || 5000)));
    const body = { projectId: s.project, productName: s.p, productGrade: s.g, quantity: String(qty), date: s.date > TODAY ? s.date : TODAY, time: s.time,
      deliveryAddress: project.address || project.siteName || undefined };

    // 1. Book it — through the client app when a client places it.
    let orderId;
    if (s.viaClient) {
      const r = await call('POST', '/api/v1/mobile/client/orders', { token: await clientToken(s.viaClient), body });
      orderId = r.data.orderId;
    } else {
      const r = await A('POST', '/orders', { body: { ...body, clientId: s.client, technicians: s.tech ? [{ userId: s.tech }] : [] } });
      orderId = r.data?.orderId ?? r.data?.order?.orderId;
    }
    made[s.key] = orderId;

    if (s.final === 'CANCELLED') {
      await call('POST', `/api/v1/mobile/client/orders/${orderId}/cancel`, { token: await clientToken(s.viaClient), body: { reason: s.cancelReason } });
    }
    if (s.viaClient && s.tech) await A('POST', '/orders/technician/create', { body: { orderId, userId: s.tech } });

    // 2. Trucks (created while confirmed, before dispatch).
    const steps = STEPS[s.final] || [];
    if (steps.length) await A('PUT', `/orders/${orderId}/status`, { body: { status: 'CONFIRMED' } });
    const tms = [];
    for (const [i, [q, outcome, reason]] of (s.trucks || []).entries()) {
      const challanNo = outcome === 'accept' || outcome === 'reached' ? `CH-${88000 + truckSeq}` : undefined;
      const r = await A('POST', `/orders/${orderId}/tm`, { body: { truckNo: truckNo(), qty: String(q), ...(challanNo && { challanNo }),
        batchStartTime: `0${7 + (i % 3)}:${i % 2 ? '40' : '10'}`, batchEndTime: `0${7 + (i % 3)}:${i % 2 ? '58' : '28'}`, dispatchTime: `0${7 + (i % 3)}:${i % 2 ? '59' : '30'}` } });
      tms.push({ id: r.data?.id ?? r.data?.tm?.id, outcome, reason });
    }
    // Read the truck ids back rather than trusting the create response's shape.
    const rows = await db.tmDetail.findMany({ where: { order: { orderId }, isDeleted: false }, orderBy: { tmNumber: 'asc' }, select: { id: true } });
    rows.forEach((row, i) => { if (tms[i]) tms[i].id = row.id; });

    // 3. Walk the status forward; set each truck's own step to match.
    for (const st of steps.slice(1)) {
      if (st === 'DISPATCHED') {
        for (const tm of tms) await db.tmDetail.update({ where: { id: tm.id }, data: { status: 'IN_TRANSIT' } });
      }
      if (st === 'REACHED' || st === 'COMPLETED') {
        for (const tm of tms) {
          const status = tm.outcome === 'transit' ? 'IN_TRANSIT' : tm.outcome === 'accept' && st === 'COMPLETED' ? 'DELIVERED' : 'REACHED';
          await db.tmDetail.update({ where: { id: tm.id }, data: { status, ...(status === 'DELIVERED' && { deliveredAt: new Date() }) } });
        }
        // Review trucks once they are at site: challan photo + accept, or reject.
        for (const tm of tms.filter((t) => !t.reviewed)) {
          if (tm.outcome === 'accept' && challanBuf) {
            const fd = new FormData();
            fd.append('challan', new Blob([challanBuf], { type: 'image/jpeg' }), 'challan.jpg');
            await A('POST', `/orders/${orderId}/tm/${tm.id}/challan`, { form: fd });
            await A('PUT', `/orders/${orderId}/tm/${tm.id}/approval`, { body: { approvalStatus: 'ACCEPTED' } });
            tm.reviewed = true;
          } else if (tm.outcome === 'reject') {
            await A('PUT', `/orders/${orderId}/tm/${tm.id}/approval`, { body: { approvalStatus: 'REJECTED', rejectionReason: tm.reason } });
            tm.reviewed = true;
          }
        }
        if (s.cube) {
          for (const [period, cubes] of s.cube) {
            const fd = new FormData();
            fd.append('castingDate', s.castOn); fd.append('quantity', cubes); fd.append('period', period);
            await A('POST', `/orders/${orderId}/cube-test`, { form: fd });
          }
          s.cube = null;
        }
      }
      await A('PUT', `/orders/${orderId}/status`, { body: { status: st } });
    }

    // 4. Payment on the auto-generated bill.
    const order = await db.order.findFirst({ where: { orderId }, include: { bill: true } });
    if (s.pay && order.bill && !order.bill.isDeleted) {
      const amount = Math.round(order.bill.amount * (s.pay.part || 1));
      await A('POST', '/payments', { body: { clientId: s.client, amount, receivedOn: s.pay.on, mode: s.pay.mode, reference: s.pay.ref, bankName: s.pay.bank,
        scope: 'BILLS', billIds: [order.bill.billNo] } });
    }

    // 5. A little conversation on live orders.
    for (const [who, message] of s.comments || []) {
      if (who === 'admin') await A('POST', `/orders/${orderId}/comments`, { body: { message } });
      else await call('POST', `/api/v1/mobile/client/orders/${orderId}/comments`, { token: await clientToken(who.split(':')[1]), body: { message } });
    }
    console.log(`${s.key.padEnd(3)} ${orderId}  ${s.client}  ${s.p} ${s.g} ${qty}  → ${order.creditHold ? 'NEW (credit hold)' : order.status}${order.bill ? `  bill ${order.bill.billNo} ₹${order.bill.amount}` : ''}`);
  }

  // 6. Back-date history so bills age naturally (overdue, DSO, the 6-month chart).
  for (const s of PLAN.filter((x) => x.date < TODAY)) {
    const order = await db.order.findFirst({ where: { orderId: made[s.key] }, include: { bill: true, client: { select: { creditDays: true } } } });
    const at = addDays(s.date, 0); at.setHours(Number(s.time.slice(0, 2)), Number(s.time.slice(3)));
    await db.order.update({ where: { id: order.id }, data: { date: s.date, createdAt: addDays(s.date, -2) } });
    await db.tmDetail.updateMany({ where: { orderId: order.id }, data: { createdAt: at, deliveredAt: at } });
    await db.cubeTest.updateMany({ where: { orderId: order.id }, data: { createdAt: at } });
    if (order.bill) {
      const issue = addDays(s.date, 1);
      const due = addDays(s.date, 1 + (order.client.creditDays || 30));
      const unpaid = !['PAID', 'PARTIALLY_PAID'].includes(order.bill.status);
      await db.bill.update({ where: { id: order.bill.id }, data: { issueDate: issue, dueDate: due, createdAt: issue, ...(unpaid && due < today && { status: 'OVERDUE' }) } });
    }
  }
  console.log('\nback-dated history orders; done.');
}

try {
  await run();
  process.exit(0);
} catch (e) {
  console.error('SEED FAILED:', e.message);
  process.exit(1);
}
