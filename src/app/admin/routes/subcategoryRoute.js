import { Router } from 'express'
import * as subcategoryController from "../controllers/subcategoryController.js"
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const subcategoryRoute = Router();

subcategoryRoute.post('/', verifyToken, requirePermission(can('subcategories', 'create')), subcategoryController.createSubcategory);
// Reading the sub-category master is also allowed to anyone who can manage
// projects: the project product form needs this list to render its dropdown.
subcategoryRoute.get("/", verifyToken, requirePermission(can('subcategories', 'view'), can('projects', 'view'), can('products', 'view')), subcategoryController.GetAllSubcategories);
subcategoryRoute.put("/", verifyToken, requirePermission(can('subcategories', 'update')), subcategoryController.updateSubcategory);
subcategoryRoute.patch("/:id/toggle-status", verifyToken, requirePermission(can('subcategories', 'update')), subcategoryController.toggleSubcategoryStatus);
subcategoryRoute.get("/:id", verifyToken, requirePermission(can('subcategories', 'view')), subcategoryController.GetSubcategoryById);
subcategoryRoute.delete("/:id", verifyToken, requirePermission(can('subcategories', 'delete')), subcategoryController.deleteSubcategory);

export default subcategoryRoute;
