import db from '../config/database.js';

/**
 * getCreditPosition — THE credit numbers (W18). The client app, the panel and
 * the reports all read this, so they can never disagree.
 *
 * v1 (Phase 1): no payment records yet, so "outstanding" is the full amount of
 * every unpaid bill. Phase 2 swaps in bill balances, advance and extra credit,
 * and moves the limit onto the client (P2.1) — callers don't change.
 *
 *   limit       = Σ project credit limits   (until Client.creditLimit, P2.1)
 *   creditDays  = shortest project credit period
 *   outstanding = Σ unpaid bills (PENDING / SENT / OVERDUE)
 *   unbilled    = Σ qty × rate of trucks with a challan, not rejected, on orders
 *                 with no bill yet (D18)
 *   used        = outstanding + unbilled;  available = limit − used
 *   flag        = OVERDUE (any unpaid bill past due) | OVER_LIMIT | OK
 */
const OPEN = ['PENDING', 'SENT', 'OVERDUE'];
const r2 = (n) => Math.round(n * 100) / 100;
const qtyOf = (q) => { const n = parseFloat(String(q ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Pure core — exported for scripts/verify_phase1b.mjs. */
export function computeCreditPosition({ projects, bills, unbilledTrucks, rates }, now = new Date()) {
  const limit = projects.reduce((s, p) => s + (p.creditAmount || 0), 0);
  const days = projects.map((p) => p.creditResetPeriodDays).filter((d) => d > 0);
  const open = bills.filter((b) => OPEN.includes(b.status) && !b.isDeleted);
  const outstanding = open.reduce((s, b) => s + (b.amount || 0), 0);
  const overdueBills = open.filter((b) => b.dueDate && new Date(b.dueDate) < now);
  const overdueAmount = overdueBills.reduce((s, b) => s + (b.amount || 0), 0);
  const unbilled = unbilledTrucks.reduce((s, t) => s + qtyOf(t.qty) * (rates[t.rateKey] || 0), 0);
  const used = outstanding + unbilled;
  const due = open.filter((b) => b.dueDate && new Date(b.dueDate) >= now).map((b) => new Date(b.dueDate)).sort((a, b) => a - b);
  const oldestOverdueDays = overdueBills.reduce((m, b) => Math.max(m, Math.floor((now - new Date(b.dueDate)) / 864e5)), 0);

  return {
    limit: r2(limit),
    creditDays: days.length ? Math.min(...days) : null,
    outstanding: r2(outstanding),
    unbilled: r2(unbilled),
    used: r2(used),
    available: r2(limit - used),
    overdueAmount: r2(overdueAmount),
    overdueBillCount: overdueBills.length,
    oldestOverdueDays,
    nextDueDate: due[0] ?? null,
    daysLeft: due[0] ? Math.ceil((due[0] - now) / 864e5) : null,
    flag: overdueBills.length ? 'OVERDUE' : limit > 0 && used >= limit ? 'OVER_LIMIT' : 'OK',
  };
}

/** Credit position for a client (DB id), with a per-project outstanding breakdown. */
export async function getCreditPosition(clientDbId, now = new Date()) {
  const [projects, orders] = await Promise.all([
    db.project.findMany({
      where: { clientId: clientDbId, isDeleted: false },
      select: { id: true, projectId: true, projectName: true, creditAmount: true, creditResetPeriodDays: true },
    }),
    db.order.findMany({
      where: { clientId: clientDbId, isDeleted: false, status: { not: 'CANCELLED' } },
      select: {
        projectId: true, productName: true, productGrade: true,
        bill: { select: { amount: true, status: true, dueDate: true, isDeleted: true } },
        tmDetails: { where: { isDeleted: false, NOT: { challanUrl: null }, approvalStatus: { not: 'REJECTED' } }, select: { qty: true } },
      },
    }),
  ]);

  const priced = await db.projectProduct.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true, productName: true, productGrade: true, costPrice: true },
  });
  const rates = Object.fromEntries(priced.map((p) => [`${p.projectId}|${p.productName}|${p.productGrade}`, p.costPrice]));

  const bills = orders.map((o) => o.bill).filter(Boolean);
  const unbilledTrucks = orders
    .filter((o) => !o.bill || o.bill.isDeleted)
    .flatMap((o) => o.tmDetails.map((t) => ({ qty: t.qty, rateKey: `${o.projectId}|${o.productName}|${o.productGrade}` })));

  const byProject = projects.map((p) => {
    const mine = orders.filter((o) => o.projectId === p.id);
    const out = mine.map((o) => o.bill).filter((b) => b && !b.isDeleted && OPEN.includes(b.status)).reduce((s, b) => s + b.amount, 0);
    return { projectId: p.projectId, projectName: p.projectName, outstanding: r2(out) };
  });

  return { ...computeCreditPosition({ projects, bills, unbilledTrucks, rates }, now), byProject };
}
