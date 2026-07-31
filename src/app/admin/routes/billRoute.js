import express from "express";
import {
  createBill,
  getBillList,
  getBillDetails,
  getBillByOrder,
  updateBill,
  updateBillStatus,
  deleteBill,
  uploadBillDocument,
  uploadTmChallan,
  updateTmApproval,
} from "../controllers/billController.js";
import { verifyToken } from "../../../config/jwtConfig.js";
import { uploadSingleBillDoc } from "../../../config/billUploadConfig.js";
import { uploadSingleChallan } from "../../../config/challanUploadConfig.js";

const router = express.Router();

// TM review routes — challans and accept/reject are collected against a bill
router.post("/:billNo/tm/:tmId/challan", verifyToken, uploadSingleChallan, uploadTmChallan);
router.put("/:billNo/tm/:tmId/approval", verifyToken, updateTmApproval);

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
