import { Router } from 'express'
import * as productController from "../controllers/productController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const productRoute = Router();

productRoute.post('/', verifyToken, productController.createProduct);
productRoute.get("/", verifyToken, productController.GetAllProducts);
productRoute.get("/:id", verifyToken, productController.GetProductById);
productRoute.put("/", verifyToken, productController.updateProduct);
productRoute.delete("/:id", verifyToken, productController.deleteProduct);
productRoute.delete("/hard/:id", verifyToken, productController.deleteProductFromTable);
productRoute.post('/size', verifyToken, productController.createSize);
productRoute.get("/size/:productId", verifyToken, productController.getSizesByProductId);
productRoute.put("/size", verifyToken, productController.updateSize);
productRoute.delete("/size/:id", verifyToken, productController.deleteSize);

export default productRoute;

