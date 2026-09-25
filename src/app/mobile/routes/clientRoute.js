import { Router } from 'express';
import * as clientController from '../controllers/clientController.js';
import * as orderController from '../controllers/orderController.js';
import * as cubeTestController from '../controllers/cubeTestController.js';
import * as tmController from '../controllers/tmController.js';
import * as teamController from '../controllers/clientTeamController.js';
import { verifyClientToken } from '../middleware/mobileAuth.js';
import { requireClientPermission as allow } from '../../../helper/clientAccess.js';
import { uploadCubeTestFiles } from '../../../config/cubeTestUploadConfig.js';

const router = Router();

// Profile & projects
router.get('/profile', verifyClientToken, clientController.getProfile);
// docs/06: who am I, my role, permissions and projects — the app builds its menus from this.
router.get('/me', verifyClientToken, teamController.me);
router.put('/fcm-token', verifyClientToken, clientController.registerFcmToken);
router.delete('/fcm-token', verifyClientToken, clientController.unregisterFcmToken);
router.get('/projects', verifyClientToken, clientController.getProjects);
router.get('/projects/:projectId', verifyClientToken, clientController.getProjectDetail);
router.get('/projects/:projectId/products', verifyClientToken, clientController.getProjectProducts);
router.get('/projects/:projectId/orders', verifyClientToken, allow('orders.view'), orderController.clientListProjectOrders);

// Products
router.get('/products', verifyClientToken, clientController.getProductNames);
router.get('/products/:productName/grades', verifyClientToken, clientController.getProductGrades);

// Cube testing across all of this client's orders. With cubeTests.manage
// (Owner, Site Engineer) a contact also logs and edits tests and adds result
// files at any time; they may remove only files their own team added.
// The upload runs AFTER the token and permission checks, like the tech routes.
router.get('/cube-tests', verifyClientToken, allow('cubeTests.view'), cubeTestController.clientListAllCubeTests);
router.get('/orders/:orderId/cube-test', verifyClientToken, allow('cubeTests.view'), cubeTestController.clientListCubeTests);
router.post('/orders/:orderId/cube-test', verifyClientToken, allow('cubeTests.manage'), uploadCubeTestFiles, cubeTestController.clientCreateCubeTest);
router.put('/orders/:orderId/cube-test/:cubeTestId', verifyClientToken, allow('cubeTests.manage'), uploadCubeTestFiles, cubeTestController.clientUpdateCubeTest);
router.delete('/orders/:orderId/cube-test/:cubeTestId/attachments/:attachmentId', verifyClientToken, allow('cubeTests.manage'), cubeTestController.clientDeleteAttachment);

// Money (P1.14, P1.16)
router.get('/credit', verifyClientToken, allow('account.view'), clientController.getCredit);
router.get('/bills', verifyClientToken, allow('bills.view'), clientController.listBills);
router.get('/payments', verifyClientToken, allow('account.view'), clientController.listPayments);
router.get('/ledger', verifyClientToken, allow('account.view'), clientController.getLedger);
router.get('/bills/:billNo/invoice', verifyClientToken, allow('bills.view'), clientController.downloadBillInvoice);

// Notifications
router.get('/notifications', verifyClientToken, clientController.getNotifications);
router.put('/notifications/:notificationId/read', verifyClientToken, clientController.markNotificationRead);

// Orders
router.get('/orders', verifyClientToken, allow('orders.view'), orderController.clientListOrders);
router.post('/orders', verifyClientToken, allow('orders.create'), orderController.clientCreateOrder);
router.get('/orders/:orderId', verifyClientToken, allow('orders.view'), orderController.clientGetOrder);
router.get('/orders/:orderId/comments', verifyClientToken, allow('orders.view'), orderController.listComments);
router.post('/orders/:orderId/comments', verifyClientToken, allow('orders.comment'), orderController.addComment);
router.post('/orders/:orderId/cancel', verifyClientToken, allow('orders.cancel'), orderController.clientCancelOrder);
router.post('/orders/:orderId/tm/:tmId/reject', verifyClientToken, allow('trucks.reject'), tmController.clientRejectTm);

// Team (docs/06, Q1): the owner adds site engineers and accounts people.
router.get('/team', verifyClientToken, allow('team.manage'), teamController.listTeam);
router.get('/roles', verifyClientToken, allow('team.manage'), teamController.listRoles);
router.post('/team', verifyClientToken, allow('team.manage'), teamController.addMember);
router.put('/team/:contactId', verifyClientToken, allow('team.manage'), teamController.updateMember);
router.delete('/team/:contactId', verifyClientToken, allow('team.manage'), teamController.removeMember);

export default router;
