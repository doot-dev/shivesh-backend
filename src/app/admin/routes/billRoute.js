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
  downloadInvoice,
} from "../controllers/billController.js";
import { verifyToken } from "../../../config/jwtConfig.js";
import { exportRegister } from "../controllers/reportController.js";
import { billingLog } from "../controllers/paymentController.js";
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
// W33: Billing → Log tab.
router.get("/log", verifyToken, requirePermission(can('billing', 'view')), billingLog);
// G16: the billing list's Export = the sales register for the chosen dates.
router.get("/export", verifyToken, requirePermission(can('reports', 'export')), (req, res) => {
  req.params.register = "sales";
  req.query.from = req.query.dateFrom || req.query.from;
  req.query.to = req.query.dateTo || req.query.to;
  return exportRegister(req, res);
});
// The order detail screen shows a bill summary, so orders.view can read one bill.
router.get("/order/:orderId", verifyToken, requirePermission(can('billing', 'view'), can('orders', 'view')), getBillByOrder);
router.put("/status", verifyToken, requirePermission(can('billing', 'update')), updateBillStatus);
router.put("/", verifyToken, requirePermission(can('billing', 'update')), updateBill);
router.post("/:billNo/document", verifyToken, requirePermission(can('billing', 'update')), uploadSingleBillDoc, uploadBillDocument);
router.get("/:billNo/invoice", verifyToken, requirePermission(can('billing', 'view')), downloadInvoice);
router.get("/:billNo", verifyToken, requirePermission(can('billing', 'view')), getBillDetails);
router.delete("/:billNo", verifyToken, requirePermission(can('billing', 'delete')), deleteBill);

export default router;
