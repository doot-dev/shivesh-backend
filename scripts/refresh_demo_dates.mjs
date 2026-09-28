// Move active orders whose delivery date has passed to today (under way) or
// tomorrow (not yet dispatched), so the demo shows live work in the default date
// window. Completed and cancelled orders keep their real dates.
//
//   TZ=Asia/Kolkata node scripts/refresh_demo_dates.mjs          # dry run
//   TZ=Asia/Kolkata node scripts/refresh_demo_dates.mjs --apply
import db from '../src/config/database.js';
import { ACTIVE_STATUSES } from '../src/helper/orderStatus.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = parse(iso(new Date()));

const stale = (await db.order.findMany({
  where: { isDeleted: false, status: { in: ACTIVE_STATUSES }, date: { not: null } },
  select: { id: true, orderId: true, status: true, date: true },
})).filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && parse(o.date) < today);

if (!stale.length) {
  console.log('Nothing to move.');
} else {
  // Same rule as the demo seed: work under way is today, not yet dispatched is tomorrow.
  const tomorrow = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  for (const o of stale) {
    const next = ['NEW', 'CONFIRMED'].includes(o.status) ? tomorrow : iso(today);
    console.log(`${o.orderId} ${o.status}: ${o.date} -> ${next}`);
    if (process.argv.includes('--apply')) await db.order.update({ where: { id: o.id }, data: { date: next } });
  }
  console.log(process.argv.includes('--apply') ? `Moved ${stale.length} order(s).` : 'Dry run. Add --apply to write.');
}
await db.$disconnect();
