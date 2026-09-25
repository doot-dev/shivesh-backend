import logger from './logger.js';
import { hasPermission } from './accessControl.js';
import { createActivityLog } from './activityLogger.js';

/**
 * 30-day order update window (W37, D22/D23).
 *
 * Order details, status, trucks, challans and truck reviews can change for
 * ORDER_UPDATE_WINDOW_DAYS after the delivery date (Order.date, else the day it
 * was placed). After that the order is locked. Cube tests, payments, bills and
 * comments are NOT covered — they have their own rules.
 *
 * A panel user with `orders.approve` can still make one change by sending
 * `overrideReason` in the body; it is logged.
 */
export const windowDays = () => Number(process.env.ORDER_UPDATE_WINDOW_DAYS || 30);

/** Last moment the order may be edited (end of day, server time = IST). */
export function orderEditableUntil(order, days = windowDays()) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(order.date || '')
    ? new Date(`${order.date}T00:00:00`)
    : new Date(order.createdAt);
  const until = new Date(start);
  until.setDate(until.getDate() + days);
  until.setHours(23, 59, 59, 999);
  return until;
}

export function isOrderLocked(order, now = new Date()) {
  return now > orderEditableUntil(order);
}

/**
 * Sends a 409 and returns true when the order is locked and not overridden.
 * Usage:  if (await rejectIfLocked(order, req, res)) return;
 */
export async function rejectIfLocked(order, req, res) {
  if (!isOrderLocked(order)) return false;

  const until = orderEditableUntil(order).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const reason = typeof req.body?.overrideReason === 'string' ? req.body.overrideReason.trim() : '';
  if (reason && req.access && hasPermission(req.access, 'orders.approve')) {
    await createActivityLog({
      title: 'Order lock overridden',
      description: `${order.orderId} (locked since ${until}) changed via ${req.method} ${req.originalUrl} — ${reason}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'UPDATED',
      createdById: Number(req.user?.data?.id) || null,
    });
    logger.warn(`Order lock overridden on ${order.orderId}: ${reason}`);
    return false;
  }

  res.status(409).json({
    success: false,
    code: 'ORDER_LOCKED',
    message: `Order ${order.orderId} is locked since ${until} (${windowDays()}-day update window)`,
  });
  return true;
}
