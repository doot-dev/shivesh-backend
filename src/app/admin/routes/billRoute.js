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
  uploadBillDocument,
} from "../controllers/billController.js";
import { verifyToken } from "../../../config/jwtConfig.js";
import { uploadSingleBillDoc } from "../../../config/billUploadConfig.js";

const router = express.Router();

// TM approval routes (gates what gets billed)
router.put("/tm/approval", verifyToken, updateTmApproval);

// Bill routes
router.post("/create", verifyToken, createBill);
router.get("/list", verifyToken, getBillList);
router.get("/order/:orderId", verifyToken, getBillByOrder);
router.put("/status", verifyToken, updateBillStatus);
router.put("/", verifyToken, updateBill);
router.post("/:billNo/document", verifyToken, uploadSingleBillDoc, uploadBillDocument);
router.get("/:billNo", verifyToken, getBillDetails);
router.delete("/:billNo", verifyToken, deleteBill);

export default router;
