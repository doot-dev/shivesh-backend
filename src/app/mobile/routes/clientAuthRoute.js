import { Router } from 'express';
import * as clientAuthController from '../controllers/clientAuthController.js';
import logger from '../../../helper/logger.js';

const router = Router();

// Primary flow: 2-step OTP. The OTP is a fixed value verified server-side in
// verifyOtp — sendOtp only checks that the number belongs to an active client.
router.post('/send-otp', clientAuthController.sendOtp);
router.post('/verify-otp', clientAuthController.verifyOtp);

// Single-step number-only login, kept working but OFF by default: it skips the
// OTP step entirely, so it must be opted into explicitly rather than left
// mounted next to the OTP routes where either side could quietly use it.
if (process.env.ALLOW_NUMBER_ONLY_LOGIN === 'true') {
  logger.warn(
    'ALLOW_NUMBER_ONLY_LOGIN=true — /client/auth/login is mounted and bypasses OTP',
  );
  router.post('/login', clientAuthController.loginWithNumber);
}

export default router;
