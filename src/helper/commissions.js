import db from '../config/database.js';

/**
 * Commission (2026-10-02): a project has several commission people, each with
 * their own ₹/m³. Earned = the project's billed qty (Bill.quantity, i.e. the
 * accepted qty after part rejects) × that person's rate. A bill counts on its
 * issue date; cancelled and deleted bills never count.
 *
 * ponytail: the rate is the person's current one, applied to every bill. If a
 * rate is changed, past earnings move with it — add a rate history (rate +
 * effectiveFrom) when the office starts changing rates mid-project.
 */
const r2 = (n) => Math.round(n * 100) / 100;

/** Pure: one person's figures from the project's bills and their payouts. Exported for the self-check. */
export function personFigures(person, bills, { from, to } = {}) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const allQty = bills.reduce((s, b) => s + b.quantity, 0);
  const periodQty = bills.filter((b) => inRange(b.date)).reduce((s, b) => s + b.quantity, 0);
  const paid = person.payouts.reduce((s, p) => s + p.amount, 0);
  const periodPaid = person.payouts.filter((p) => inRange(new Date(p.paidOn))).reduce((s, p) => s + p.amount, 0);
  const earned = allQty * person.ratePerM3;
  return {
    periodQty: r2(periodQty),
    periodAmount: r2(periodQty * person.ratePerM3),
    periodPaid: r2(periodPaid),
    totalQty: r2(allQty),
    earned: r2(earned),
    paid: r2(paid),
    balance: r2(earned - paid),
  };
}

async function projectBills(projectIds) {
  const rows = await db.bill.findMany({
    where: { isDeleted: false, status: { not: 'CANCELLED' }, order: { isDeleted: false, projectId: { in: projectIds } } },
    select: { billNo: true, quantity: true, issueDate: true, createdAt: true, order: { select: { orderId: true, projectId: true } } },
    orderBy: { issueDate: 'asc' },
  });
  const byProject = new Map();
  for (const b of rows) {
    const list = byProject.get(b.order.projectId) ?? [];
    list.push({ billNo: b.billNo, orderId: b.order.orderId, quantity: b.quantity || 0, date: b.issueDate ?? b.createdAt });
    byProject.set(b.order.projectId, list);
  }
  return byProject;
}

const personSelect = {
  id: true, name: true, mobile: true, ratePerM3: true, createdAt: true,
  payouts: { where: { isDeleted: false }, orderBy: { paidOn: 'desc' }, select: { id: true, amount: true, paidOn: true, mode: true, reference: true, note: true, createdAt: true, createdBy: { select: { name: true } } } },
};

/** One project's people with their figures, plus the bills they are earned on. */
export async function projectCommissionStatement(projectDbId, range = {}) {
  const people = await db.projectCommission.findMany({ where: { projectId: projectDbId, isDeleted: false }, orderBy: { createdAt: 'asc' }, select: personSelect });
  const bills = (await projectBills([projectDbId])).get(projectDbId) ?? [];
  const inRange = (d) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
  return {
    people: people.map((p) => ({ ...p, ...personFigures(p, bills, range) })),
    bills: bills.filter((b) => inRange(b.date)),
  };
}

/** Every commission person across projects, for the Reports tab and its export. */
export async function commissionReport(range = {}) {
  const people = await db.projectCommission.findMany({
    where: { isDeleted: false, project: { isDeleted: false } },
    orderBy: [{ project: { projectName: 'asc' } }, { createdAt: 'asc' }],
    select: { ...personSelect, project: { select: { id: true, projectId: true, projectName: true, client: { select: { companyName: true } } } } },
  });
  const bills = await projectBills([...new Set(people.map((p) => p.project.id))]);
  return people.map(({ payouts, project, ...p }) => ({
    ...p,
    projectId: project.projectId,
    projectName: project.projectName,
    client: project.client?.companyName ?? '',
    ...personFigures({ ...p, payouts }, bills.get(project.id) ?? [], range),
  }));
}

/** R14 for xlsx.addRegisterSheet (reports.export). */
export async function commissionRegister(from, to) {
  const rows = await commissionReport({ from, to });
  return {
    name: 'R14 Commission', title: 'Commission due (billed qty × rate)',
    columns: [
      { header: 'Project', key: 'projectName', type: 'text', width: 28 }, { header: 'Client', key: 'client', type: 'text', width: 28 },
      { header: 'Commission person', key: 'name', type: 'text', width: 24 }, { header: 'Mobile', key: 'mobile', type: 'text' },
      { header: 'Rate / m³', key: 'ratePerM3', type: 'money' },
      { header: 'Billed qty (period)', key: 'periodQty', type: 'qty' }, { header: 'Commission (period)', key: 'periodAmount', type: 'money' },
      { header: 'Paid (period)', key: 'periodPaid', type: 'money' },
      { header: 'Earned (all time)', key: 'earned', type: 'money' }, { header: 'Paid (all time)', key: 'paid', type: 'money' },
      { header: 'Balance due', key: 'balance', type: 'money' },
    ],
    rows,
    totals: ['periodQty', 'periodAmount', 'periodPaid', 'earned', 'paid', 'balance'],
  };
}
