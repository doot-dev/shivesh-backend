import { Router } from 'express';
import * as orderController from '../controllers/orderController.js';
import * as cubeTestController from '../controllers/cubeTestController.js';
import { verifyToken } from '../../../config/jwtConfig.js';
import { uploadSingleCubeTestFile } from '../../../config/cubeTestUploadConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';
import * as billController from '../controllers/billController.js';
import { uploadSingleOrderChallan } from '../../../config/challanUploadConfig.js';

const router = Router();

// Order Vendor routes — assigning a vendor to an order is editing the order.
router.post('/vendor/create', verifyToken, requirePermission(can('orders', 'update')), orderController.createOrderVendor);
router.get('/:orderId/vendor/list', verifyToken, requirePermission(can('orders', 'view')), orderController.getOrderVendors);
router.put('/vendor', verifyToken, requirePermission(can('orders', 'update')), orderController.updateOrderVendor);
router.delete('/:orderId/vendor/:orderVendorId', verifyToken, requirePermission(can('orders', 'update')), orderController.deleteOrderVendor);

// Order Technician routes
router.post('/technician/create', verifyToken, requirePermission(can('orders', 'update')), orderController.createOrderTechnician);
router.get('/:orderId/technician/list', verifyToken, requirePermission(can('orders', 'view')), orderController.getOrderTechnicians);
router.put('/technician', verifyToken, requirePermission(can('orders', 'update')), orderController.updateOrderTechnician);
router.delete('/:orderId/technician/:orderTechnicianId', verifyToken, requirePermission(can('orders', 'update')), orderController.deleteOrderTechnician);

// TM review on the ORDER (W11): challan upload + accept/reject before any bill
// exists. Same handlers and permissions as the /bills/:billNo/tm/... routes.
router.post('/:orderId/tm/:tmId/challan', verifyToken, requirePermission(can('billing', 'update')), uploadSingleOrderChallan, billController.uploadTmChallan);
router.put('/:orderId/tm/:tmId/approval', verifyToken, requirePermission(can('billing', 'approve')), billController.updateTmApproval);

// Order TM routes
router.post('/:orderId/tm', verifyToken, requirePermission(can('orders', 'update')), orderController.createOrderTm);
router.get('/:orderId/tm', verifyToken, requirePermission(can('orders', 'view')), orderController.getOrderTms);
router.put('/:orderId/tm/:tmId', verifyToken, requirePermission(can('orders', 'update')), orderController.updateOrderTm);
router.delete('/:orderId/tm/:tmId', verifyToken, requirePermission(can('orders', 'delete')), orderController.deleteOrderTm);

// Order Cube Test routes — these live under an order URL but belong to the
// Cube Testing module, so they are gated on cubeTests, not orders.
router.post('/:orderId/cube-test', verifyToken, requirePermission(can('cubeTests', 'create')), uploadSingleCubeTestFile, cubeTestController.createCubeTest);
router.get('/:orderId/cube-test', verifyToken, requirePermission(can('cubeTests', 'view')), cubeTestController.getCubeTests);
router.get('/:orderId/cube-test/:cubeTestId', verifyToken, requirePermission(can('cubeTests', 'view')), cubeTestController.getCubeTest);
router.put('/:orderId/cube-test/:cubeTestId', verifyToken, requirePermission(can('cubeTests', 'update')), uploadSingleCubeTestFile, cubeTestController.updateCubeTest);
router.delete('/:orderId/cube-test/:cubeTestId', verifyToken, requirePermission(can('cubeTests', 'delete')), cubeTestController.deleteCubeTest);

// W23: credit hold release — only for approvers (Super Admin, or a Project Manager granted orders.approve).
router.post('/:orderId/credit-release', verifyToken, requirePermission(can('orders', 'approve')), orderController.releaseCreditHold);

// Order routes
router.get('/field-techs', verifyToken, requirePermission(can('orders', 'view')), orderController.listFieldTechs);
router.get('/', verifyToken, requirePermission(can('orders', 'view')), orderController.listOrders);
router.post('/', verifyToken, requirePermission(can('orders', 'create')), orderController.createOrder);
router.get('/:orderId', verifyToken, requirePermission(can('orders', 'view')), orderController.getOrder);
router.put('/:orderId', verifyToken, requirePermission(can('orders', 'update')), orderController.updateOrder);
router.put('/:orderId/status', verifyToken, requirePermission(can('orders', 'update')), orderController.updateOrderStatus);
router.delete('/:orderId', verifyToken, requirePermission(can('orders', 'delete')), orderController.deleteOrder);
// Commenting is intentionally view-level: anyone who can open an order should
// be able to reply on it, otherwise read-only staff cannot answer a client.
router.post('/:orderId/comments', verifyToken, requirePermission(can('orders', 'view')), orderController.addComment);

export default router;
