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

// Phase 1B — Excel CA Pack (reports.export), analytics and credit (reports.view).
router.get('/export/:register', verifyToken, requirePermission(can('reports', 'export')), reportController.exportRegister);
router.get('/ca-pack', verifyToken, requirePermission(can('reports', 'export')), reportController.exportCaPack);
router.get('/analytics', verifyToken, requirePermission(can('reports', 'view')), reportController.portfolioAnalytics);
router.get('/clients/:clientId/analytics', verifyToken, requirePermission(can('reports', 'view')), reportController.clientAnalytics);
// Credit is needed while booking an order, so orders.create may read it too.
router.get('/clients/:clientId/credit', verifyToken, requirePermission(can('reports', 'view'), can('orders', 'create')), reportController.clientCredit);

export default router;
