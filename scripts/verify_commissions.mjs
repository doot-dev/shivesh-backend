// Self-check for helper/commissions.js personFigures (pure, no DB).
// Run: node scripts/verify_commissions.mjs
import assert from 'node:assert/strict';
import { personFigures } from '../src/helper/commissions.js';

const d = (s) => new Date(`${s}T10:00:00`);
const bills = [
  { quantity: 6, date: d('2026-09-10') },
  { quantity: 5, date: d('2026-10-01') }, // 6 delivered, 1 part-rejected: the bill already holds the kept qty
  { quantity: 8.5, date: d('2026-10-05') },
];
const a = { ratePerM3: 50, payouts: [{ amount: 300, paidOn: '2026-09-30' }] };
const b = { ratePerM3: 30, payouts: [] };

const all = personFigures(a, bills);
assert.equal(all.totalQty, 19.5);
assert.equal(all.earned, 975);
assert.equal(all.paid, 300);
assert.equal(all.balance, 675);

const oct = personFigures(a, bills, { from: d('2026-10-01').setHours(0) && new Date('2026-10-01T00:00:00'), to: new Date('2026-10-31T23:59:59') });
assert.equal(oct.periodQty, 13.5);
assert.equal(oct.periodAmount, 675);
assert.equal(oct.periodPaid, 0);
assert.equal(oct.balance, 675); // balance is all-time, not per period

// Two people on one project each earn on the same qty at their own rate.
assert.equal(personFigures(b, bills).earned, 585);
assert.equal(personFigures(b, []).earned, 0);
console.log('verify_commissions: ok');
