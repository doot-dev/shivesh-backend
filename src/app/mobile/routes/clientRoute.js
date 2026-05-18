import { Router } from 'express';
import * as clientController from '../controllers/clientController.js';
import * as orderController from '../controllers/orderController.js';
import { verifyClientToken } from '../middleware/mobileAuth.js';

const router = Router();

// Profile & projects
router.get('/profile', verifyClientToken, clientController.getProfile);
router.get('/projects', verifyClientToken, clientController.getProjects);

// Notifications
router.get('/notifications', verifyClientToken, clientController.getNotifications);
router.put('/notifications/:notificationId/read', verifyClientToken, clientController.markNotificationRead);

// Orders
router.get('/orders', verifyClientToken, orderController.clientListOrders);
router.post('/orders', verifyClientToken, orderController.clientCreateOrder);
router.get('/orders/:orderId', verifyClientToken, orderController.clientGetOrder);
router.get('/orders/:orderId/comments', verifyClientToken, orderController.listComments);
router.post('/orders/:orderId/comments', verifyClientToken, orderController.addComment);

export default router;
