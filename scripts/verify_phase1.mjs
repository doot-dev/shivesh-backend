// Self-check for Phase 1A pure logic (no DB):  node scripts/verify_phase1.mjs
import assert from 'node:assert/strict';
import { billBlocker, acceptedQuantity } from '../src/helper/orderCompletion.js';
import { orderStatusBlocked } from '../src/helper/orderStatus.js';
import { orderEditableUntil, isOrderLocked } from '../src/helper/updateWindow.js';
import { resolveToDate, cubeTestStatus } from '../src/helper/cubeTest.js';
import { quantityError } from '../src/helper/orderValidation.js';

const tm = (o) => ({ tmNumber: 'TM 01', qty: '6', challanNo: 'C1', challanUrl: '/uploads/x.jpg', approvalStatus: 'ACCEPTED', isDeleted: false, ...o });

// P1.1 billIfReady rules (D13, D4, D18)
assert.equal(billBlocker([]), 'no accepted trucks yet');
assert.match(billBlocker([tm({ challanUrl: null })]), /awaiting challans: 1 of 1/);
assert.match(billBlocker([tm({ approvalStatus: 'PENDING' })]), /awaiting challans/);
assert.equal(billBlocker([tm(), tm({ approvalStatus: 'REJECTED', challanUrl: null })]), null); // rejected truck needs no challan
assert.equal(acceptedQuantity([tm({ qty: '6' }), tm({ qty: '6 m3' }), tm({ qty: '4.5', approvalStatus: 'REJECTED' })]), 12);
assert.equal(acceptedQuantity([tm({ qty: 'six' })]), null);

// W9 transitions
assert.equal(orderStatusBlocked('NEW', 'CONFIRMED'), null);
assert.match(orderStatusBlocked('COMPLETED', 'NEW'), /cannot move/);
assert.match(orderStatusBlocked('CANCELLED', 'DISPATCHED'), /cannot move/);
assert.equal(orderStatusBlocked('REACHED', 'REACHED'), null);
// One status (2026-09-26): Delayed before Reached, cleared by the next step.
assert.equal(orderStatusBlocked('CONFIRMED', 'DISPATCHED'), null);
assert.equal(orderStatusBlocked('DISPATCHED', 'DELAYED'), null);
assert.equal(orderStatusBlocked('DELAYED', 'REACHED'), null);
assert.match(orderStatusBlocked('REACHED', 'DELAYED'), /cannot move/);
assert.match(orderStatusBlocked('REACHED', 'DISPATCHED'), /cannot move/);
assert.match(orderStatusBlocked('DISPATCHED', 'CANCELLED'), /cannot move/);
assert.match(orderStatusBlocked('NEW', 'DISPATCHED'), /cannot move/);

// W37 window: 30 days from the delivery date, end of day
const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); }; // local YYYY-MM-DD (UTC broke 00:00–05:30 IST)
assert.equal(isOrderLocked({ date: day(30), createdAt: new Date() }), false);
assert.equal(isOrderLocked({ date: day(31), createdAt: new Date() }), true);
assert.equal(orderEditableUntil({ date: '2026-01-01' }).getDate(), 31);

// W36 cube tests
const cast = new Date(); cast.setDate(cast.getDate() - 20);
assert.equal(Math.round((resolveToDate('FIFTEEN_DAYS', cast).toDate - cast) / 864e5), 15);
assert.equal(Math.round((resolveToDate('TWENTYEIGHT_DAYS', cast).toDate - cast) / 864e5), 28);
assert.match(resolveToDate('SEVEN_DAYS', new Date(Date.now() + 3 * 864e5)).error, /future/);
assert.match(resolveToDate('CUSTOM', cast, new Date(cast - 864e5)).error, /before the casting/);
assert.match(resolveToDate('SEVEN_DAYS', cast, null, { date: day(0) }).error, /before the order/);
assert.equal(cubeTestStatus({ fileUrl: null, toDate: new Date(Date.now() + 864e5) }), 'SCHEDULED');
assert.equal(cubeTestStatus({ fileUrl: null, toDate: new Date(Date.now() - 864e5) }), 'DUE');
assert.equal(cubeTestStatus({ fileUrl: '/uploads/r.pdf', toDate: new Date() }), 'RESULT_ADDED');

// W4 quantities
assert.equal(quantityError('30 m3'), null);
assert.ok(quantityError('thirty'));

console.log('verify_phase1: all checks passed');
process.exit(0);
