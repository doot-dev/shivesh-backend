import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const router = Router();

router.get('/stats', verifyToken, requirePermission(can('dashboard', 'view')), dashboardController.getStats);

export default router;
