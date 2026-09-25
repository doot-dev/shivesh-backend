import db from '../config/database.js';

/**
 * Client analytics v1 (W34, docs/workflow-crosscheck/08-client-analytics.md).
 * Computed on read from orders, trucks and bills — no new tables, no job.
 * Payment metrics are approximate until payment records exist (Phase 2): a bill
 * counts as paid on its paidAt date.
 *
 * ponytail: full scan per request; fine at hundreds of clients / thousands of
 * orders. Add a monthly snapshot table if a report passes ~2 s.
 */
const DAY = 864e5;
const qtyOf = (q) => { const n = parseFloat(String(q ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const month = (d) => new Date(d).toISOString().slice(0, 7);
const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
const OPEN = ['PENDING', 'SENT', 'OVERDUE'];

function last12Months(now) {
  const out = [];
  for (let i = 11; i >= 0; i--) out.push(new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString().slice(0, 7));
  return out;
}

/** Pure: payment behaviour from a client's bills. */
export function paymentBehaviour(bills, now = new Date()) {
  const live = bills.filter((b) => !b.isDeleted && b.status !== 'CANCELLED');
  const paid = live.filter((b) => b.status === 'PAID' && b.paidAt);
  const open = live.filter((b) => OPEN.includes(b.status));
  const dated = paid.filter((b) => b.dueDate);
  const ages = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const b of open) {
    const late = b.dueDate ? Math.floor((now - new Date(b.dueDate)) / DAY) : -1;
    const k = late < 1 ? 'notDue' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90plus';
    ages[k] = r2(ages[k] + b.amount);
  }
  const billed90 = live.filter((b) => b.issueDate && now - new Date(b.issueDate) <= 90 * DAY).reduce((s, b) => s + b.amount, 0);
  const outstanding = open.reduce((s, b) => s + b.amount, 0);
  const oldest = open.filter((b) => b.issueDate).sort((a, b) => new Date(a.issueDate) - new Date(b.issueDate))[0];
  const months = last12Months(now);
  return {
    billed: r2(live.reduce((s, b) => s + b.amount, 0)),
    collected: r2(paid.reduce((s, b) => s + b.amount, 0)),
    outstanding: r2(outstanding),
    avgDaysToPay: avg(paid.filter((b) => b.issueDate).map((b) => Math.round((new Date(b.paidAt) - new Date(b.issueDate)) / DAY))),
    avgDaysPastDue: avg(dated.map((b) => Math.round((new Date(b.paidAt) - new Date(b.dueDate)) / DAY))),
    onTimePct: dated.length ? Math.round((dated.filter((b) => new Date(b.paidAt) <= new Date(b.dueDate)).length / dated.length) * 100) : null,
    pendingByAge: ages,
    oldestOpenBill: oldest ? { billNo: oldest.billNo, days: Math.floor((now - new Date(oldest.issueDate)) / DAY) } : null,
    dso: billed90 > 0 ? Math.round((outstanding / billed90) * 90) : null,
    trend: months.map((m) => ({
      month: m,
      billed: r2(live.filter((b) => b.issueDate && month(b.issueDate) === m).reduce((s, b) => s + b.amount, 0)),
      collected: r2(paid.filter((b) => month(b.paidAt) === m).reduce((s, b) => s + b.amount, 0)),
    })),
  };
}

/** Pure: order patterns from a client's orders (with trucks). */
export function orderPatterns(orders, now = new Date()) {
  const live = orders.filter((o) => !o.isDeleted);
  const done = live.filter((o) => o.status !== 'CANCELLED');
  const vol = (o) => qtyOf(o.quantity);
  const months = last12Months(now);
  const grade = {};
  for (const o of done) grade[`${o.productName} ${o.productGrade}`] = r2((grade[`${o.productName} ${o.productGrade}`] || 0) + vol(o));
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  for (const o of done) if (/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) weekday[new Date(`${o.date}T12:00:00`).getDay()]++;
  const trucks = live.flatMap((o) => o.tmDetails || []).filter((t) => !t.isDeleted);
  const rejected = trucks.filter((t) => t.approvalStatus === 'REJECTED');
  const reasons = {};
  for (const t of rejected) { const k = (t.rejectionReason || 'Other').split(' — ')[0]; reasons[k] = (reasons[k] || 0) + 1; }
  const lastOrder = done.map((o) => new Date(o.createdAt)).sort((a, b) => b - a)[0];
  const in30 = done.filter((o) => now - new Date(o.createdAt) <= 30 * DAY).reduce((s, o) => s + vol(o), 0);
  const prev90 = done.filter((o) => { const a = now - new Date(o.createdAt); return a > 30 * DAY && a <= 120 * DAY; }).reduce((s, o) => s + vol(o), 0);
  return {
    orders: done.length,
    volume: r2(done.reduce((s, o) => s + vol(o), 0)),
    avgOrderSize: done.length ? r2(done.reduce((s, o) => s + vol(o), 0) / done.length) : null,
    largestOrder: done.length ? Math.max(...done.map(vol)) : null,
    gradeMix: Object.entries(grade).sort((a, b) => b[1] - a[1]).map(([name, volume]) => ({ name, volume })),
    byWeekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => ({ day: d, orders: weekday[i] })),
    avgLeadDays: avg(done.filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date || '')).map((o) => Math.round((new Date(`${o.date}T00:00:00`) - new Date(new Date(o.createdAt).toDateString())) / DAY))),
    cancelled: live.length - done.length,
    cancelRatePct: live.length ? Math.round(((live.length - done.length) / live.length) * 100) : null,
    siteRejections: { trucks: trucks.length, rejected: rejected.length, reasons },
    daysSinceLastOrder: lastOrder ? Math.floor((now - lastOrder) / DAY) : null,
    goingQuiet: prev90 > 0 && in30 < (prev90 / 3) / 2, // last 30 days < half the monthly average of the 90 before
    trend: months.map((m) => ({ month: m, orders: done.filter((o) => month(o.createdAt) === m).length, volume: r2(done.filter((o) => month(o.createdAt) === m).reduce((s, o) => s + vol(o), 0)) })),
  };
}

const ORDER_SELECT = {
  status: true, isDeleted: true, quantity: true, productName: true, productGrade: true, date: true, createdAt: true,
  project: { select: { projectId: true, projectName: true } },
  tmDetails: { select: { isDeleted: true, approvalStatus: true, rejectionReason: true } },
  bill: { select: { billNo: true, amount: true, status: true, issueDate: true, dueDate: true, paidAt: true, isDeleted: true } },
};

export async function getClientAnalytics(clientId, now = new Date()) {
  const client = await db.client.findFirst({ where: { clientId, isDeleted: false }, select: { id: true, clientId: true, companyName: true } });
  if (!client) return null;
  const orders = await db.order.findMany({ where: { clientId: client.id, isDeleted: false }, select: ORDER_SELECT });
  const bills = orders.map((o) => o.bill).filter(Boolean);
  const totalBilled = (await db.bill.aggregate({ where: { isDeleted: false, status: { not: 'CANCELLED' } }, _sum: { amount: true } }))._sum.amount || 0;
  const pay = paymentBehaviour(bills, now);
  return {
    client,
    payment: pay,
    orders: orderPatterns(orders, now),
    revenueSharePct: totalBilled ? r2((pay.billed / totalBilled) * 100) : null,
  };
}

/** Every client's headline metrics — the Reports tabs. */
export async function getPortfolioAnalytics(now = new Date()) {
  const clients = await db.client.findMany({
    where: { isDeleted: false },
    select: { clientId: true, companyName: true, orders: { where: { isDeleted: false }, select: ORDER_SELECT } },
  });
  const rows = clients.map((c) => {
    const bills = c.orders.map((o) => o.bill).filter(Boolean);
    return { clientId: c.clientId, companyName: c.companyName, payment: paymentBehaviour(bills, now), orders: orderPatterns(c.orders, now) };
  });
  const allBills = clients.flatMap((c) => c.orders.map((o) => o.bill).filter(Boolean));
  const allOrders = clients.flatMap((c) => c.orders);
  return { clients: rows, totals: { payment: paymentBehaviour(allBills, now), orders: orderPatterns(allOrders, now) } };
}
