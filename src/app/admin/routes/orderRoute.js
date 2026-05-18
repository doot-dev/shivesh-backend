import { Router } from 'express';
import * as orderController from '../controllers/orderController.js';
import { verifyToken } from '../../../config/jwtConfig.js';

const router = Router();

router.get('/field-techs', verifyToken, orderController.listFieldTechs);
router.get('/', verifyToken, orderController.listOrders);
router.post('/', verifyToken, orderController.createOrder);
router.get('/:orderId', verifyToken, orderController.getOrder);
router.put('/:orderId', verifyToken, orderController.updateOrder);
router.delete('/:orderId', verifyToken, orderController.deleteOrder);
router.post('/:orderId/comments', verifyToken, orderController.addComment);

export default router;
