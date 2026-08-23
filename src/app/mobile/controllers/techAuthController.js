import db from '../../../config/database.js';
import { generateToken } from '../../../config/jwtConfig.js';
import { sendOtpViaMSG91 } from '../../../helper/msg91Service.js';
import { verifyPassword, hashPassword } from '../../../helper/passwordHelper.js';
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

// ─── Username + password login ────────────────────────────────────────────────

/**
 * Field-technician login with username and password — the primary FT login.
 *
 * The credentials are the SAME `User.userName` / `User.password` the admin panel
 * already creates, so no separate technician account exists and nothing has to
 * be provisioned twice. `role: FIELD_TECHNICIAN` is enforced here so an admin or
 * sales user cannot sign in through the field app with their panel credentials.
 *
 * Issues the standard 30-day JWT (see config/jwtConfig.js `generateToken`), which
 * is what keeps a technician signed in for 30 days without re-entering anything.
 */
export async function loginWithPassword(req, res) {
  try {
    const userName = req.body?.userName ?? req.body?.username;
    const { password } = req.body;

    if (!userName || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const user = await db.user.findFirst({
      where: {
        userName: String(userName).trim(),
        role: 'FIELD_TECHNICIAN',
        isDeleted: false,
      },
    });

    // Same generic message for "no such user" and "wrong password" so the
    // endpoint cannot be used to enumerate valid technician usernames.
    const invalid = () =>
      res.status(401).json({ success: false, message: 'Invalid username or password' });

    if (!user) {
      logger.info(`Tech password login failed — no technician for ${userName}`);
      return invalid();
    }

    if (!user.status) {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact the administrator.',
      });
    }

    if (!verifyPassword(password, user.password)) {
      logger.info(`Tech password login failed — bad password for ${userName}`);
      return invalid();
    }

    const token = generateToken({
      type: 'FIELD_TECH',
      id: user.id,
      name: user.name,
      userName: user.userName,
      employeeId: user.employeeId,
      phone: user.phone,
    });

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info(`Technician ${user.employeeId} logged in with password`);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        name: user.name,
        userName: user.userName,
        employeeId: user.employeeId,
        phone: user.phone,
        userId: user.id,
        // Surfaced so the app can show "stay signed in for 30 days" honestly
        // instead of hardcoding a duration the server might change.
        expiresInDays: 30,
      },
    });
  } catch (error) {
    logger.error('Tech loginWithPassword error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}

/**
 * Confirm the caller's saved token is still valid and return fresh profile data.
 *
 * The app calls this on cold start: with a 30-day token the stored session is
 * usually still good, and this is how the splash screen decides between "go
 * straight to home" and "the token was revoked, show login" WITHOUT making the
 * user wait on a full order fetch that might fail for unrelated reasons.
 */
export async function session(req, res) {
  try {
    const userId = req.user.data.id;

    // DEV BYPASS — remove before production
    if (userId === 'dev-tech') {
      return res.status(200).json({
        success: true,
        data: { ...req.user.data, expiresInDays: 30 },
      });
    }

    const user = await db.user.findFirst({
      where: { id: userId, role: 'FIELD_TECHNICIAN', isDeleted: false },
      select: {
        id: true,
        name: true,
        userName: true,
        employeeId: true,
        phone: true,
        status: true,
      },
    });

    if (!user || !user.status) {
      return res.status(401).json({ success: false, message: 'Session is no longer valid' });
    }

    return res.status(200).json({ success: true, data: { ...user, userId: user.id } });
  } catch (error) {
    logger.error('Tech session error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}

/**
 * Change the signed-in technician's own password.
 *
 * Writes a bcrypt hash via hashPassword, so a legacy AES-encrypted row silently
 * upgrades to the modern format the first time the tech changes their password.
 */
export async function changePassword(req, res) {
  try {
    const userId = req.user.data.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Old password and new password are required',
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(422).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
    }

    const user = await db.user.findFirst({
      where: { id: userId, role: 'FIELD_TECHNICIAN', isDeleted: false },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!verifyPassword(oldPassword, user.password)) {
      return res.status(401).json({ success: false, message: 'Old password is incorrect' });
    }

    await db.user.update({
      where: { id: user.id },
      data: { password: hashPassword(newPassword) },
    });

    logger.info(`Technician ${user.employeeId} changed their password`);

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Tech changePassword error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
}
