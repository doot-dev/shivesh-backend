import { Router } from 'express'
import * as subcategoryController from "../controllers/subcategoryController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const subcategoryRoute = Router();

subcategoryRoute.post('/', verifyToken, subcategoryController.createSubcategory);
subcategoryRoute.get("/", verifyToken, subcategoryController.GetAllSubcategories);
subcategoryRoute.put("/", verifyToken, subcategoryController.updateSubcategory);
subcategoryRoute.patch("/:id/toggle-status", verifyToken, subcategoryController.toggleSubcategoryStatus);
subcategoryRoute.get("/:id", verifyToken, subcategoryController.GetSubcategoryById);
subcategoryRoute.delete("/:id", verifyToken, subcategoryController.deleteSubcategory);

export default subcategoryRoute;
