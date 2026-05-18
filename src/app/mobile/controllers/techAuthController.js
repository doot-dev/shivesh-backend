import db from '../../../config/database.js';
import { generateToken } from '../../../config/jwtConfig.js';
import { sendOtpViaMSG91 } from '../../../helper/msg91Service.js';
import logger from '../../../helper/logger.js';

/**
 * Send OTP to field technician by phone number.
 * Uses MSG91 when keys are configured; returns OTP in dev mode otherwise.
 */
const DEV_MOCK_PHONE = '9999999999';
const DEV_MOCK_OTP   = '123456';

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

    // DEV BYPASS — remove before production
    if (normalizePhone(phone) === DEV_MOCK_PHONE) {
      logger.info(`[DEV] Tech mock OTP bypass for ${phone}`);
      return res.status(200).json({ success: true, message: 'OTP sent successfully', data: { otp: DEV_MOCK_OTP } });
    }

    const user = await db.user.findFirst({
      where: { phone: { in: phoneVariants(phone) }, role: 'FIELD_TECHNICIAN', isDeleted: false, status: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No active technician account found for this number',
      });
    }

    await db.oTP.updateMany({
      where: { finder: phone, active: true },
      data: { active: false },
    });

    const { success, otp, devMode, error } = await sendOtpViaMSG91(phone);

    if (!success) {
      logger.error(`MSG91 sendOtp failed for tech ${phone}: ${error}`);
      return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }

    await db.oTP.create({
      data: { finder: phone, otp, mode: 'SMS', active: true },
    });

    logger.info(`Tech OTP sent to ${phone}${devMode ? ` (dev: ${otp})` : ''}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      ...(devMode && { data: { otp } }),
    });
  } catch (error) {
    logger.error('Tech sendOtp error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}

/**
 * Verify field tech OTP and return JWT token.
 */
export async function verifyOtp(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    // DEV BYPASS — remove before production
    if (normalizePhone(phone) === DEV_MOCK_PHONE && String(otp) === DEV_MOCK_OTP) {
      const mockPayload = { type: 'FIELD_TECH', id: 'dev-tech', name: 'Dev Technician', employeeId: 'EMP000', phone };
      const token = generateToken(mockPayload);
      logger.info(`[DEV] Tech mock OTP verified for ${phone}`);
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: { token, name: 'Dev Technician', employeeId: 'EMP000', phone, userId: 'dev-tech' },
      });
    }

    const otpRecord = await db.oTP.findFirst({
      where: { finder: { in: phoneVariants(phone) }, otp: String(otp), active: true },
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

    const user = await db.user.findFirst({
      where: { phone: { in: phoneVariants(phone) }, role: 'FIELD_TECHNICIAN', isDeleted: false },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const payload = {
      type: 'FIELD_TECH',
      id: user.id,
      name: user.name,
      employeeId: user.employeeId,
      phone: user.phone,
    };

    const token = generateToken(payload);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        name: user.name,
        employeeId: user.employeeId,
        phone: user.phone,
        userId: user.id,
      },
    });
  } catch (error) {
    logger.error('Tech verifyOtp error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}
