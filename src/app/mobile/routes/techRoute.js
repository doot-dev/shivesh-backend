import { Router } from 'express';
import * as techController from '../controllers/techController.js';
import * as orderController from '../controllers/orderController.js';
import * as tmController from '../controllers/tmController.js';
import * as cubeTestController from '../controllers/cubeTestController.js';
import { verifyTechToken } from '../middleware/mobileAuth.js';
import { uploadCubeTestFiles } from '../../../config/cubeTestUploadConfig.js';
import { uploadSingleOrderChallan } from '../../../config/challanUploadConfig.js';

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

// TM details.
//
// createTm/updateTm accept multipart so the challan photo arrives with the TM
// itself. Like the cube-test routes below, the upload middleware runs AFTER
// verifyTechToken so an unauthenticated request cannot stream a 10MB file to
// disk. Plain JSON bodies still work — multer passes them straight through.
router.post(
  '/orders/:orderId/tm',
  verifyTechToken,
  uploadSingleOrderChallan,
  tmController.createTm,
);
router.put(
  '/orders/:orderId/tm/:tmId',
  verifyTechToken,
  uploadSingleOrderChallan,
  tmController.updateTm,
);
router.delete('/orders/:orderId/tm/:tmId', verifyTechToken, tmController.deleteTm);
router.put('/orders/:orderId/tm/:tmId/reached', verifyTechToken, tmController.markTmReached);

// Cube testing reports.
//
// uploadCubeTestFiles runs AFTER verifyTechToken on purpose: multer parses
// the multipart body, and letting an unauthenticated request stream a 10MB file
// to disk before the token is checked is free storage for anyone with the URL.
// Cross-order feed for the "Cube Tests" tab. Declared BEFORE the
// /orders/:orderId/... routes only for readability — they cannot collide, since
// this path has no :orderId segment.
router.get('/cube-tests', verifyTechToken, cubeTestController.listAllCubeTests);

router.get('/orders/:orderId/cube-test', verifyTechToken, cubeTestController.listCubeTests);
router.post(
  '/orders/:orderId/cube-test',
  verifyTechToken,
  uploadCubeTestFiles,
  cubeTestController.createCubeTest,
);
router.put(
  '/orders/:orderId/cube-test/:cubeTestId',
  verifyTechToken,
  uploadCubeTestFiles,
  cubeTestController.updateCubeTest,
);
router.delete(
  '/orders/:orderId/cube-test/:cubeTestId',
  verifyTechToken,
  cubeTestController.deleteCubeTest,
);
router.delete(
  '/orders/:orderId/cube-test/:cubeTestId/attachments/:attachmentId',
  verifyTechToken,
  cubeTestController.deleteAttachment,
);

export default router;
