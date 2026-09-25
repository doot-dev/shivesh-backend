// Self-check for Phase 2 pure logic:  node scripts/verify_phase2.mjs
// Reproduces the worked examples in docs/workflow-crosscheck/07-payments-allocation.md
// and 03-credit-payments-risk.md (W35).
import assert from 'node:assert/strict';
import { planAllocation } from '../src/helper/payments.js';
import { applyExtraCredit } from '../src/helper/creditPosition.js';
import { fyLabel } from '../src/helper/numberSeries.js';

const L = 100000;
const start = [
  { id: 'A1', billNo: 'A1', projectId: 'A', issueDate: '2026-08-01', balance: 1 * L },
  { id: 'B1', billNo: 'B1', projectId: 'B', issueDate: '2026-08-05', balance: 2 * L },
  { id: 'A2', billNo: 'A2', projectId: 'A', issueDate: '2026-08-10', balance: 5 * L },
  { id: 'B2', billNo: 'B2', projectId: 'B', issueDate: '2026-08-20', balance: 3 * L },
];
const got = (p) => Object.fromEntries(p.allocations.map((a) => [a.billNo, a.amount]));

// Scenario 1 — client level, ₹4L, oldest first across projects
let p = planAllocation({ bills: start, amount: 4 * L, scope: 'CLIENT' });
assert.deepEqual(got(p), { A1: 1 * L, B1: 2 * L, A2: 1 * L });
assert.equal(p.unallocated, 0);

// Scenario 2 — project A only, ₹5L
p = planAllocation({ bills: start, amount: 5 * L, scope: 'PROJECT', projectId: 'A' });
assert.deepEqual(got(p), { A1: 1 * L, A2: 4 * L });

// Scenario 3 — selected bills 1, 3, 5 (oldest first), ₹5L
const s3 = [
  { id: '1', billNo: 'Bill 1', projectId: 'A', issueDate: '2026-08-01', balance: 2 * L },
  { id: '2', billNo: 'Bill 2', projectId: 'A', issueDate: '2026-08-02', balance: 3 * L },
  { id: '3', billNo: 'Bill 3', projectId: 'B', issueDate: '2026-08-03', balance: 1.5 * L },
  { id: '4', billNo: 'Bill 4', projectId: 'B', issueDate: '2026-08-04', balance: 2.5 * L },
  { id: '5', billNo: 'Bill 5', projectId: 'A', issueDate: '2026-08-05', balance: 4 * L },
];
p = planAllocation({ bills: s3, amount: 5 * L, scope: 'BILLS', billIds: ['Bill 1', 'Bill 3', 'Bill 5'] });
assert.deepEqual(got(p), { 'Bill 1': 2 * L, 'Bill 3': 1.5 * L, 'Bill 5': 1.5 * L });

// Manual split: Bill 5 ₹4L + Bill 1 ₹1L
p = planAllocation({ bills: s3, amount: 5 * L, scope: 'BILLS', manual: [{ billNo: 'Bill 5', amount: 4 * L }, { billNo: 'Bill 1', amount: 1 * L }] });
assert.deepEqual(got(p), { 'Bill 5': 4 * L, 'Bill 1': 1 * L });
assert.match(planAllocation({ bills: s3, amount: 5 * L, scope: 'BILLS', manual: [{ billNo: 'Bill 3', amount: 2 * L }] }).error, /more than its pending/);

// D17 — ₹5L against bills worth ₹4.7L leaves ₹30,000 not adjusted
p = planAllocation({ bills: [{ id: 'x', billNo: 'X', issueDate: '2026-08-01', balance: 3 * L }, { id: 'y', billNo: 'Y', issueDate: '2026-08-02', balance: 1.7 * L }], amount: 5 * L, scope: 'BILLS', billIds: ['X', 'Y'] });
assert.equal(p.unallocated, 30000);

// W35 extra credit — N ₹10L, grant ₹2L
const ev = (at, type, amount) => ({ at, type, amount });
let e = [ev('2026-09-01', 'up', 9 * L), ev('2026-09-01T01:00', 'grant', 2 * L)];
assert.deepEqual(applyExtraCredit(e, 10 * L), { extraUnused: 2 * L, extraInUse: 0 });
e.push(ev('2026-09-02', 'up', 2 * L));               // used 11L → ₹1L drawn
assert.deepEqual(applyExtraCredit(e, 10 * L), { extraUnused: 1 * L, extraInUse: 1 * L });
e.push(ev('2026-09-03', 'down', 5 * L));             // pay 5L → drawn part is gone
assert.deepEqual(applyExtraCredit(e, 10 * L), { extraUnused: 1 * L, extraInUse: 0 });
e.push(ev('2026-09-04', 'up', 5.5 * L));             // used 11.5L → last ₹1L drawn
assert.deepEqual(applyExtraCredit(e, 10 * L), { extraUnused: 0, extraInUse: 1 * L });
e.push(ev('2026-09-05', 'down', 3 * L));             // used 8.5L → extra fully used
assert.deepEqual(applyExtraCredit(e, 10 * L), { extraUnused: 0, extraInUse: 0 });

// Receipt series follows the Indian financial year
assert.equal(fyLabel(new Date('2027-03-31T12:00:00')), '26-27');
assert.equal(fyLabel(new Date('2027-04-01T12:00:00')), '27-28');

console.log('verify_phase2: all checks passed');
process.exit(0);
