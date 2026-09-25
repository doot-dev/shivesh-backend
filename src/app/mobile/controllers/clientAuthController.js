import db from '../../../config/database.js';
import { generateToken } from '../../../config/jwtConfig.js';
import logger from '../../../helper/logger.js';
import { createActivityLog } from '../../../helper/activityLogger.js';
import { normalizePhone, activeContactWhere, requireKyc } from '../../../helper/clientAccess.js';

export { requireKyc };

const DEV_MOCK_PHONE = '9999999999';

/**
 * Fixed OTP for every client login.
 *
 * There is no SMS provider in this flow: sendOtp does NOT generate or transmit
 * anything, and verifyOtp compares against this constant server-side. The value
 * is never returned to the app — the client is expected to already know it.
 * Replace this with a real generated+stored OTP before going to production.
 */
const FIXED_CLIENT_OTP = '1111';

const DEV_LOGIN = {
  token: () => generateToken({ type: 'CLIENT', id: 'dev-client', clientId: 'DEV001', name: 'Dev Client', phone: DEV_MOCK_PHONE }),
  data: { name: 'Dev Client', clientId: 'DEV001', email: 'dev@test.com', phone: DEV_MOCK_PHONE },
};

/**
 * The person logging in (docs/06): an active contact, on an active role, of an
 * active (and, per D16, KYC-verified) client. Accepts a mobile number in any
 * format, or a client code such as CL-2025-0004, which maps to the Owner.
 *
 * Q6: one phone belongs to one company, so the first match is the only match.
 */
function findActiveContact(input) {
  const base = activeContactWhere();
  const where = /^CL-/i.test(input)
    ? { ...base, client: { ...base.client, clientId: input.toUpperCase() }, role: { ...base.role, isSystem: true } }
    : { ...base, phone: normalizePhone(input) };
  return db.clientContact.findFirst({ where, include: { client: true, role: true }, orderBy: { createdAt: 'asc' } });
}

/** Issue the JWT for a contact. `name` stays the company for older app builds. */
async function issueLogin(contact, via) {
  const { client, role } = contact;
  const token = generateToken({
    type: 'CLIENT',
    id: client.id,
    clientId: client.clientId,
    name: client.companyName,
    phone: contact.phone,
    contactId: contact.id,
  });

  await db.clientContact.update({ where: { id: contact.id }, data: { lastLoginAt: new Date() } });
  await createActivityLog({
    title: 'Client app login',
    description: `${contact.name} (${role.name}) signed in to ${client.companyName} via ${via}`,
    entityType: 'CLIENT',
    entityId: client.id,
    action: 'LOGGED',
    event: 'CLIENT_LOGIN',
    actorType: 'CLIENT_CONTACT',
    actorId: contact.id,
    source: 'CLIENT_APP',
    clientRef: client.clientId,
  });
  logger.info(`Client ${client.clientId} contact ${contact.id} logged in via ${via}`);

  return {
    token,
    name: client.companyName,
    clientId: client.clientId,
    email: client.email,
    phone: contact.phone,
    contactName: contact.name,
    role: role.name,
  };
}

const notFound = (res) =>
  res.status(404).json({ success: false, message: 'No active client account found for this number' });

/**
 * Number-only client login — NOT routed by default; the live flow is
 * sendOtp -> verifyOtp with a fixed OTP.
 *
 * SECURITY: there is deliberately no second factor here — possession of the
 * number IS the credential. Because that bypasses the OTP step entirely, the
 * route is only registered when ALLOW_NUMBER_ONLY_LOGIN=true (see
 * clientAuthRoute.js).
 */
export async function loginWithNumber(req, res) {
  try {
    const raw = req.body?.number ?? req.body?.phone ?? req.body?.clientId;
    if (!raw || !String(raw).trim()) {
      return res.status(400).json({ success: false, message: 'Client number is required' });
    }
    const input = String(raw).trim();

    // DEV BYPASS — remove before production
    if (normalizePhone(input) === DEV_MOCK_PHONE) {
      return res.status(200).json({ success: true, message: 'Login successful', data: { token: DEV_LOGIN.token(), ...DEV_LOGIN.data } });
    }

    const contact = await findActiveContact(input);
    if (!contact) return notFound(res);

    return res.status(200).json({ success: true, message: 'Login successful', data: await issueLogin(contact, 'number') });
  } catch (error) {
    logger.error('Client loginWithNumber error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}

/**
 * Step 1 of client login: confirm the number belongs to an active contact.
 *
 * No SMS is sent and no OTP row is written — the OTP is the fixed
 * FIXED_CLIENT_OTP and is checked by verifyOtp.
 */
export async function sendOtp(req, res) {
  try {
    const raw = req.body?.phone ?? req.body?.number;
    if (!raw || !String(raw).trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    const input = String(raw).trim();

    // DEV BYPASS — remove before production
    if (normalizePhone(input) === DEV_MOCK_PHONE) {
      return res.status(200).json({ success: true, message: 'OTP sent successfully' });
    }

    const contact = await findActiveContact(input);
    if (!contact) {
      logger.info(`Client sendOtp failed — no active contact for ${input}`);
      return notFound(res);
    }

    return res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    logger.error('Client sendOtp error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}

/**
 * Step 2 of client login: check the OTP and issue the JWT.
 *
 * The OTP is compared against FIXED_CLIENT_OTP here on the server — the app
 * never decides whether an OTP is valid.
 */
export async function verifyOtp(req, res) {
  try {
    const raw = req.body?.phone ?? req.body?.number;
    const { otp } = req.body;
    if (!raw || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }
    const input = String(raw).trim();

    if (String(otp).trim() !== FIXED_CLIENT_OTP) {
      logger.info(`Client OTP verification failed for ${input} — wrong OTP`);
      return res.status(401).json({ success: false, message: 'Invalid OTP' });
    }

    // DEV BYPASS — remove before production
    if (normalizePhone(input) === DEV_MOCK_PHONE) {
      return res.status(200).json({ success: true, message: 'Login successful', data: { token: DEV_LOGIN.token(), ...DEV_LOGIN.data } });
    }

    const contact = await findActiveContact(input);
    if (!contact) return notFound(res);

    return res.status(200).json({ success: true, message: 'Login successful', data: await issueLogin(contact, 'OTP') });
  } catch (error) {
    logger.error('Client verifyOtp error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}
