import db from '../../../config/database.js';
import { generateToken } from '../../../config/jwtConfig.js';
import { sendOtpViaMSG91 } from '../../../helper/msg91Service.js';
import logger from '../../../helper/logger.js';

/**
 * Send OTP to client by phone number (contactNumber).
 * Uses MSG91 when keys are configured; returns OTP in dev mode otherwise.
 */
const DEV_MOCK_PHONE = '9999999999';
const DEV_MOCK_OTP = '123456';

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

export async function sendOtp(req, res) {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const normalizedPhone = normalizePhone(phone);

    // DEV BYPASS — remove before production
    if (normalizedPhone === DEV_MOCK_PHONE) {
      logger.info(`[DEV] Client mock OTP bypass for ${phone}`);
      return res.status(200).json({ success: true, message: 'OTP sent successfully', data: { otp: DEV_MOCK_OTP } });
    }

    const client = await db.client.findFirst({
      where: { contactNumber: { equals: normalizedPhone }, isDeleted: false, status: 'ACTIVE' },
    });
    logger.info(`Client sendOtp requested for ${normalizedPhone} - client ${client ? 'found' : 'not found'}`);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'No active client account found for this number',
      });
    }

    // Deactivate previous OTPs
    await db.oTP.updateMany({
      where: { finder: { equals: normalizedPhone }, active: true },
      data: { active: false },
    });

    const { success, otp, devMode, error } = await sendOtpViaMSG91(phone);

    if (!success) {
      logger.error(`MSG91 sendOtp failed for ${phone}: ${error}`);
      return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }

    // Store in DB for verification
    await db.oTP.create({
      data: { finder: normalizedPhone, otp, mode: 'SMS', active: true },
    });

    logger.info(`Client OTP sent to ${normalizedPhone}${devMode ? ` (dev: ${otp})` : ''}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      // Expose OTP only in dev — remove in production
      ...(devMode && { data: { otp } }),
    });
  } catch (error) {
    logger.error('Client sendOtp error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}

/**
 * Verify client OTP and return JWT token.
 */
export async function verifyOtp(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    const normalizedPhone = normalizePhone(phone);

    // DEV BYPASS — remove before production
    if (normalizedPhone === DEV_MOCK_PHONE && String(otp) === DEV_MOCK_OTP) {
      const mockPayload = { type: 'CLIENT', id: 'dev-client', clientId: 'DEV001', name: 'Dev Client', phone };
      const token = generateToken(mockPayload);
      logger.info(`[DEV] Client mock OTP verified for ${phone}`);
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: { token, name: 'Dev Client', clientId: 'DEV001', email: 'dev@test.com', phone },
      });
    }

    const otpRecord = await db.oTP.findFirst({
      where: { finder: { endsWith: normalizedPhone }, otp: String(otp), active: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const tenMinutes = 10 * 60 * 1000;
    if (Date.now() - new Date(otpRecord.createdAt).getTime() > tenMinutes) {
      await db.oTP.update({ where: { id: otpRecord.id }, data: { active: false } });
      return res.status(401).json({ success: false, message: 'OTP has expired' });
    }

    await db.oTP.update({ where: { id: otpRecord.id }, data: { active: false } });

    const client = await db.client.findFirst({
      where: { contactNumber: { endsWith: normalizedPhone }, isDeleted: false },
    });

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    const payload = {
      type: 'CLIENT',
      id: client.id,
      clientId: client.clientId,
      name: client.companyName,
      phone: client.contactNumber,
    };

    const token = generateToken(payload);

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
