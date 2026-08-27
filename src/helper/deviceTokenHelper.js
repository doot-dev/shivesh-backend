import db from '../config/database.js';
import logger from './logger.js';

/**
 * Maximum number of devices a single user (client or field tech) may keep
 * registered for push at once. Registering on a 6th device silently evicts the
 * least-recently-registered one rather than rejecting the login.
 */
export const MAX_DEVICES_PER_USER = 5;

/**
 * Register (or re-register) an FCM token for a user and enforce the per-user
 * device cap.
 *
 * The token itself is globally unique: if the same physical device previously
 * belonged to another account (shared tablet, staff handover), the upsert
 * REASSIGNS it instead of creating a duplicate row — otherwise the previous
 * owner would keep receiving this device's notifications.
 *
 * @param {{ token: string, platform?: string, targetType: 'CLIENT'|'FIELD_TECH', targetId: string }} opts
 * @returns {Promise<{ deviceCount: number, evicted: number }>}
 */
export async function registerDeviceToken({ token, platform = 'android', targetType, targetId }) {
  const ownerId = String(targetId);

  await db.deviceToken.upsert({
    where: { token },
    update: { targetType, targetId: ownerId, platform },
    create: { token, platform, targetType, targetId: ownerId },
  });

  // Enforce the cap: keep the newest MAX_DEVICES_PER_USER, drop the rest.
  // Ordered by updatedAt so a device that is actively re-registering counts as
  // "recent" even if it first logged in months ago.
  const tokens = await db.deviceToken.findMany({
    where: { targetType, targetId: ownerId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  let evicted = 0;
  if (tokens.length > MAX_DEVICES_PER_USER) {
    const stale = tokens.slice(MAX_DEVICES_PER_USER).map((t) => t.id);
    await db.deviceToken.deleteMany({ where: { id: { in: stale } } });
    evicted = stale.length;
    logger.info(
      `Device cap: evicted ${evicted} oldest device(s) for ${targetType}:${ownerId}`,
    );
  }

  return { deviceCount: Math.min(tokens.length, MAX_DEVICES_PER_USER), evicted };
}

/**
 * Remove a single device token — call on logout so a signed-out phone stops
 * receiving pushes and stops occupying one of the user's 5 device slots.
 */
export async function removeDeviceToken(token) {
  if (!token) return;
  await db.deviceToken.deleteMany({ where: { token } });
}
