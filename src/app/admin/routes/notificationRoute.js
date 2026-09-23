import { Router } from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const router = Router();

// The bell is shared across the back office, so the notifications module is a
// single view permission rather than per-module filtering.
router.get('/', verifyToken, requirePermission(can('notifications', 'view')), notificationController.listNotifications);
router.put('/read-all', verifyToken, requirePermission(can('notifications', 'view')), notificationController.markAllRead);
router.put('/:id/read', verifyToken, requirePermission(can('notifications', 'view')), notificationController.markRead);

export default router;
