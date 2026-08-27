import db from '../config/database.js';
import logger from '../helper/logger.js';
import { sendNotification } from '../helper/notificationHelper.js';
import { todayIso } from '../helper/deliveryDateHelper.js';

/**
 * Daily "you haven't booked tomorrow's delivery yet" reminder for clients.
 *
 * A client is reminded when ALL of these hold:
 *   - they are active (not deleted / not blocked),
 *   - they own at least one ACTIVE project (no project = nothing to order for),
 *   - they have NO non-cancelled order dated tomorrow,
 *   - they have not already been reminded for tomorrow (idempotency).
 *
 * FOUR THINGS THAT LOOK WRONG BUT ARE NOT:
 *  1. Order.date is a STRING `YYYY-MM-DD`, not a DateTime, so tomorrow is
 *     computed as an ISO string and compared with plain equality. Passing a
 *     Date here matches nothing.
 *  2. Idempotency keys off the Notification table, not an in-memory flag: the
 *     process restarts (pm2 watch, deploys) and an in-memory guard would let a
 *     restart re-send every reminder. relatedId holds the target date so the
 *     lookup is a single indexed query.
 *  3. Tomorrow is derived with calendar arithmetic via Date.UTC rather than
 *     `new Date(Date.now() + 86400000)`, which lands on the wrong day across a
 *     DST boundary (a 23- or 25-hour local day).
 *  4. Reminders are sent sequentially, not with Promise.all: a large client
 *     list would otherwise open hundreds of concurrent FCM calls and DB writes.
 */

export const REMINDER_TYPE = 'ORDER_REMINDER';

/** Tomorrow as ISO `YYYY-MM-DD`, DST-safe (pure calendar arithmetic). */
export function tomorrowIso(now = new Date()) {
  const today = todayIso(now);
  const [y, m, d] = today.split('-').map(Number);
  // Date.UTC normalises month/day overflow: 2025-12-31 + 1 -> 2026-01-01.
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Run one reminder sweep. Exported separately from the scheduler so it can be
 * triggered manually (admin endpoint / one-off script) and unit-tested.
 *
 * @returns {Promise<{ target: string, reminded: number, skipped: number }>}
 */
export async function runOrderReminderSweep(now = new Date()) {
  const target = tomorrowIso(now);

  // Clients that already have an order booked for tomorrow — these are done.
  const bookedRows = await db.order.findMany({
    where: {
      date: target,
      isDeleted: false,
      status: { not: 'CANCELLED' },
    },
    select: { clientId: true },
    distinct: ['clientId'],
  });
  const booked = new Set(bookedRows.map((r) => r.clientId));

  // Clients already reminded for this exact date — survives a process restart.
  const remindedRows = await db.notification.findMany({
    where: { targetType: 'CLIENT', type: REMINDER_TYPE, relatedId: target },
    select: { targetId: true },
  });
  const alreadyReminded = new Set(remindedRows.map((r) => r.targetId));

  // Only clients with at least one ACTIVE project can place an order at all.
  const clients = await db.client.findMany({
    where: {
      isDeleted: false,
      projects: { some: { status: 'ACTIVE', isDeleted: false } },
    },
    select: { id: true, companyName: true },
  });

  let reminded = 0;
  let skipped = 0;

  for (const client of clients) {
    if (booked.has(client.id) || alreadyReminded.has(client.id)) {
      skipped += 1;
      continue;
    }

    try {
      await sendNotification({
        targetType: 'CLIENT',
        targetId: client.id,
        title: 'Place tomorrow\'s order',
        message:
          'You have not booked a delivery for tomorrow yet. Place your order now to secure a slot.',
        type: REMINDER_TYPE,
        // relatedId doubles as the idempotency key for this sweep.
        relatedId: target,
      });
      reminded += 1;
    } catch (err) {
      // One bad client must not abort the whole sweep.
      logger.error(`Order reminder failed for client ${client.id}:`, err.message);
    }
  }

  logger.info(
    `Order reminder sweep for ${target}: ${reminded} reminded, ${skipped} skipped (already booked or notified)`,
  );

  return { target, reminded, skipped };
}

/**
 * Schedule the daily sweep at REMINDER_HOUR local time.
 *
 * Uses a self-correcting setTimeout chain rather than setInterval(24h):
 * an interval drifts (and fires at the wrong hour after a DST change), whereas
 * re-computing the delay each night always lands on the configured hour.
 */
let timer = null;

export function startOrderReminderJob() {
  if (process.env.ORDER_REMINDER_ENABLED === 'false') {
    logger.info('Order reminder job disabled via ORDER_REMINDER_ENABLED=false');
    return;
  }

  const hour = Number(process.env.ORDER_REMINDER_HOUR ?? 18);
  const minute = Number(process.env.ORDER_REMINDER_MINUTE ?? 0);

  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    logger.error(`Invalid ORDER_REMINDER_HOUR "${process.env.ORDER_REMINDER_HOUR}" — job not started`);
    return;
  }

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    const delay = next.getTime() - now.getTime();

    timer = setTimeout(async () => {
      try {
        await runOrderReminderSweep();
      } catch (err) {
        logger.error('Order reminder sweep failed:', err.message);
      }
      scheduleNext();
    }, delay);

    // Do not hold the event loop open on shutdown.
    timer.unref?.();

    logger.info(`Next order reminder sweep scheduled for ${next.toISOString()}`);
  };

  scheduleNext();
}

export function stopOrderReminderJob() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}


