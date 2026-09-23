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
import { requirePermission, can } from "../../../helper/accessControl.js";

const router = express.Router();

// TM review routes — challans and accept/reject are collected against a bill.
// Accepting or rejecting a TM is the money decision, so it needs the dedicated
// `billing.approve` permission rather than plain update.
router.post("/:billNo/tm/:tmId/challan", verifyToken, requirePermission(can('billing', 'update')), uploadSingleChallan, uploadTmChallan);
router.put("/:billNo/tm/:tmId/approval", verifyToken, requirePermission(can('billing', 'approve')), updateTmApproval);

// Bill routes
router.post("/create", verifyToken, requirePermission(can('billing', 'create')), createBill);
router.get("/list", verifyToken, requirePermission(can('billing', 'view')), getBillList);
// The order detail screen shows a bill summary, so orders.view can read one bill.
router.get("/order/:orderId", verifyToken, requirePermission(can('billing', 'view'), can('orders', 'view')), getBillByOrder);
router.put("/status", verifyToken, requirePermission(can('billing', 'update')), updateBillStatus);
router.put("/", verifyToken, requirePermission(can('billing', 'update')), updateBill);
router.post("/:billNo/document", verifyToken, requirePermission(can('billing', 'update')), uploadSingleBillDoc, uploadBillDocument);
router.get("/:billNo", verifyToken, requirePermission(can('billing', 'view')), getBillDetails);
router.delete("/:billNo", verifyToken, requirePermission(can('billing', 'delete')), deleteBill);

export default router;
