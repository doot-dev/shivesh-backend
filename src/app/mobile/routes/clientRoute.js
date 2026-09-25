import { Router } from 'express';
import * as clientController from '../controllers/clientController.js';
import * as orderController from '../controllers/orderController.js';
import * as cubeTestController from '../controllers/cubeTestController.js';
import * as tmController from '../controllers/tmController.js';
import { verifyClientToken } from '../middleware/mobileAuth.js';

const router = Router();

// Profile & projects
router.get('/profile', verifyClientToken, clientController.getProfile);
router.put('/fcm-token', verifyClientToken, clientController.registerFcmToken);
router.delete('/fcm-token', verifyClientToken, clientController.unregisterFcmToken);
router.get('/projects', verifyClientToken, clientController.getProjects);
router.get('/projects/:projectId', verifyClientToken, clientController.getProjectDetail);
router.get('/projects/:projectId/products', verifyClientToken, clientController.getProjectProducts);
router.get('/projects/:projectId/orders', verifyClientToken, orderController.clientListProjectOrders);

// Products
router.get('/products', verifyClientToken, clientController.getProductNames);
router.get('/products/:productName/grades', verifyClientToken, clientController.getProductGrades);

// Cube testing reports across all of this client's orders.
//
// Read-only on purpose: clients view results, technicians and admins log them.
router.get('/cube-tests', verifyClientToken, cubeTestController.clientListAllCubeTests);

// Money (P1.14, P1.16)
router.get('/credit', verifyClientToken, clientController.getCredit);
router.get('/bills', verifyClientToken, clientController.listBills);
router.get('/payments', verifyClientToken, clientController.listPayments);
router.get('/ledger', verifyClientToken, clientController.getLedger);
router.get('/bills/:billNo/invoice', verifyClientToken, clientController.downloadBillInvoice);

// Notifications
router.get('/notifications', verifyClientToken, clientController.getNotifications);
router.put('/notifications/:notificationId/read', verifyClientToken, clientController.markNotificationRead);

// Orders
router.get('/orders', verifyClientToken, orderController.clientListOrders);
router.post('/orders', verifyClientToken, orderController.clientCreateOrder);
router.get('/orders/:orderId', verifyClientToken, orderController.clientGetOrder);
router.get('/orders/:orderId/comments', verifyClientToken, orderController.listComments);
router.post('/orders/:orderId/comments', verifyClientToken, orderController.addComment);
router.post('/orders/:orderId/cancel', verifyClientToken, orderController.clientCancelOrder);
router.post('/orders/:orderId/tm/:tmId/reject', verifyClientToken, tmController.clientRejectTm);

export default router;
