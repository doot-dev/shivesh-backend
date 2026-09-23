import db from '../config/database.js';
import logger from './logger.js';
import { sendPushNotification } from './firebase.js';
import { emitToAdmins } from '../realtime/socketServer.js';

/**
 * Every ADMIN notification is addressed to this single id rather than to an
 * individual user row. The panel is a shared back-office view — an order does
 * not belong to one admin — so all admins read the same feed and marking one
 * read marks it read for the team. Changing this to per-user would need a
 * fan-out write per admin plus a migration of existing rows.
 */
export const ADMIN_TARGET_ID = 'admin';

/**
 * Create a DB notification AND send an FCM push to all registered devices
 * for the target user.
 *
 * @param {{
 *   targetType: 'CLIENT' | 'FIELD_TECH' | 'ADMIN',
 *   targetId: string,
 *   title: string,
 *   message: string,
 *   type: string,
 *   relatedId?: string,
 *   orderId?: string,
 * }} opts
 */
export async function sendNotification({ targetType, targetId, title, message, type, relatedId, orderId }) {
  // 1. Persist to DB (existing behaviour)
  const notification = await db.notification.create({
    data: { targetType, targetId, title, message, type, relatedId, orderId },
  });

  // 2a. Admins have no device tokens — they get the row over the WebSocket so
  // the panel's bell updates live instead of only on refresh.
  if (targetType === 'ADMIN') {
    try {
      let orderCode = '';
      if (orderId) {
        const order = await db.order.findFirst({
          where: { id: orderId },
          select: { orderId: true },
        });
        orderCode = order?.orderId ?? '';
      }
      emitToAdmins('notification', { ...notification, orderCode });
    } catch (err) {
      // A realtime failure must never break the request that triggered it —
      // the row is already saved and will show on the next poll/refresh.
      logger.error('sendNotification admin emit error:', err.message);
    }
    return;
  }

  // 2b. Push to registered devices (CLIENT / FIELD_TECH)

  try {
    const deviceTokens = await db.deviceToken.findMany({
      where: { targetType, targetId: String(targetId) },
      select: { token: true },
    });

    const tokens = deviceTokens.map((d) => d.token);

    if (tokens.length === 0) return;

    // Both apps deep-link with the human order CODE (ORD-2025-0001), but
    // `orderId` here is the cuid primary key. Sending only the cuid made every
    // notification tap open a 404, so resolve the code and ship both.
    let orderCode = '';
    if (orderId) {
      const order = await db.order.findFirst({
        where: { id: orderId },
        select: { orderId: true },
      });
      orderCode = order?.orderId ?? '';
    }

    await sendPushNotification({
      tokens,
      title,
      body: message,
      data: {
        type,
        relatedId: relatedId ?? '',
        orderId: orderId ?? '',
        orderCode,
      },
    });
  } catch (err) {
    // Never let FCM errors break the HTTP response
    logger.error('sendNotification FCM error:', err.message);
  }
}

/**
 * Raise a notification for the admin panel's bell.
 *
 * Thin wrapper over sendNotification so the dozen call sites across the order,
 * comment and cube-test controllers don't each have to remember the ADMIN
 * targetType/targetId pair. Never throws: an admin notification is an FYI and
 * must not be able to fail the request that produced it.
 *
 * @param {{ title: string, message: string, type: string, relatedId?: string, orderId?: string }} opts
 */
export async function notifyAdmins({ title, message, type, relatedId, orderId }) {
  try {
    await sendNotification({
      targetType: 'ADMIN',
      targetId: ADMIN_TARGET_ID,
      title,
      message,
      type,
      relatedId,
      orderId,
    });
  } catch (err) {
    logger.error('notifyAdmins error:', err.message);
  }
}
