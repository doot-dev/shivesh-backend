import { Router } from 'express';
import * as techController from '../controllers/techController.js';
import * as orderController from '../controllers/orderController.js';
import * as tmController from '../controllers/tmController.js';
import * as cubeTestController from '../controllers/cubeTestController.js';
import { verifyTechToken } from '../middleware/mobileAuth.js';
import { uploadSingleCubeTestFile } from '../../../config/cubeTestUploadConfig.js';

const router = Router();

// Profile & notifications
router.get('/profile', verifyTechToken, techController.getProfile);
router.put('/fcm-token', verifyTechToken, techController.registerFcmToken);
router.delete('/fcm-token', verifyTechToken, techController.unregisterFcmToken);
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

// Cube testing reports.
//
// uploadSingleCubeTestFile runs AFTER verifyTechToken on purpose: multer parses
// the multipart body, and letting an unauthenticated request stream a 10MB file
// to disk before the token is checked is free storage for anyone with the URL.
router.get('/orders/:orderId/cube-test', verifyTechToken, cubeTestController.listCubeTests);
router.post(
  '/orders/:orderId/cube-test',
  verifyTechToken,
  uploadSingleCubeTestFile,
  cubeTestController.createCubeTest,
);
router.put(
  '/orders/:orderId/cube-test/:cubeTestId',
  verifyTechToken,
  uploadSingleCubeTestFile,
  cubeTestController.updateCubeTest,
);
router.delete(
  '/orders/:orderId/cube-test/:cubeTestId',
  verifyTechToken,
  cubeTestController.deleteCubeTest,
);

export default router;
