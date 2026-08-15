import db from '../../../config/database.js';
import { generateToken } from '../../../config/jwtConfig.js';
import logger from '../../../helper/logger.js';

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

// Normalize to 10-digit Indian mobile number regardless of how it's stored
function normalizePhone(raw) {
  const s = String(raw).replace(/\s+/g, '').replace(/^\+/, '');
  if (s.startsWith('91') && s.length === 12) return s.slice(2);
  return s;
}

function phoneVariants(phone) {
  const n = normalizePhone(phone);
  return [n, `+91${n}`, `91${n}`];
}

/**
 * Resolve an active client from EITHER a mobile number (in any stored format —
 * bare 10-digit, +91…, 91…) OR a clientId code such as CL-2025-0004.
 *
 * Every auth entry point goes through this, because client.contactNumber is not
 * stored consistently; a strict equality match here silently 404s real clients.
 */
function findActiveClient(input) {
  const normalized = normalizePhone(input);
  return db.client.findFirst({
    where: {
      isDeleted: false,
      status: 'ACTIVE',
      OR: [
        ...phoneVariants(input).map((v) => ({ contactNumber: v })),
        { contactNumber: { endsWith: normalized } },
        { clientId: input },
      ],
    },
  });
}

/**
 * Number-only client login — NOT routed by default; the live flow is
 * sendOtp -> verifyOtp with a fixed OTP.
 *
 * Accepts EITHER the registered mobile number (10-digit, +91/91 tolerated) OR
 * the clientId code (e.g. CL-2025-0004) in the same `number` field, and returns
 * the same JWT that verifyOtp issues, so every downstream route is unchanged.
 *
 * SECURITY: there is deliberately no second factor here — possession of the
 * number IS the credential. Because that bypasses the OTP step entirely, the
 * route is only registered when ALLOW_NUMBER_ONLY_LOGIN=true (see
 * clientAuthRoute.js); leaving it always-on would make the OTP screen
 * decorative.
 */
export async function loginWithNumber(req, res) {
  try {
    const raw = req.body?.number ?? req.body?.phone ?? req.body?.clientId;

    if (!raw || !String(raw).trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Client number is required' });
    }

    const input = String(raw).trim();
    const normalizedPhone = normalizePhone(input);

    // DEV BYPASS — remove before production
    if (normalizedPhone === DEV_MOCK_PHONE) {
      const mockPayload = {
        type: 'CLIENT',
        id: 'dev-client',
        clientId: 'DEV001',
        name: 'Dev Client',
        phone: normalizedPhone,
      };
      logger.info(`[DEV] Client number login bypass for ${input}`);
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          token: generateToken(mockPayload),
          name: 'Dev Client',
          clientId: 'DEV001',
          email: 'dev@test.com',
          phone: normalizedPhone,
        },
      });
    }

    const client = await findActiveClient(input);

    if (!client) {
      logger.info(`Client number login failed — no active client for ${input}`);
      return res.status(404).json({
        success: false,
        message: 'No active client account found for this number',
      });
    }

    const token = generateToken({
      type: 'CLIENT',
      id: client.id,
      clientId: client.clientId,
      name: client.companyName,
      phone: client.contactNumber,
    });

    logger.info(`Client ${client.clientId} logged in by number`);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        name: client.companyName,
        clientId: client.clientId,
        email: client.email,
        phone: client.contactNumber,
      },
    });
  } catch (error) {
    logger.error('Client loginWithNumber error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}

/**
 * Step 1 of client login: confirm the number belongs to an active client.
 *
 * No SMS is sent and no OTP row is written — the OTP is the fixed
 * FIXED_CLIENT_OTP and is checked by verifyOtp. This endpoint exists purely so
 * the app can validate the number before showing the OTP screen, and it
 * deliberately does NOT return the OTP in the response.
 */
export async function sendOtp(req, res) {
  try {
    const raw = req.body?.phone ?? req.body?.number;
    if (!raw || !String(raw).trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const input = String(raw).trim();
    const normalizedPhone = normalizePhone(input);

    // DEV BYPASS — remove before production
    if (normalizedPhone === DEV_MOCK_PHONE) {
      logger.info(`[DEV] Client OTP step bypass for ${input}`);
      return res.status(200).json({ success: true, message: 'OTP sent successfully' });
    }

    const client = await findActiveClient(input);
    if (!client) {
      logger.info(`Client sendOtp failed — no active client for ${input}`);
      return res.status(404).json({
        success: false,
        message: 'No active client account found for this number',
      });
    }

    logger.info(`Client ${client.clientId} passed OTP step 1 (fixed OTP)`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error) {
    logger.error('Client sendOtp error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}

/**
 * Step 2 of client login: check the OTP and issue the JWT.
 *
 * The OTP is compared against FIXED_CLIENT_OTP here on the server — the app
 * never decides whether an OTP is valid, so changing the constant changes the
 * behaviour of every client without shipping a new build.
 */
export async function verifyOtp(req, res) {
  try {
    const raw = req.body?.phone ?? req.body?.number;
    const { otp } = req.body;
    if (!raw || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    const input = String(raw).trim();
    const normalizedPhone = normalizePhone(input);

    if (String(otp).trim() !== FIXED_CLIENT_OTP) {
      logger.info(`Client OTP verification failed for ${input} — wrong OTP`);
      return res.status(401).json({ success: false, message: 'Invalid OTP' });
    }

    // DEV BYPASS — remove before production
    if (normalizedPhone === DEV_MOCK_PHONE) {
      const mockPayload = {
        type: 'CLIENT',
        id: 'dev-client',
        clientId: 'DEV001',
        name: 'Dev Client',
        phone: normalizedPhone,
      };
      logger.info(`[DEV] Client mock OTP verified for ${input}`);
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          token: generateToken(mockPayload),
          name: 'Dev Client',
          clientId: 'DEV001',
          email: 'dev@test.com',
          phone: normalizedPhone,
        },
      });
    }

    const client = await findActiveClient(input);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'No active client account found for this number',
      });
    }

    const payload = {
      type: 'CLIENT',
      id: client.id,
      clientId: client.clientId,
      name: client.companyName,
      phone: client.contactNumber,
    };

    const token = generateToken(payload);

    logger.info(`Client ${client.clientId} logged in via OTP`);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        name: client.companyName,
        clientId: client.clientId,
        email: client.email,
        phone: client.contactNumber,
      },
    });
  } catch (error) {
    logger.error('Client verifyOtp error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}
