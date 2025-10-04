import { Router } from 'express'
import * as productController from "../controllers/productController.js"



const productRoute = Router();

productRoute
    .post('/', productController.createProduct)
    .get("/", productController.GetAllProducts)
    .get("/:id", productController.GetProductById)
    .delete("/:id", productController.deleteProduct)
    .delete("/hard/:id" , productController.deleteProductFromTable);


productRoute
    .post('/size', productController.createSize)
    .get("/size/:productId", productController.getSizesByProductId)
    .put("/size", productController.updateSize)
    .delete("/size/:id", productController.deleteSize);


export default productRoute;    