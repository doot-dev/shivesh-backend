import { Router } from 'express';
import * as orderController from '../controllers/orderController.js';
import * as cubeTestController from '../controllers/cubeTestController.js';
import { verifyToken } from '../../../config/jwtConfig.js';
import { uploadSingleCubeTestFile } from '../../../config/cubeTestUploadConfig.js';

const router = Router();

// Order Vendor routes
router.post('/vendor/create', verifyToken, orderController.createOrderVendor);
router.get('/:orderId/vendor/list', verifyToken, orderController.getOrderVendors);
router.put('/vendor', verifyToken, orderController.updateOrderVendor);
router.delete('/:orderId/vendor/:orderVendorId', verifyToken, orderController.deleteOrderVendor);

// Order Technician routes
router.post('/technician/create', verifyToken, orderController.createOrderTechnician);
router.get('/:orderId/technician/list', verifyToken, orderController.getOrderTechnicians);
router.put('/technician', verifyToken, orderController.updateOrderTechnician);
router.delete('/:orderId/technician/:orderTechnicianId', verifyToken, orderController.deleteOrderTechnician);

// Order TM routes
router.post('/:orderId/tm', verifyToken, orderController.createOrderTm);
router.get('/:orderId/tm', verifyToken, orderController.getOrderTms);
router.put('/:orderId/tm/:tmId', verifyToken, orderController.updateOrderTm);
router.delete('/:orderId/tm/:tmId', verifyToken, orderController.deleteOrderTm);

// Order Cube Test routes
router.post('/:orderId/cube-test', verifyToken, uploadSingleCubeTestFile, cubeTestController.createCubeTest);
router.get('/:orderId/cube-test', verifyToken, cubeTestController.getCubeTests);
router.get('/:orderId/cube-test/:cubeTestId', verifyToken, cubeTestController.getCubeTest);
router.put('/:orderId/cube-test/:cubeTestId', verifyToken, uploadSingleCubeTestFile, cubeTestController.updateCubeTest);
router.delete('/:orderId/cube-test/:cubeTestId', verifyToken, cubeTestController.deleteCubeTest);

// Order routes
router.get('/field-techs', verifyToken, orderController.listFieldTechs);
router.get('/', verifyToken, orderController.listOrders);
router.post('/', verifyToken, orderController.createOrder);
router.get('/:orderId', verifyToken, orderController.getOrder);
router.put('/:orderId', verifyToken, orderController.updateOrder);
router.put('/:orderId/status', verifyToken, orderController.updateOrderStatus);
router.delete('/:orderId', verifyToken, orderController.deleteOrder);
router.post('/:orderId/comments', verifyToken, orderController.addComment);

export default router;
