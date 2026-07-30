import express from "express";
import {
  createBill,
  getBillList,
  getBillDetails,
  getBillByOrder,
  updateBill,
  updateBillStatus,
  deleteBill,
  updateTmApproval,
} from "../controllers/billController.js";
import { verifyToken } from "../../../config/jwtConfig.js";

const router = express.Router();

// TM approval routes (gates what gets billed)
router.put("/tm/approval", verifyToken, updateTmApproval);

// Bill routes
router.post("/create", verifyToken, createBill);
router.get("/list", verifyToken, getBillList);
router.get("/order/:orderId", verifyToken, getBillByOrder);
router.put("/status", verifyToken, updateBillStatus);
router.put("/", verifyToken, updateBill);
router.get("/:billNo", verifyToken, getBillDetails);
router.delete("/:billNo", verifyToken, deleteBill);

export default router;
