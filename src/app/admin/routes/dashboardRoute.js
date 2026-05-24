import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { verifyToken } from '../../../config/jwtConfig.js';

const router = Router();

router.get('/stats', verifyToken, dashboardController.getStats);

export default router;
