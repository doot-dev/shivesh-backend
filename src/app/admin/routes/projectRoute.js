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
} from "../controllers/projectController.js";
import { verifyToken } from "../../../config/jwtConfig.js";

const router = express.Router();


// Project Product Vendor routes
router.post("/product/vendor/create", verifyToken, createProjectProductVendor);
router.get("/:projectId/product/:productId/vendor/list", verifyToken, getProjectProductVendors);
router.put("/product/vendor", verifyToken, updateProjectProductVendor);
router.delete("/:projectId/product/:productId/vendor/:vendorId", verifyToken, deleteProjectProductVendor);

// Project Product routes
router.post("/product/create", verifyToken, createProjectProduct);
router.get("/:projectId/product/list", verifyToken, getProjectProducts);
router.get("/:projectId/product/:productId", verifyToken, getProjectProductDetails);
router.put("/product", verifyToken, updateProjectProduct);
router.delete("/:projectId/product/:productId", verifyToken, deleteProjectProduct);

// Project routes
router.get("/list", verifyToken, getProjectList);
router.post("/create", verifyToken, createProject);
router.get("/:projectId", verifyToken, getProjectDetails);
router.put("/", verifyToken, updateProject);
router.put("/credit", verifyToken, updateProjectCredit);
router.put("/commission", verifyToken, updateProjectCommission);
router.delete("/:projectId", verifyToken, deleteProject);


export default router;
