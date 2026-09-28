import db from '../config/database.js';
import { ACTIVE_STATUSES } from './orderStatus.js';

/**
 * getCreditPosition — THE credit numbers (W18, v2 for Phase 2). The client app,
 * the panel, the reports and the credit gate all read this.
 *
 *   limit (N)   = Client.creditLimit (fallback: Σ project limits for old data)
 *   creditDays  = Client.creditDays  (fallback: shortest project period)
 *   outstanding = Σ unpaid bill balances − advance
 *   unbilled    = trucks with a challan, not rejected, on unbilled orders (D18)
 *   used        = outstanding + unbilled
 *   extra       = one-time extra credit (W35): unused + in use
 *   available   = N + extra − used
 *   flag        = OVERDUE (any balance past due) | OVER_LIMIT | OK
 */
/**
 * Credit health for people who must not see amounts (panel roles, field techs,
 * client contacts other than the Owner). Drawn as a gauge of four equal
 * segments, green → yellow → orange → red, with a marker at `position` (0–100).
 * Never blocks an order (2026-09-28): it only warns, and the team decides.
 *   RED    = overdue, or already at/over the limit
 *   ORANGE = 80 %+ used, or open orders would take it over the limit
 *   YELLOW = 50 %+ used
 *   GREEN  = the rest, and any client with no limit set
 * ponytail: fixed 50/80 lines; move them to Settings if the office wants to tune them.
 */
export function creditBand({ flag, limit, used, pending = 0 }) {
  const usedPct = limit > 0 ? Math.min(100, Math.max(0, Math.round((used / limit) * 100))) : 0;
  const band = flag !== 'OK' ? 'RED'
    : limit > 0 && (usedPct >= 80 || used + pending > limit) ? 'ORANGE'
      : usedPct >= 50 ? 'YELLOW'
        : 'GREEN';
  // Marker inside the band's quarter, moved along by how much is used.
  const within = { GREEN: usedPct / 50, YELLOW: (usedPct - 50) / 30, ORANGE: (usedPct - 80) / 20, RED: 0.5 }[band];
  const start = { GREEN: 0, YELLOW: 25, ORANGE: 50, RED: 75 }[band];
  const position = Math.round(start + 25 * Math.min(0.9, Math.max(0.1, within)));
  return { band, usedPct, position };
}

/** Band only — safe to send to anyone. */
export async function getCreditBand(clientDbId) {
  const { band, usedPct, position } = await getCreditPosition(clientDbId);
  return { band, usedPct, position };
}

const PAYABLE = ['PENDING', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'];
const r2 = (n) => Math.round(n * 100) / 100;
const qtyOf = (q) => { const n = parseFloat(String(q ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * W35 / D20 extra credit, replayed from events in date order (pure, tested).
 * events: { at, type: 'grant'|'revoke'|'up'|'down', amount }
 * Drawn only when usage goes above N; a drawn part never refills.
 */
export function applyExtraCredit(events, N) {
  let unused = 0; let inUse = 0; let used = 0;
  for (const e of [...events].sort((a, b) => new Date(a.at) - new Date(b.at))) {
    if (e.type === 'grant') unused += e.amount;
    else if (e.type === 'revoke') unused = 0;
    else if (e.type === 'up') {
      const over = Math.max(0, used + e.amount - N - inUse);
      const draw = Math.min(unused, over);
      unused -= draw; inUse += draw; used += e.amount;
    } else if (e.type === 'down') {
      used -= e.amount;
      inUse = Math.min(inUse, Math.max(0, used - N));
    }
  }
  return { extraUnused: r2(unused), extraInUse: r2(inUse) };
}

export async function getCreditPosition(clientDbId, now = new Date()) {
  const [client, projects, orders, payments, extras] = await Promise.all([
    db.client.findUnique({ where: { id: clientDbId }, select: { creditLimit: true, creditDays: true } }),
    db.project.findMany({
      where: { clientId: clientDbId, isDeleted: false },
      select: { id: true, projectId: true, projectName: true, creditAmount: true, creditResetPeriodDays: true },
    }),
    db.order.findMany({
      where: { clientId: clientDbId, isDeleted: false, status: { not: 'CANCELLED' } },
      select: {
        orderId: true, status: true, quantity: true,
        projectId: true, productName: true, productGrade: true, rate: true,
        bill: { select: { id: true, amount: true, status: true, dueDate: true, issueDate: true, isDeleted: true, allocations: { where: { isReversed: false }, select: { amount: true } } } },
        tmDetails: { where: { isDeleted: false, NOT: { challanUrl: null }, approvalStatus: { not: 'REJECTED' } }, select: { qty: true, rejectedQty: true, deliveredAt: true, updatedAt: true } },
        extras: { where: { removedAt: null }, select: { amount: true, createdAt: true } },
      },
    }),
    db.payment.findMany({ where: { clientId: clientDbId, status: 'ACTIVE' }, select: { amount: true, receivedOn: true, allocations: { where: { isReversed: false }, select: { amount: true } } } }),
    db.clientCreditExtra.findMany({ where: { clientId: clientDbId }, select: { amount: true, createdAt: true, status: true, revokedAt: true } }),
  ]);

  const limit = client?.creditLimit ?? projects.reduce((s, p) => s + (p.creditAmount || 0), 0);
  const projDays = projects.map((p) => p.creditResetPeriodDays).filter((d) => d > 0);
  const creditDays = client?.creditDays ?? (projDays.length ? Math.min(...projDays) : null);

  const priced = await db.projectProduct.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true, productName: true, productGrade: true, costPrice: true },
  });
  const rates = Object.fromEntries(priced.map((p) => [`${p.projectId}|${p.productName}|${p.productGrade}`, p.costPrice]));

  const bills = orders.map((o) => o.bill).filter((b) => b && !b.isDeleted && PAYABLE.includes(b.status))
    .map((b) => ({ ...b, balance: r2(b.amount - b.allocations.reduce((s, a) => s + a.amount, 0)) }));
  const advance = r2(payments.reduce((s, p) => s + p.amount - p.allocations.reduce((x, a) => x + a.amount, 0), 0));
  const billBalances = bills.reduce((s, b) => s + b.balance, 0);
  const unbilledTrucks = orders.filter((o) => !o.bill || o.bill.isDeleted).flatMap((o) =>
    o.tmDetails.map((t) => ({ value: Math.max(0, qtyOf(t.qty) - (t.rejectedQty || 0)) * (o.rate ?? rates[`${o.projectId}|${o.productName}|${o.productGrade}`] ?? 0), at: t.deliveredAt || t.updatedAt })));
  // Extra services (pumping, part load) on orders not billed yet count as used
  // from the moment they are added; billed ones are inside the bill amount.
  const unbilledExtras = orders.filter((o) => !o.bill || o.bill.isDeleted).flatMap((o) => o.extras.map((x) => ({ value: x.amount, at: x.createdAt })));
  unbilledTrucks.push(...unbilledExtras);
  const unbilled = unbilledTrucks.reduce((s, t) => s + t.value, 0);
  // Open orders not yet counted: booked value minus trucks already in `unbilled`.
  const pendingByOrder = Object.fromEntries(orders
    .filter((o) => ACTIVE_STATUSES.includes(o.status) && (!o.bill || o.bill.isDeleted))
    .map((o) => {
      const rate = o.rate ?? rates[`${o.projectId}|${o.productName}|${o.productGrade}`] ?? 0;
      const counted = o.tmDetails.reduce((s, t) => s + qtyOf(t.qty), 0); // booked qty used up, wasted part included
      return [o.orderId, r2(Math.max(0, qtyOf(o.quantity) - counted) * rate)];
    }));
  const pending = r2(Object.values(pendingByOrder).reduce((s, v) => s + v, 0));
  const outstanding = r2(billBalances - advance);
  const used = r2(outstanding + unbilled);

  // W35 replay: usage up = bills issued + unbilled trucks; down = payments.
  const events = [
    ...extras.map((x) => ({ at: x.createdAt, type: 'grant', amount: x.amount })),
    ...extras.filter((x) => x.status === 'REVOKED' && x.revokedAt).map((x) => ({ at: x.revokedAt, type: 'revoke' })),
    ...orders.map((o) => o.bill).filter((b) => b && !b.isDeleted && b.status !== 'CANCELLED').map((b) => ({ at: b.issueDate, type: 'up', amount: b.amount })),
    ...unbilledTrucks.map((t) => ({ at: t.at, type: 'up', amount: t.value })),
    ...payments.map((p) => ({ at: p.receivedOn, type: 'down', amount: p.amount })),
  ];
  const { extraUnused, extraInUse } = applyExtraCredit(events, limit);
  const extra = r2(extraUnused + extraInUse);

  const overdue = bills.filter((b) => b.balance > 0.005 && b.dueDate && new Date(b.dueDate) < now);
  const overdueAmount = r2(overdue.reduce((s, b) => s + b.balance, 0));
  const due = bills.filter((b) => b.dueDate && new Date(b.dueDate) >= now).map((b) => new Date(b.dueDate)).sort((a, b) => a - b);

  const byProject = projects.map((p) => {
    const mine = orders.filter((o) => o.projectId === p.id).map((o) => o.bill).filter((b) => b && !b.isDeleted && PAYABLE.includes(b.status));
    return { projectId: p.projectId, projectName: p.projectName, outstanding: r2(mine.reduce((s, b) => s + b.amount - b.allocations.reduce((x, a) => x + a.amount, 0), 0)) };
  });

  const flag = overdue.length ? 'OVERDUE' : limit > 0 && used >= limit + extra ? 'OVER_LIMIT' : 'OK';
  const available = r2(limit + extra - used);
  return {
    ...creditBand({ flag, limit: limit + extra, used, pending }),
    limit: r2(limit),
    creditDays,
    extraUnused, extraInUse, extra,
    outstanding, advance, unbilled: r2(unbilled), used,
    available,
    pending,
    pendingByOrder,
    // What stays free once every open order is delivered.
    availableAfterPending: r2(available - pending),
    overdueAmount,
    overdueBillCount: overdue.length,
    oldestOverdueDays: overdue.reduce((m, b) => Math.max(m, Math.floor((now - new Date(b.dueDate)) / 864e5)), 0),
    nextDueDate: due[0] ?? null,
    daysLeft: due[0] ? Math.ceil((due[0] - now) / 864e5) : null,
    flag,
    byProject,
  };
}
