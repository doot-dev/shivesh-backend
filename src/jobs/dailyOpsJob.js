import db from '../config/database.js';
import logger from '../helper/logger.js';
import { sendNotification, notifyAdmins, ADMIN_TARGET_ID } from '../helper/notificationHelper.js';
import { todayIso } from '../helper/deliveryDateHelper.js';
import { billBlocker } from '../helper/orderCompletion.js';
import { getCreditPosition } from '../helper/creditPosition.js';

/**
 * One daily sweep for field follow-ups (W36, W12/P1.7):
 *   1. cube test due tomorrow / today, no result yet  → assigned technicians
 *   2. cube result still missing 3+ days after due     → admin bell (once)
 *   3. COMPLETED order not billed because challans are  → technicians daily,
 *      missing or unreviewed                               admin bell after 3 days
 *
 * Idempotent like orderReminderJob: each send is keyed in Notification.relatedId,
 * so a restart never double-sends. Sequential sends, no Promise.all fan-out.
 */
const TYPE = 'OPS_REMINDER';
const DAY = 86400000;

async function sentAlready(targetType, targetId, key) {
  return Boolean(await db.notification.findFirst({ where: { type: TYPE, targetType, targetId: String(targetId), relatedId: key }, select: { id: true } }));
}

async function sendOnce(target, key, title, message, orderId) {
  if (await sentAlready(target.targetType, target.targetId, key)) return 0;
  if (target.targetType === 'ADMIN') await notifyAdmins({ title, message, type: TYPE, relatedId: key, orderId });
  else await sendNotification({ ...target, targetId: String(target.targetId), title, message, type: TYPE, relatedId: key, orderId });
  return 1;
}

const techsOf = (order) => order.technicians.filter((t) => !t.isDeleted).map((t) => ({ targetType: 'FIELD_TECH', targetId: t.userId }));

export async function runDailyOpsSweep(now = new Date()) {
  const today = todayIso(now);
  const startToday = new Date(`${today}T00:00:00`);
  let sent = 0;

  // 1 + 2. Cube tests without a result.
  const tests = await db.cubeTest.findMany({
    where: { isDeleted: false, fileUrl: null, toDate: { lt: new Date(startToday.getTime() + 2 * DAY) }, order: { isDeleted: false } },
    include: { order: { include: { technicians: true } } },
  });
  for (const ct of tests) {
    const dayDiff = Math.floor((new Date(ct.toDate).setHours(0, 0, 0, 0) - startToday) / DAY);
    const code = ct.order.orderId;
    if (dayDiff === 1 || dayDiff === 0) {
      const when = dayDiff ? 'tomorrow' : 'today';
      for (const t of techsOf(ct.order)) {
        sent += await sendOnce(t, `${ct.id}:due-${when}`, `Cube test due ${when}`, `Cube test on ${code} (cast ${new Date(ct.castingDate).toDateString()}) is due ${when}`, ct.order.id);
      }
    } else if (dayDiff <= -3) {
      sent += await sendOnce({ targetType: 'ADMIN', targetId: ADMIN_TARGET_ID }, `${ct.id}:missing`, 'Cube test result missing', `Cube test on ${code} was due ${new Date(ct.toDate).toDateString()} — no result uploaded yet`, ct.order.id);
    }
  }

  // 3. Completed but unbilled because of challans.
  const orders = await db.order.findMany({
    where: { isDeleted: false, status: 'COMPLETED', bill: null },
    include: { tmDetails: { where: { isDeleted: false } }, technicians: true },
  });
  for (const o of orders) {
    const blocker = billBlocker(o.tmDetails);
    if (!blocker) continue;
    for (const t of techsOf(o)) {
      sent += await sendOnce(t, `${o.id}:challans:${today}`, 'Challans missing', `Order ${o.orderId} can't be billed — ${blocker}`, o.id);
    }
    if (now - new Date(o.updatedAt) > 3 * DAY) {
      sent += await sendOnce({ targetType: 'ADMIN', targetId: ADMIN_TARGET_ID }, `${o.id}:challans:${today}`, 'Order awaiting challans', `${o.orderId} completed but unbilled for 3+ days — ${blocker}`, o.id);
    }
  }

  // 4. P2.11 payment reminders: 3 days before due, on due, 7/15/30 days overdue.
  const openBills = await db.bill.findMany({
    where: { isDeleted: false, status: { in: ['PENDING', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'] }, NOT: { dueDate: null }, order: { isDeleted: false } },
    include: { order: { select: { id: true, orderId: true, clientId: true } }, allocations: { where: { isReversed: false }, select: { amount: true } } },
  });
  for (const b of openBills) {
    const balance = b.amount - b.allocations.reduce((s, a) => s + a.amount, 0);
    if (balance <= 0.005) continue;
    const d = Math.floor((startToday - new Date(new Date(b.dueDate).setHours(0, 0, 0, 0))) / DAY); // + = days overdue
    const stage = d === -3 ? 'before-3' : d === 0 ? 'due' : [7, 15, 30].includes(d) ? `overdue-${d}` : null;
    if (!stage) continue;
    const amt = `₹${Math.round(balance).toLocaleString('en-IN')}`;
    const msg = d < 0 ? `Bill ${b.billNo} (${amt}) is due in 3 days` : d === 0 ? `Bill ${b.billNo} (${amt}) is due today` : `Bill ${b.billNo} (${amt}) is ${d} days overdue`;
    sent += await sendOnce({ targetType: 'CLIENT', targetId: b.order.clientId }, `${b.id}:${stage}`, d > 0 ? 'Payment overdue' : 'Payment due', msg, b.order.id);
    if (d >= 7) sent += await sendOnce({ targetType: 'ADMIN', targetId: ADMIN_TARGET_ID }, `${b.id}:${stage}`, 'Payment overdue', msg, b.order.id);
  }

  // 5. 80% of the credit limit (W25), once per client per day.
  const clients = await db.client.findMany({ where: { isDeleted: false, creditLimit: { gt: 0 } }, select: { id: true } });
  for (const c of clients) {
    const pos = await getCreditPosition(c.id, now);
    if (pos.used >= 0.8 * (pos.limit + pos.extra) && pos.used < pos.limit + pos.extra) {
      sent += await sendOnce({ targetType: 'CLIENT', targetId: c.id }, `${c.id}:credit80:${today}`, 'Credit almost used', `You have used ${Math.round((pos.used / (pos.limit + pos.extra)) * 100)}% of your credit. Available: ₹${Math.round(pos.available).toLocaleString('en-IN')}`, null);
    }
  }

  logger.info(`Daily ops sweep ${today}: ${sent} reminder(s) sent`);
  return { sent };
}

let timer = null;

/** Daily at OPS_REMINDER_HOUR (default 9:00), self-correcting like orderReminderJob. */
export function startDailyOpsJob() {
  if (process.env.OPS_REMINDER_ENABLED === 'false') return logger.info('Daily ops job disabled via OPS_REMINDER_ENABLED=false');
  const hour = Number(process.env.OPS_REMINDER_HOUR ?? 9);
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    timer = setTimeout(async () => {
      try { await runDailyOpsSweep(); } catch (err) { logger.error('Daily ops sweep failed:', err.message); }
      scheduleNext();
    }, next - now);
    timer.unref?.();
  };
  scheduleNext();
}

export function stopDailyOpsJob() {
  if (timer) clearTimeout(timer);
  timer = null;
}
