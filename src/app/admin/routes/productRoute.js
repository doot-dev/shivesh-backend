import { Router } from 'express'
import * as productController from "../controllers/productController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const productRoute = Router();

productRoute.post('/', verifyToken, productController.createProduct);
productRoute.get("/", verifyToken, productController.GetAllProducts);
productRoute.put("/", verifyToken, productController.updateProduct);
productRoute.post('/size', verifyToken, productController.createSize);
productRoute.get("/size/:productId", verifyToken, productController.getSizesByProductId);
productRoute.put("/size", verifyToken, productController.updateSize);
productRoute.patch("/size/:id/toggle-status", verifyToken, productController.toggleSizeStatus);
productRoute.delete("/size/:id", verifyToken, productController.deleteSize);
productRoute.delete("/hard/:id", verifyToken, productController.deleteProductFromTable);
productRoute.patch("/:id/toggle-status", verifyToken, productController.toggleProductStatus);
productRoute.get("/:id", verifyToken, productController.GetProductById);
productRoute.delete("/:id", verifyToken, productController.deleteProduct);

export default productRoute;

