import { Router } from 'express';
import * as techAuthController from '../controllers/techAuthController.js';
import { verifyTechToken } from '../middleware/mobileAuth.js';

const router = Router();

// Primary login: username + password, returns a 30-day JWT.
router.post('/login', techAuthController.loginWithPassword);

// Session check on cold start — validates the stored token without a data fetch.
router.get('/session', verifyTechToken, techAuthController.session);
router.post('/change-password', verifyTechToken, techAuthController.changePassword);

// Legacy OTP login. Kept mounted so existing installs keep working while
// technicians are migrated onto credentials; safe to remove once every FT has
// a username and password set.
router.post('/send-otp', techAuthController.sendOtp);
router.post('/verify-otp', techAuthController.verifyOtp);

export default router;
