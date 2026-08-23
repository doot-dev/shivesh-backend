/**
 * End-to-end check of order search/filtering on the mobile APIs.
 *
 * Covers the technician list (`/mobile/tech/orders`) and the client list
 * (`/mobile/client/orders`): free-text `q` across order code / project /
 * client / product / grade, plus `date`, `dateFrom` and `dateTo`.
 *
 * Run with the backend up:  node scripts/verify_order_search.mjs
 */
const BASE = process.env.BASE ?? 'http://localhost:3001/api/v1/mobile';
const TECH = { userName: 'demo.tech', password: 'Demo@12345' };
const CLIENT_PHONE = '9000000111';
const OTP = '1111';

let pass = 0;
let fail = 0;

function check(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

const list = (r) => r.json?.data ?? [];
const codes = (r) => list(r).map((o) => o.orderId);

async function techToken() {
  const r = await api('/tech/auth/login', { method: 'POST', body: TECH });
  if (r.status !== 200) throw new Error(`tech login failed: ${r.status}`);
  return r.json.data.token;
}

async function clientToken() {
  await api('/client/auth/send-otp', {
    method: 'POST',
    body: { number: CLIENT_PHONE },
  });
  const r = await api('/client/auth/verify-otp', {
    method: 'POST',
    body: { number: CLIENT_PHONE, otp: OTP },
  });
  if (r.status !== 200) throw new Error(`client otp login failed: ${r.status}`);
  return r.json.data.token;
}

async function main() {
  console.log(`\nOrder search verification against ${BASE}\n`);

  const tToken = await techToken();
  const cToken = await clientToken();

  // ── Baseline ───────────────────────────────────────────────────────────────
  console.log('Baseline (no filters)');
  const techAll = await api('/tech/orders?type=active', { token: tToken });
  const clientAll = await api('/client/orders?type=active', { token: cToken });
  check('tech list returns 200', techAll.status === 200, `got ${techAll.status}`);
  check('client list returns 200', clientAll.status === 200, `got ${clientAll.status}`);
  check('tech has at least one active order', list(techAll).length > 0);
  check('client has at least one active order', list(clientAll).length > 0);

  const sample = list(techAll)[0];
  if (!sample) throw new Error('no active tech order to search against — run seed_demo_order.mjs');
  console.log(`  sample order: ${sample.orderId} / ${sample.project?.projectName} / ${sample.client?.companyName} / ${sample.date}\n`);

  // ── Free text: order code ──────────────────────────────────────────────────
  console.log('Search by order code');
  const byCode = await api(`/tech/orders?type=active&q=${encodeURIComponent(sample.orderId)}`, { token: tToken });
  check('exact order code returns 200', byCode.status === 200);
  check('exact order code finds the order', codes(byCode).includes(sample.orderId), JSON.stringify(codes(byCode)));
  check('exact order code narrows the list', list(byCode).length <= list(techAll).length);

  const partial = sample.orderId.slice(-4);
  const byPartial = await api(`/tech/orders?type=active&q=${encodeURIComponent(partial)}`, { token: tToken });
  check(`partial code "${partial}" finds the order`, codes(byPartial).includes(sample.orderId));

  // ── Free text: project name ────────────────────────────────────────────────
  console.log('\nSearch by project name');
  const projName = sample.project?.projectName ?? '';
  const projTerm = projName.split(' ')[0];
  if (projTerm) {
    const byProj = await api(`/tech/orders?type=active&q=${encodeURIComponent(projTerm)}`, { token: tToken });
    check(`project term "${projTerm}" returns 200`, byProj.status === 200);
    check(`project term "${projTerm}" finds the order`, codes(byProj).includes(sample.orderId));
  }

  // ── Free text: client name (+ case insensitivity) ──────────────────────────
  console.log('\nSearch by client name');
  const clientName = sample.client?.companyName ?? '';
  const clientTerm = clientName.split(' ')[0];
  if (clientTerm) {
    const byClient = await api(`/tech/orders?type=active&q=${encodeURIComponent(clientTerm)}`, { token: tToken });
    check(`client term "${clientTerm}" finds the order`, codes(byClient).includes(sample.orderId));

    const upper = await api(`/tech/orders?type=active&q=${encodeURIComponent(clientTerm.toUpperCase())}`, { token: tToken });
    const lower = await api(`/tech/orders?type=active&q=${encodeURIComponent(clientTerm.toLowerCase())}`, { token: tToken });
    check('search is case-insensitive', upper.status === 200 && lower.status === 200 && list(upper).length === list(lower).length,
      `upper=${list(upper).length} lower=${list(lower).length}`);
  }

  // ── Free text: product / grade ─────────────────────────────────────────────
  console.log('\nSearch by product and grade');
  if (sample.productGrade) {
    const byGrade = await api(`/tech/orders?type=active&q=${encodeURIComponent(sample.productGrade)}`, { token: tToken });
    check(`grade "${sample.productGrade}" finds the order`, codes(byGrade).includes(sample.orderId));
  }
  if (sample.productName) {
    const byProduct = await api(`/tech/orders?type=active&q=${encodeURIComponent(sample.productName)}`, { token: tToken });
    check(`product "${sample.productName}" finds the order`, codes(byProduct).includes(sample.orderId));
  }

  // ── No match ───────────────────────────────────────────────────────────────
  console.log('\nNo-match behaviour');
  const nomatch = await api('/tech/orders?type=active&q=zzzzz-no-such-order-zzzzz', { token: tToken });
  check('nonsense term returns 200 (not an error)', nomatch.status === 200, `got ${nomatch.status}`);
  check('nonsense term returns an empty list', list(nomatch).length === 0, `got ${list(nomatch).length}`);
  check('nonsense term reports total 0', nomatch.json?.total === 0, `got ${nomatch.json?.total}`);

  // ── Empty / whitespace q must behave like no filter ─────────────────────────
  console.log('\nEmpty search is a no-op');
  const emptyQ = await api('/tech/orders?type=active&q=', { token: tToken });
  const wsQ = await api('/tech/orders?type=active&q=%20%20', { token: tToken });
  check('empty q returns the full list', list(emptyQ).length === list(techAll).length,
    `${list(emptyQ).length} vs ${list(techAll).length}`);
  check('whitespace-only q returns the full list', list(wsQ).length === list(techAll).length,
    `${list(wsQ).length} vs ${list(techAll).length}`);

  // ── Date filters ───────────────────────────────────────────────────────────
  console.log('\nDate filtering');
  const day = sample.date;
  if (day) {
    const byDay = await api(`/tech/orders?type=active&date=${day}`, { token: tToken });
    check(`date=${day} returns 200`, byDay.status === 200);
    check(`date=${day} finds the order`, codes(byDay).includes(sample.orderId));
    check('every result matches that exact date', list(byDay).every((o) => o.date === day),
      JSON.stringify(list(byDay).map((o) => o.date)));

    const range = await api(`/tech/orders?type=active&dateFrom=${day}&dateTo=${day}`, { token: tToken });
    check('dateFrom==dateTo matches the single-day filter', list(range).length === list(byDay).length,
      `${list(range).length} vs ${list(byDay).length}`);

    // A window that deliberately ends before the sample date.
    const before = await api('/tech/orders?type=active&dateTo=2000-01-01', { token: tToken });
    check('dateTo in the distant past returns nothing', list(before).length === 0, `got ${list(before).length}`);

    const after = await api('/tech/orders?type=active&dateFrom=2000-01-01', { token: tToken });
    check('dateFrom in the distant past returns everything', list(after).length === list(techAll).length,
      `${list(after).length} vs ${list(techAll).length}`);
  }

  // ── Malformed dates must be ignored, not 500 ────────────────────────────────
  console.log('\nMalformed input is ignored (no 500, no injection)');
  const badDate = await api('/tech/orders?type=active&date=24%2F08%2F2026', { token: tToken });
  check('non-ISO date returns 200', badDate.status === 200, `got ${badDate.status}`);
  check('non-ISO date is ignored (full list)', list(badDate).length === list(techAll).length,
    `${list(badDate).length} vs ${list(techAll).length}`);

  const inject = await api(`/tech/orders?type=active&dateFrom=${encodeURIComponent("2026-01-01' OR 1=1--")}`, { token: tToken });
  check('injection-shaped date returns 200', inject.status === 200, `got ${inject.status}`);
  check('injection-shaped date is ignored', list(inject).length === list(techAll).length);

  const injectQ = await api(`/tech/orders?type=active&q=${encodeURIComponent("' OR 1=1--")}`, { token: tToken });
  check('injection-shaped q returns 200', injectQ.status === 200, `got ${injectQ.status}`);
  check('injection-shaped q matches nothing (parameterised)', list(injectQ).length === 0,
    `got ${list(injectQ).length}`);

  // ── Combined filters ───────────────────────────────────────────────────────
  console.log('\nCombined q + date');
  if (day) {
    const combo = await api(`/tech/orders?type=active&q=${encodeURIComponent(sample.orderId)}&date=${day}`, { token: tToken });
    check('q + date finds the order', codes(combo).includes(sample.orderId));

    const conflicting = await api(`/tech/orders?type=active&q=${encodeURIComponent(sample.orderId)}&date=2000-01-01`, { token: tToken });
    check('q + non-matching date returns nothing', list(conflicting).length === 0,
      `got ${list(conflicting).length}`);
  }

  // ── Scoping: search must not leak other people's orders ─────────────────────
  console.log('\nSearch stays scoped to the caller');
  const wideOpen = await api('/tech/orders?type=active&q=ORD', { token: tToken });
  check('broad "ORD" search returns 200', wideOpen.status === 200);
  check('broad search never exceeds the tech\'s own order count',
    list(wideOpen).length <= list(techAll).length,
    `${list(wideOpen).length} vs ${list(techAll).length}`);

  const clientSearch = await api('/client/orders?type=active&q=ORD', { token: cToken });
  check('client broad search returns 200', clientSearch.status === 200);
  check('client broad search stays within their own orders',
    list(clientSearch).length <= list(clientAll).length);

  // ── Unauthenticated ────────────────────────────────────────────────────────
  console.log('\nAuth still enforced on the search path');
  const noAuth = await api('/tech/orders?type=active&q=ORD');
  check('search without a token is rejected', noAuth.status === 401 || noAuth.status === 403,
    `got ${noAuth.status}`);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nSUITE ERROR:', e.message);
  process.exit(1);
});
