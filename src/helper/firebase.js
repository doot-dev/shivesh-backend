import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import logger from './logger.js';
import db from '../config/database.js';

let messaging = null;

/**
 * Call once at app startup (src/app.js).
 */
export function initFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('Firebase Admin: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY not set — push notifications disabled');
    return;
  }

  try {
    if (getApps().length === 0) {
      const serviceAccount = {
        type: process.env.FIREBASE_TYPE || 'service_account',
        project_id: projectId,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: clientEmail,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI,
        token_uri: process.env.FIREBASE_TOKEN_URI,
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
      };
      initializeApp({ credential: cert(serviceAccount) });
    }
    messaging = getMessaging();
    logger.info('Firebase Admin SDK initialised');
  } catch (err) {
    logger.error('Firebase Admin init failed:', err);
  }
}

/**
 * Send a multicast push notification.
 * Automatically removes stale / invalid tokens from the DeviceToken table.
 *
 * @param {{ tokens: string[], title: string, body: string, data?: Record<string,string> }} opts
 */
export async function sendPushNotification({ tokens, title, body, data = {} }) {
  if (!messaging) return;

  const validTokens = (tokens || []).filter(Boolean);
  if (validTokens.length === 0) return;

  // FCM data values must all be strings
  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v == null ? '' : String(v)]),
  );

  try {
    const response = await messaging.sendEachForMulticast({
      tokens: validTokens,
      notification: { title, body },
      data: stringData,
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });

    // Clean up stale tokens
    const staleTokens = [];
    response.responses.forEach((resp, i) => {
      if (!resp.success) {
        const code = resp.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleTokens.push(validTokens[i]);
        }
      }
    });

    if (staleTokens.length > 0) {
      await db.deviceToken.deleteMany({ where: { token: { in: staleTokens } } });
      logger.info(`FCM: removed ${staleTokens.length} stale token(s)`);
    }

    logger.info(`FCM: sent to ${validTokens.length} device(s), ${response.failureCount} failed`);
    return response;
  } catch (err) {
    logger.error('FCM sendPushNotification error:', err.message);
  }
}
