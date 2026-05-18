/**
 * MSG91 OTP Service
 * Set in .env:
 *   MSG91_AUTH_KEY   — your MSG91 authkey
 *   MSG91_TEMPLATE_ID — OTP template ID from MSG91 dashboard
 *
 * When keys are not configured the service returns the OTP in the response
 * (development fallback — remove before going live).
 */

const BASE_URL = 'https://control.msg91.com/api/v5';

/**
 * Send OTP via MSG91.
 * @param {string} phone 10-digit mobile number (without country code)
 * @returns {{ success: boolean, otp?: string, error?: string }}
 */
export async function sendOtpViaMSG91(phone) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  const mobile = `91${phone}`; // Indian country code
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  if (!authKey || !templateId) {
    // Development fallback — skip actual SMS
    return { success: true, otp, devMode: true };
  }

  try {
    const url =
      `${BASE_URL}/otp?template_id=${encodeURIComponent(templateId)}` +
      `&mobile=${encodeURIComponent(mobile)}` +
      `&authkey=${encodeURIComponent(authKey)}` +
      `&otp=${otp}`;

    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();

    if (data.type === 'success') {
      return { success: true, otp };
    }

    return { success: false, error: data.message || 'MSG91 error' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Verify OTP via MSG91 (optional — we also verify against our own OTP table).
 * Only called when MSG91 keys are configured.
 * @param {string} phone 10-digit mobile number
 * @param {string} otp   6-digit OTP entered by user
 * @returns {{ success: boolean }}
 */
export async function verifyOtpViaMSG91(phone, otp) {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) return { success: true }; // skip in dev

  try {
    const mobile = `91${phone}`;
    const url =
      `${BASE_URL}/otp/verify?otp=${otp}` +
      `&mobile=${encodeURIComponent(mobile)}` +
      `&authkey=${encodeURIComponent(authKey)}`;

    const res = await fetch(url);
    const data = await res.json();

    return { success: data.type === 'success' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
