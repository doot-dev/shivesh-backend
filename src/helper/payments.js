import db from '../config/database.js';
import { createActivityLog } from './activityLogger.js';
import { nextNumber } from './numberSeries.js';

/**
 * Payments and bill settlement (W21, docs/workflow-crosscheck/07-payments-allocation.md).
 *
 * Three levels: CLIENT (any unpaid bill), PROJECT (that project's bills),
 * BILLS (only the chosen bills, optional manual split). Oldest bill first.
 * Money is never spread silently: a remainder must be explicitly moved to the
 * client's advance (D17). Nothing is edited or deleted — a mistake or bounced
 * cheque is reversed (rule 8). Every step is audit-logged in the same
 * transaction (W33).
 */
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const EPS = 0.005;
export const PAYABLE = ['PENDING', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'];
const NEEDS_REFERENCE = ['CHEQUE', 'ONLINE', 'BANK_TRANSFER'];

/**
 * Pure allocation plan. bills: [{ id, billNo, issueDate, balance, projectId }].
 * Returns { allocations: [{ billId, billNo, amount }], unallocated } or { error }.
 */
export function planAllocation({ bills, amount, scope, projectId, billIds = [], manual = null }) {
  amount = r2(amount);
  if (!(amount > 0)) return { error: 'Amount must be more than 0' };
  let eligible = bills.filter((b) => b.balance > EPS);
  if (scope === 'PROJECT') {
    if (!projectId) return { error: 'Choose the project' };
    eligible = eligible.filter((b) => b.projectId === projectId);
  } else if (scope === 'BILLS') {
    if (!billIds.length && !manual?.length) return { error: 'Select the bills' };
    const chosen = new Set(manual?.length ? manual.map((m) => m.billNo) : billIds);
    eligible = eligible.filter((b) => chosen.has(b.billNo) || chosen.has(b.id));
  } else if (scope !== 'CLIENT') {
    return { error: 'scope must be CLIENT, PROJECT or BILLS' };
  }

  const allocations = [];
  if (scope === 'BILLS' && manual?.length) {
    let total = 0;
    for (const m of manual) {
      const b = eligible.find((x) => x.billNo === m.billNo);
      const amt = r2(m.amount);
      if (!b) return { error: `${m.billNo} is not an unpaid bill of this client` };
      if (!(amt > 0)) continue;
      if (amt > b.balance + EPS) return { error: `${m.billNo}: ₹${amt} is more than its pending ₹${b.balance}` };
      total = r2(total + amt);
      allocations.push({ billId: b.id, billNo: b.billNo, amount: amt });
    }
    if (total > amount + EPS) return { error: `The split (₹${total}) is more than the payment (₹${amount})` };
    return { allocations, unallocated: r2(amount - total) };
  }

  const ordered = [...eligible].sort(
    (a, b) => new Date(a.issueDate || 0) - new Date(b.issueDate || 0) || a.billNo.localeCompare(b.billNo),
  );
  let left = amount;
  for (const b of ordered) {
    if (left <= EPS) break;
    const amt = r2(Math.min(left, b.balance));
    allocations.push({ billId: b.id, billNo: b.billNo, amount: amt });
    left = r2(left - amt);
  }
  return { allocations, unallocated: r2(left) };
}

/** Unpaid bills of a client with their live balances (locks them inside a tx). */
export async function openBills(tx, clientDbId, { lock = false } = {}) {
  if (lock) {
    await tx.$queryRaw`SELECT b.id FROM Bill b JOIN \`Order\` o ON o.id = b.orderId WHERE o.clientId = ${clientDbId} FOR UPDATE`;
  }
  const bills = await tx.bill.findMany({
    where: { isDeleted: false, status: { in: PAYABLE }, order: { clientId: clientDbId, isDeleted: false } },
    select: {
      id: true, billNo: true, amount: true, issueDate: true, dueDate: true, status: true,
      order: { select: { orderId: true, project: { select: { id: true, projectId: true, projectName: true } } } },
      allocations: { where: { isReversed: false }, select: { amount: true } },
    },
  });
  return bills.map((b) => ({
    id: b.id, billNo: b.billNo, amount: b.amount, issueDate: b.issueDate, dueDate: b.dueDate, status: b.status,
    orderId: b.order.orderId, projectId: b.order.project.projectId, projectName: b.order.project.projectName,
    paid: r2(b.allocations.reduce((s, a) => s + a.amount, 0)),
    balance: r2(b.amount - b.allocations.reduce((s, a) => s + a.amount, 0)),
  }));
}

/** Re-derive a bill's status from its allocations (never typed by hand). */
export async function refreshBillStatus(tx, billId) {
  const bill = await tx.bill.findUnique({
    where: { id: billId },
    include: { allocations: { where: { isReversed: false }, include: { payment: { select: { receivedOn: true } } } } },
  });
  const paid = r2(bill.allocations.reduce((s, a) => s + a.amount, 0));
  let data;
  if (paid >= bill.amount - EPS) {
    const last = bill.allocations.map((a) => new Date(a.payment.receivedOn)).sort((a, b) => b - a)[0];
    data = { status: 'PAID', paidAt: last || new Date() };
  } else if (paid > EPS) {
    data = { status: 'PARTIALLY_PAID', paidAt: null };
  } else {
    data = { status: ['PAID', 'PARTIALLY_PAID'].includes(bill.status) ? 'SENT' : bill.status, paidAt: null };
  }
  if (data.status !== bill.status || String(data.paidAt) !== String(bill.paidAt)) {
    await tx.bill.update({ where: { id: billId }, data });
  }
  return { ...data, paid, balance: r2(bill.amount - paid) };
}

function validateInput({ amount, mode, reference, receivedOn }) {
  if (!(Number(amount) > 0)) return 'Amount must be more than 0';
  if (!['CHEQUE', 'ONLINE', 'BANK_TRANSFER', 'CASH', 'OTHER'].includes(mode)) return 'mode must be CHEQUE, ONLINE, BANK_TRANSFER, CASH or OTHER';
  if (NEEDS_REFERENCE.includes(mode) && !String(reference || '').trim()) {
    return mode === 'CHEQUE' ? 'Cheque no. is required' : 'UTR / transaction id is required';
  }
  if (receivedOn && Number.isNaN(new Date(receivedOn).getTime())) return 'receivedOn is not a valid date';
  return null;
}

/**
 * Preview (dryRun) or record a payment. Returns { payment?, plan, unallocated } or { error, status }.
 * input: { clientId (code), scope, projectId?, billIds?, allocations? (manual), amount, receivedOn,
 *          mode, reference, bankName?, chequeDate?, tdsAmount?, notes?, moveRemainderToAdvance? }
 */
export async function recordPayment(input, userId, { dryRun = false } = {}) {
  const invalid = validateInput(input);
  if (invalid) return { error: invalid, status: 400 };
  const client = await db.client.findFirst({ where: { clientId: input.clientId, isDeleted: false }, select: { id: true, clientId: true } });
  if (!client) return { error: 'Client not found', status: 404 };

  return db.$transaction(async (tx) => {
    const bills = await openBills(tx, client.id, { lock: !dryRun });
    const plan = planAllocation({
      bills, amount: input.amount, scope: input.scope, projectId: input.projectId,
      billIds: input.billIds || [], manual: input.allocations || null,
    });
    if (plan.error) return { error: plan.error, status: 400 };
    if (dryRun) return { plan, unallocated: plan.unallocated, bills };

    // D17: a leftover is never saved silently — the accountant chooses.
    if (plan.unallocated > EPS && !input.moveRemainderToAdvance) {
      return { error: `₹${plan.unallocated} is not adjusted — add more bills, or move it to extra credit (advance)`, status: 409, plan, code: 'UNADJUSTED' };
    }

    const receiptNo = await nextNumber(tx, 'SHV-RC', new Date(input.receivedOn || Date.now()));
    const payment = await tx.payment.create({
      data: {
        receiptNo, clientId: client.id, scope: input.scope, projectId: input.projectId || null,
        receivedOn: input.receivedOn ? new Date(input.receivedOn) : new Date(), amount: r2(input.amount),
        mode: input.mode, reference: String(input.reference || '').trim(), bankName: input.bankName || null,
        chequeDate: input.chequeDate ? new Date(input.chequeDate) : null,
        tdsAmount: input.tdsAmount ? r2(input.tdsAmount) : null, notes: input.notes || null, createdById: Number(userId),
        allocations: { create: plan.allocations.map((a) => ({ billId: a.billId, amount: a.amount, createdById: Number(userId) })) },
      },
      include: { allocations: true },
    });
    for (const a of plan.allocations) await refreshBillStatus(tx, a.billId);

    await createActivityLog({
      tx, strict: true, createdById: userId, event: 'PAYMENT_RECORDED', source: 'PANEL',
      title: 'Payment recorded', entityType: 'PAYMENT', entityId: payment.id, action: 'CREATED',
      paymentId: payment.id, clientRef: client.clientId,
      description: `${receiptNo}: ₹${payment.amount} by ${payment.mode}${payment.reference ? ` (${payment.reference})` : ''} — ${plan.allocations.map((a) => `${a.billNo} ₹${a.amount}`).join(', ') || 'no bills'}${plan.unallocated > EPS ? `; ₹${plan.unallocated} to advance` : ''}`,
      after: { allocations: plan.allocations, advance: plan.unallocated },
    });
    if (plan.unallocated > EPS) {
      await createActivityLog({
        tx, strict: true, createdById: userId, event: 'ADVANCE_CREATED', source: 'PANEL', title: 'Moved to extra credit (advance)',
        entityType: 'PAYMENT', entityId: payment.id, action: 'UPDATED', paymentId: payment.id, clientRef: client.clientId,
        description: `₹${plan.unallocated} of ${receiptNo} kept as the client's advance`,
      });
    }
    return { payment, plan, unallocated: plan.unallocated };
  });
}

/** Unallocated amount of a payment (= advance). */
export const unallocatedOf = (payment) =>
  r2(payment.amount - payment.allocations.filter((a) => !a.isReversed).reduce((s, a) => s + a.amount, 0));

/** "Adjust from advance": allocate a payment's remaining money to bills. */
export async function adjustFromAdvance(receiptNo, { billIds = [], allocations = null }, userId) {
  return db.$transaction(async (tx) => {
    // Receipt numbers contain '/', so URLs carry the payment id; either works here.
    const payment = await tx.payment.findFirst({ where: { OR: [{ id: receiptNo }, { receiptNo }] }, include: { allocations: true, client: { select: { clientId: true } } } });
    if (!payment || payment.status !== 'ACTIVE') return { error: 'Payment not found or reversed', status: 404 };
    const left = unallocatedOf(payment);
    if (left <= EPS) return { error: 'Nothing left to adjust on this payment', status: 409 };
    const bills = await openBills(tx, payment.clientId, { lock: true });
    const plan = planAllocation({ bills, amount: left, scope: 'BILLS', billIds, manual: allocations });
    if (plan.error) return { error: plan.error, status: 400 };
    for (const a of plan.allocations) {
      await tx.paymentAllocation.create({ data: { paymentId: payment.id, billId: a.billId, amount: a.amount, createdById: Number(userId) } });
      await refreshBillStatus(tx, a.billId);
    }
    await createActivityLog({
      tx, strict: true, createdById: userId, event: 'ADVANCE_ADJUSTED', source: 'PANEL', title: 'Adjusted from advance',
      entityType: 'PAYMENT', entityId: payment.id, action: 'UPDATED', paymentId: payment.id, clientRef: payment.client.clientId,
      description: `${payment.receiptNo}: ${plan.allocations.map((a) => `${a.billNo} ₹${a.amount}`).join(', ')}; ₹${plan.unallocated} still in advance`,
    });
    return { plan, unallocated: plan.unallocated };
  });
}

/** Reverse a payment (bounced cheque / wrong entry). Bills get their balances back. */
export async function reversePayment(receiptNo, reason, userId) {
  if (!String(reason || '').trim()) return { error: 'A reason is required', status: 400 };
  return db.$transaction(async (tx) => {
    // Receipt numbers contain '/', so URLs carry the payment id; either works here.
    const payment = await tx.payment.findFirst({ where: { OR: [{ id: receiptNo }, { receiptNo }] }, include: { allocations: true, client: { select: { clientId: true } } } });
    if (!payment) return { error: 'Payment not found', status: 404 };
    if (payment.status === 'REVERSED') return { error: 'Already reversed', status: 409 };
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'REVERSED', reversedAt: new Date(), reversedById: Number(userId), reversalReason: reason.trim() } });
    await tx.paymentAllocation.updateMany({ where: { paymentId: payment.id }, data: { isReversed: true } });
    for (const billId of new Set(payment.allocations.map((a) => a.billId))) await refreshBillStatus(tx, billId);
    await createActivityLog({
      tx, strict: true, createdById: userId, event: 'PAYMENT_REVERSED', source: 'PANEL', title: 'Payment reversed',
      entityType: 'PAYMENT', entityId: payment.id, action: 'STATUS_CHANGED', paymentId: payment.id, clientRef: payment.client.clientId,
      description: `${payment.receiptNo} (₹${payment.amount}) reversed — ${reason.trim()}`,
      before: { status: 'ACTIVE' }, after: { status: 'REVERSED' },
    });
    return { ok: true };
  });
}
