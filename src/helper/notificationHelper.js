import db from '../config/database.js';
import logger from './logger.js';
import { sendPushNotification } from './firebase.js';

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
  await db.notification.create({
    data: { targetType, targetId, title, message, type, relatedId, orderId },
  });

  // 2. Push to registered devices (CLIENT / FIELD_TECH only — ADMIN has web panel)
  if (targetType === 'ADMIN') return;

  try {
    const deviceTokens = await db.deviceToken.findMany({
      where: { targetType, targetId },
      select: { token: true },
    });

    const tokens = deviceTokens.map((d) => d.token);

    if (tokens.length > 0) {
      await sendPushNotification({
        tokens,
        title,
        body: message,
        data: {
          type,
          relatedId: relatedId ?? '',
          orderId: orderId ?? '',
        },
      });
    }
  } catch (err) {
    // Never let FCM errors break the HTTP response
    logger.error('sendNotification FCM error:', err.message);
  }
}
