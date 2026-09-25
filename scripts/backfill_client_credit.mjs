// P2.1 one-off: copy credit from projects to the client (D10: credit is per client).
//   creditLimit = Σ live project limits, creditDays = shortest project period.
// Only fills clients that have no creditLimit yet. Also sets missing due dates
// on open bills (P2.7: bill date + client credit days). Safe to re-run.
import db from '../src/config/database.js';

const clients = await db.client.findMany({
  where: { isDeleted: false },
  select: { id: true, clientId: true, companyName: true, creditLimit: true, creditDays: true, projects: { where: { isDeleted: false }, select: { creditAmount: true, creditResetPeriodDays: true } } },
});
const report = [];
for (const c of clients) {
  const limit = c.projects.reduce((s, p) => s + (p.creditAmount || 0), 0);
  const days = c.projects.map((p) => p.creditResetPeriodDays).filter((d) => d > 0);
  const data = {};
  if (c.creditLimit == null && limit > 0) data.creditLimit = limit;
  if (c.creditDays == null && days.length) data.creditDays = Math.min(...days);
  if (Object.keys(data).length) await db.client.update({ where: { id: c.id }, data });
  const creditDays = c.creditDays ?? data.creditDays;
  let dueFixed = 0;
  if (creditDays) {
    const bills = await db.bill.findMany({ where: { isDeleted: false, dueDate: null, status: { in: ['PENDING', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'] }, order: { clientId: c.id } } });
    for (const b of bills) {
      const due = new Date(b.issueDate || b.createdAt); due.setDate(due.getDate() + creditDays);
      await db.bill.update({ where: { id: b.id }, data: { dueDate: due } });
      dueFixed++;
    }
  }
  report.push({ client: c.clientId, name: c.companyName.slice(0, 28), limit: c.creditLimit ?? data.creditLimit ?? null, days: creditDays ?? null, dueDatesSet: dueFixed });
}
console.table(report);
process.exit(0);
