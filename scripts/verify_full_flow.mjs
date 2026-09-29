// End-to-end order flow across panel (PM, admin, accounts), field app (FT) and
// client app (Owner, Site Engineer): create → confirm → dispatch → delayed →
// trucks (FT + site) → reached → extras → part reject → accept → complete →
// auto-bill with kept qty + extras → accounts removes an extra → bill follows.
// WRITES one order + bill. Demo data is fine for it; run with
//   BASE=http://31.97.206.154:3001 node scripts/verify_full_flow.mjs
import assert from 'node:assert/strict';

const BASE = `${process.env.BASE ?? 'http://localhost:3002'}/api/v1`;
const PROJECT = process.env.PROJECT ?? 'PRJ-2026-0024';
const CLIENT = process.env.CLIENT ?? 'CL-2026-0010';

async function call(tok, method, path, body, { form } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(tok && { Authorization: `Bearer ${tok}` }), ...(!form && body && { 'Content-Type': 'application/json' }) },
    body: form ?? (body && JSON.stringify(body)),
  });
  const json = await res.json().catch(() => null);
  return { s: res.status, b: json, d: json?.data };
}
const ok = (r, what, code = [200, 201]) => {
  assert.ok([].concat(code).includes(r.s), `${what}: ${r.s} ${JSON.stringify(r.b)?.slice(0, 300)}`);
  console.log(`  ✓ ${what}`);
  return r.d;
};
// 1×1 PNG, enough for the challan upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const truckForm = (f) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(f)) fd.append(k, v);
  fd.append('challan', new Blob([PNG], { type: 'image/png' }), 'challan.png');
  return fd;
};

const panel = async (u) => ok(await call(null, 'POST', '/admin/auth', { userName: u, password: '123456' }), `panel login ${u}`).token;
const client = async (p) => ok(await call(null, 'POST', '/mobile/client/auth/verify-otp', { phone: p, otp: '1111' }), `client login ${p}`).token;

console.log('Logins');
const admin = await panel('amit.joshi');
const pm = await panel('Nitesh01');
const accounts = await panel('Sandhya');
const ft = ok(await call(null, 'POST', '/mobile/tech/auth/login', { userName: 'rahul.jadhav', password: '123456' }), 'FT login rahul.jadhav').token;
const owner = await client('9000000111');
const se = await client('9000000333');

console.log('Order');
const proj = ok(await call(ft, 'GET', '/mobile/tech/projects'), 'FT sees its projects').find((p) => p.projectId === PROJECT);
assert.ok(proj?.products?.length, `FT is on ${PROJECT} with products`);
const prod = proj.products[0];
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const created = ok(await call(pm, 'POST', '/admin/orders', { projectId: PROJECT, clientId: CLIENT, productName: prod.productName, productGrade: prod.productGrade, quantity: '12', date: today, time: '10:00' }), 'PM creates order');
const O = created.orderId ?? created.order?.orderId;
assert.ok(O, 'order id');
console.log(`  → ${O} (${prod.productName} ${prod.productGrade})`);
const fresh = (await call(owner, 'GET', `/mobile/client/orders/${O}`)).d;
assert.ok(fresh.deliveryAddress, 'delivery address defaults to the project site'); console.log(`  ✓ delivery address: ${fresh.deliveryAddress}`);
assert.ok(fresh.technicians?.some((t) => t.user?.phone), 'client sees the project FT as contact'); console.log(`  ✓ client sees FT ${fresh.technicians.map((t) => `${t.user.name} ${t.user.phone}`).join(', ')}`);

const ftList = ok(await call(ft, 'GET', '/mobile/tech/orders?type=active&limit=200'), 'FT order list');
assert.ok((ftList.orders ?? ftList).some((o) => o.orderId === O), 'new order in FT list');
console.log('  ✓ new order shows in FT app');
ok(await call(ft, 'PUT', `/mobile/tech/orders/${O}/status`, { status: 'DISPATCHED' }), 'FT cannot dispatch a NEW order', 409);

console.log('Status');
const clientStatus = async () => (await call(owner, 'GET', `/mobile/client/orders/${O}`)).d?.status;
ok(await call(pm, 'PUT', `/admin/orders/${O}/status`, { status: 'CONFIRMED' }), 'PM confirms');
ok(await call(ft, 'PUT', `/mobile/tech/orders/${O}/status`, { status: 'DISPATCHED' }), 'FT → DISPATCHED');
assert.equal((await call(ft, 'GET', `/mobile/tech/orders/${O}`)).d?.status, 'DISPATCHED'); console.log('  ✓ FT app reads DISPATCHED');
assert.equal(await clientStatus(), 'DISPATCHED'); console.log('  ✓ client app reads DISPATCHED');
assert.equal((await call(admin, 'GET', `/admin/orders/${O}`)).d?.status, 'DISPATCHED'); console.log('  ✓ panel reads DISPATCHED');
ok(await call(ft, 'PUT', `/mobile/tech/orders/${O}/status`, { status: 'DELAYED' }), 'FT → DELAYED');

console.log('Trucks');
const t = { batchStartTime: '09:10', batchEndTime: '09:30', dispatchTime: '09:40' };
const tm1 = ok(await call(ft, 'POST', `/mobile/tech/orders/${O}/tm`, null, { form: (() => { const fd = new FormData(); for (const [k, v] of Object.entries({ truckNo: 'MH12FT0001', qty: '6', challanNo: `CH-${O}-1`, ...t })) fd.append(k, v); return fd; })() }), 'FT adds TM 1 (no photo yet)');
ok(await call(ft, 'PUT', `/mobile/tech/orders/${O}/tm/${tm1.id}/reached`, { arrivalTime: '10:05' }), 'FT marks TM 1 reached');
assert.equal(await clientStatus(), 'REACHED'); console.log('  ✓ first truck at site moves order to REACHED (clears DELAYED)');
ok(await call(ft, 'PUT', `/mobile/tech/orders/${O}/tm/${tm1.id}`, null, { form: truckForm({}) }), 'FT uploads TM 1 challan photo');
const tm2 = ok(await call(se, 'POST', `/mobile/client/orders/${O}/tm`, null, { form: truckForm({ truckNo: 'MH12SE0002', qty: '6', challanNo: `CH-${O}-2`, ...t }) }), 'Site Engineer adds TM 2 with challan photo');
assert.equal(tm2.status, 'DELIVERED');
ok(await call(se, 'POST', `/mobile/client/orders/${O}/tm`, null, { form: truckForm({ truckNo: 'X', qty: '6' }) }), 'SE truck without batch times refused', 400);

console.log('Extras');
const pump = ok(await call(ft, 'POST', `/mobile/tech/orders/${O}/extras`, { kind: 'PUMPING', ...(proj.pumpingRate ? {} : { amount: 8500 }) }), 'FT adds pumping');
const part = ok(await call(pm, 'POST', `/admin/orders/${O}/extras`, { kind: 'PART_LOAD', name: 'Part load', amount: 1500 }), 'PM adds part load ₹1,500');
ok(await call(ft, 'POST', `/mobile/tech/orders/${O}/extras`, { kind: 'OTHER', name: 'x', amount: 0 }), 'extra with no price refused', 400);
ok(await call(pm, 'DELETE', `/admin/orders/${O}/extras/${part.id}`, { reason: 'test' }), 'PM cannot remove an extra', 403);
const cOrder = (await call(owner, 'GET', `/mobile/client/orders/${O}`)).d;
assert.equal(cOrder.extras.length, 2); console.log(`  ✓ client sees 2 extras (pumping ₹${pump.amount})`);

console.log('Part reject + review');
ok(await call(owner, 'POST', `/mobile/client/orders/${O}/tm/${tm2.id}/reject`, { reason: 'Wasted / spilled at site', rejectedQty: 1 }), 'client reports 1 CBM wasted on TM 2');
ok(await call(admin, 'PUT', `/admin/orders/${O}/tm/${tm1.id}/approval`, { approvalStatus: 'ACCEPTED' }), 'admin accepts TM 1');
ok(await call(admin, 'PUT', `/admin/orders/${O}/tm/${tm2.id}/approval`, { approvalStatus: 'ACCEPTED' }), 'admin accepts TM 2 (keeps 5)');

console.log('Complete + bill');
const done = ok(await call(ft, 'PUT', `/mobile/tech/orders/${O}/status`, { status: 'COMPLETED' }), 'FT → COMPLETED');
const aOrder = ok(await call(admin, 'GET', `/admin/orders/${O}`), 'panel order detail');
const billNo = done?.bill?.billNo ?? aOrder.bill?.billNo;
assert.ok(billNo, `auto-billed (${JSON.stringify(done).slice(0, 200)})`);
let bill = ok(await call(accounts, 'GET', `/admin/bills/${billNo}`), `bill ${billNo}`);
const b = bill.billDetails ?? bill;
const rate = b.rate;
assert.equal(b.quantity, 11, 'billed kept qty 6 + 5');
assert.equal(b.extrasAmount, pump.amount + 1500, 'extras on bill');
assert.equal(b.amount, Math.round((11 * rate + pump.amount + 1500) * 100) / 100, 'amount = 11 × rate + extras');
console.log(`  ✓ bill = 11 × ₹${rate} + ₹${pump.amount + 1500} extras = ₹${b.amount}`);
assert.equal(bill.quantities?.wasted, 1); console.log('  ✓ bill page shows 1 CBM wasted');

ok(await call(accounts, 'DELETE', `/admin/orders/${O}/extras/${part.id}`, { reason: 'flow check: not used' }), 'accounts removes part load');
bill = (await call(accounts, 'GET', `/admin/bills/${billNo}`)).d;
assert.equal((bill.billDetails ?? bill).amount, Math.round((11 * rate + pump.amount) * 100) / 100); console.log('  ✓ unpaid bill follows the removal');

const hidden = ok(await call(owner, 'GET', '/mobile/client/bills'), 'client bills');
assert.ok(!JSON.stringify(hidden).includes(billNo)); console.log('  ✓ draft bill hidden from the client');
ok(await call(accounts, 'PUT', '/admin/bills/status', { billNo, status: 'SENT' }), 'accounts sends the bill');
const cb = ok(await call(owner, 'GET', '/mobile/client/bills'), 'client bills');
assert.ok(JSON.stringify(cb).includes(billNo)); console.log('  ✓ client app lists the bill');
ok(await call(owner, 'GET', '/mobile/client/credit'), 'client credit position');
console.log(`\nverify_full_flow: OK — ${O} billed as ${billNo}`);
