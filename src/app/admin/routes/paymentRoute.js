import { Router } from 'express';
import * as pc from '../controllers/paymentController.js';
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

// W21 payments. `payments.delete` = reverse (kept separate so only senior users undo money).
const router = Router();
router.post('/preview', verifyToken, requirePermission(can('payments', 'create')), pc.previewPayment);
router.post('/', verifyToken, requirePermission(can('payments', 'create')), pc.createPayment);
router.get('/', verifyToken, requirePermission(can('payments', 'view')), pc.listPayments);
router.get('/:receiptNo', verifyToken, requirePermission(can('payments', 'view')), pc.getPayment);
router.post('/:receiptNo/adjust', verifyToken, requirePermission(can('payments', 'create')), pc.adjustPayment);
router.post('/:receiptNo/reverse', verifyToken, requirePermission(can('payments', 'delete')), pc.reversePaymentHandler);
export default router;
