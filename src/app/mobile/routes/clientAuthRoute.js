import { Router } from 'express';
import * as clientAuthController from '../controllers/clientAuthController.js';

const router = Router();

router.post('/send-otp', clientAuthController.sendOtp);
router.post('/verify-otp', clientAuthController.verifyOtp);

export default router;
