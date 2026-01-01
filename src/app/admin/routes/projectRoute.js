import express from "express";
import {
  getProjectList,
  createProjectStep1,
  createProjectStep2,
  createProjectStep3,
  createProjectStep4,
  getProjectDetails,
  updateProject,
  deleteProject,
} from "../controllers/projectController.js";
import { verifyToken } from "../../../config/jwtConfig.js";

const router = express.Router();

router.get("/list", verifyToken, getProjectList);
router.post("/create-step1", verifyToken, createProjectStep1);
router.post("/create-step2", verifyToken, createProjectStep2);
router.post("/create-step3", verifyToken, createProjectStep3);
router.post("/create-step4", verifyToken, createProjectStep4);
router.get("/:projectId", verifyToken, getProjectDetails);
router.put("/:projectId", verifyToken, updateProject);
router.delete("/:projectId", verifyToken, deleteProject);

export default router;
