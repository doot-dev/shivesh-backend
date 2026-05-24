import { Router } from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { verifyToken } from '../../../config/jwtConfig.js';

const router = Router();

router.get('/', verifyToken, notificationController.listNotifications);
router.put('/read-all', verifyToken, notificationController.markAllRead);
router.put('/:id/read', verifyToken, notificationController.markRead);

export default router;
