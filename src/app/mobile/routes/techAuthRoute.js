import { Router } from 'express';
import * as techAuthController from '../controllers/techAuthController.js';

const router = Router();

router.post('/send-otp', techAuthController.sendOtp);
router.post('/verify-otp', techAuthController.verifyOtp);

export default router;
