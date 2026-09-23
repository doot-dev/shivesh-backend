import { Router } from 'express';
import * as reportController from '../controllers/reportController.js';
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const router = Router();

// Client payment behaviour / credit risk — who is not clearing their dues.
// This exposes every client's outstanding money, so it is view-gated tightly.
router.get('/credit-risk', verifyToken, requirePermission(can('reports', 'view')), reportController.getClientCreditRisk);
router.get(
  '/credit-risk/:clientId/bills',
  verifyToken,
  requirePermission(can('reports', 'view')),
  reportController.getClientOutstandingBills,
);

export default router;
