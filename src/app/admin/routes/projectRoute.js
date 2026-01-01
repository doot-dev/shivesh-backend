import express from "express";
import {
  getProjectList,
  createProject,
  getProjectDetails,
  updateProject,
  deleteProject,
  updateProjectCredit,
  updateProjectCommission,
} from "../controllers/projectController.js";
import { verifyToken } from "../../../config/jwtConfig.js";

const router = express.Router();

router.get("/list", verifyToken, getProjectList);
router.post("/create", verifyToken, createProject);
router.get("/:projectId", verifyToken, getProjectDetails);
router.put("/", verifyToken, updateProject);
router.put("/credit", verifyToken, updateProjectCredit);
router.put("/commission", verifyToken, updateProjectCommission);
router.delete("/:projectId", verifyToken, deleteProject);

export default router;
