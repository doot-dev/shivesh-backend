import { Router } from 'express'
import * as productController from "../controllers/productController.js"
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const productRoute = Router();

// Sizes/grades are part of the product master, so they share its permissions.
productRoute.post('/', verifyToken, requirePermission(can('products', 'create')), productController.createProduct);
productRoute.get("/", verifyToken, requirePermission() /* lookup: any signed-in user */, productController.GetAllProducts);
productRoute.put("/", verifyToken, requirePermission(can('products', 'update')), productController.updateProduct);
productRoute.post('/size', verifyToken, requirePermission(can('products', 'create')), productController.createSize);
productRoute.get("/size/:productId", verifyToken, requirePermission() /* lookup: any signed-in user */, productController.getSizesByProductId);
productRoute.put("/size", verifyToken, requirePermission(can('products', 'update')), productController.updateSize);
productRoute.patch("/size/:id/toggle-status", verifyToken, requirePermission(can('products', 'update')), productController.toggleSizeStatus);
productRoute.delete("/size/:id", verifyToken, requirePermission(can('products', 'delete')), productController.deleteSize);
productRoute.delete("/hard/:id", verifyToken, requirePermission(can('products', 'delete')), productController.deleteProductFromTable);
productRoute.patch("/:id/toggle-status", verifyToken, requirePermission(can('products', 'update')), productController.toggleProductStatus);
productRoute.get("/:id", verifyToken, requirePermission() /* lookup: any signed-in user */, productController.GetProductById);
productRoute.delete("/:id", verifyToken, requirePermission(can('products', 'delete')), productController.deleteProduct);

export default productRoute;
