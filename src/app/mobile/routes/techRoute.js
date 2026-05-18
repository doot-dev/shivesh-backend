import { Router } from 'express';
import * as techController from '../controllers/techController.js';
import * as orderController from '../controllers/orderController.js';
import * as tmController from '../controllers/tmController.js';
import { verifyTechToken } from '../middleware/mobileAuth.js';

const router = Router();

// Profile & notifications
router.get('/profile', verifyTechToken, techController.getProfile);
router.get('/notifications', verifyTechToken, techController.getNotifications);
router.put('/notifications/:notificationId/read', verifyTechToken, techController.markNotificationRead);

// Orders
router.get('/orders', verifyTechToken, orderController.techListOrders);
router.get('/orders/:orderId', verifyTechToken, orderController.techGetOrder);
router.put('/orders/:orderId/status', verifyTechToken, orderController.techUpdateStatus);
router.get('/orders/:orderId/comments', verifyTechToken, orderController.listComments);
router.post('/orders/:orderId/comments', verifyTechToken, orderController.addComment);

// TM details
router.post('/orders/:orderId/tm', verifyTechToken, tmController.createTm);
router.put('/orders/:orderId/tm/:tmId', verifyTechToken, tmController.updateTm);
router.delete('/orders/:orderId/tm/:tmId', verifyTechToken, tmController.deleteTm);

export default router;
