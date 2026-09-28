import express from "express";
import {
  getProjectList,
  createProject,
  getProjectDetails,
  updateProject,
  deleteProject,
  updateProjectCredit,
  updateProjectCommission,
  createProjectProduct,
  getProjectProducts,
  getProjectProductDetails,
  updateProjectProduct,
  deleteProjectProduct,
  createProjectProductVendor,
  getProjectProductVendors,
  updateProjectProductVendor,
  deleteProjectProductVendor,
  setProjectTechnicians,
} from "../controllers/projectController.js";
import { verifyToken } from "../../../config/jwtConfig.js";
import { requirePermission, can } from "../../../helper/accessControl.js";

const router = express.Router();


// Project Product Vendor routes — nested under a project, so gated on projects.
router.post("/product/vendor/create", verifyToken, requirePermission(can('projectProducts', 'update')), createProjectProductVendor);
router.get("/:projectId/product/:productId/vendor/list", verifyToken, requirePermission(can('projectProducts', 'view'), can('orders', 'create'), can('orders', 'update')), getProjectProductVendors);
router.put("/product/vendor", verifyToken, requirePermission(can('projectProducts', 'update')), updateProjectProductVendor);
router.delete("/:projectId/product/:productId/vendor/:productVendorId", verifyToken, requirePermission(can('projectProducts', 'update')), deleteProjectProductVendor);

router.put("/:projectId/technicians", verifyToken, requirePermission(can('projectTeam', 'update')), setProjectTechnicians);

// Project Product routes
router.post("/product/create", verifyToken, requirePermission(can('projectProducts', 'create')), createProjectProduct);
router.get("/:projectId/product/list", verifyToken, requirePermission(can('projectProducts', 'view'), can('orders', 'create'), can('orders', 'update')), getProjectProducts);
router.get("/:projectId/product/:productId", verifyToken, requirePermission(can('projectProducts', 'view')), getProjectProductDetails);
router.put("/product", verifyToken, requirePermission(can('projectProducts', 'update')), updateProjectProduct);
router.delete("/:projectId/product/:productId", verifyToken, requirePermission(can('projectProducts', 'delete')), deleteProjectProduct);

// Project routes. Orders need to read the project list to build an order, so
// project reads also accept orders.view.
router.get("/list", verifyToken, requirePermission() /* lookup: any signed-in user */, getProjectList);
router.post("/create", verifyToken, requirePermission(can('projects', 'create')), createProject);
router.get("/:projectId", verifyToken, requirePermission(can('projects', 'view'), can('orders', 'view')), getProjectDetails);
router.put("/", verifyToken, requirePermission(can('projects', 'update')), updateProject);
router.put("/credit", verifyToken, requirePermission(can('projects', 'update')), updateProjectCredit);
router.put("/commission", verifyToken, requirePermission(can('projectCommission', 'update')), updateProjectCommission);
router.delete("/:projectId", verifyToken, requirePermission(can('projects', 'delete')), deleteProject);


export default router;
