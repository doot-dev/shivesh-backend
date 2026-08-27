import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { validatorFunction } from "../../../helper/validate.js";
import {
  createBillValidation,
  updateBillValidation,
  updateBillStatusValidation,
  updateTmApprovalValidation,
} from "../validations/billValidation.js";
import { createActivityLog } from "../../../helper/activityLogger.js";
import { sendNotification } from "../../../helper/notificationHelper.js";
import { getBillDocPublicUrl } from "../../../config/billUploadConfig.js";
import { getChallanPublicUrl } from "../../../config/challanUploadConfig.js";

/**
 * Resolve a bill and one of its order's TMs together.
 *
 * TM review happens against a generated bill, so both endpoints below address a
 * TM through its billNo rather than its order.
 */
async function resolveBillTm(billNo, tmId) {
  const bill = await db.bill.findFirst({ where: { billNo, isDeleted: false } });

  if (!bill) {
    return { error: "Bill not found", statusCode: 404 };
  }

  const tm = await db.tmDetail.findFirst({
    where: { id: tmId, orderId: bill.orderId, isDeleted: false },
  });

  if (!tm) {
    return { error: "TM detail not found on this bill", statusCode: 404 };
  }

  return { bill, tm };
}

// Bills are locked once money has moved or the bill is void.
export const LOCKED_BILL_STATUSES = ["PAID", "CANCELLED"];

// Only a finished order can be billed.
export const BILLABLE_ORDER_STATUS = "COMPLETED";

/**
 * Order.quantity is free text ("30", "30 m3"), so a bill's quantity depends on
 * parsing it. Anything we cannot read as a positive number is rejected rather
 * than coerced to 0 — silently under-billing is worse than refusing to bill.
 */
function resolveQuantity(order) {
  const value = parseFloat(String(order.quantity ?? "").trim());

  if (!Number.isFinite(value) || value <= 0) {
    return {
      error: `Cannot read quantity "${order.quantity}" on order ${order.orderId}`,
    };
  }

  return { quantity: value };
}

/**
 * The rate for an order comes from the project's pricing for that exact
 * product + grade, unless the caller overrides it.
 */
async function resolveRate(order, overrideRate) {
  if (overrideRate !== undefined && overrideRate !== null && overrideRate !== "") {
    const rate = parseFloat(overrideRate);
    if (!Number.isFinite(rate) || rate < 0) {
      return { error: "rate must be a positive number" };
    }
    return { rate };
  }

  const projectProduct = await db.projectProduct.findFirst({
    where: {
      projectId: order.projectId,
      productName: order.productName,
      productGrade: order.productGrade,
    },
  });

  if (!projectProduct) {
    return {
      error: `No price configured for ${order.productName} ${order.productGrade} on this project — pass an explicit rate`,
    };
  }

  return { rate: projectProduct.costPrice };
}

function buildBillOrderInclude() {
  return {
    project: { select: { projectId: true, projectName: true, siteName: true, projectLocation: true } },
    client: { select: { clientId: true, companyName: true, contactNumber: true, email: true, gstNumber: true } },
    vendors: {
      where: { isDeleted: false },
      include: {
        vendor: { select: { id: true, companyName: true } },
        vendorLocation: { select: { id: true, plantName: true } },
      },
    },
    technicians: {
      where: { isDeleted: false },
      include: { user: { select: { id: true, name: true, employeeId: true, phone: true } } },
    },
    // Shown on the bill page for reference. TMs never affect the billed amount.
    tmDetails: { where: { isDeleted: false }, orderBy: { createdAt: "asc" } },
  };
}

/**
 * Shape an order + bill into the bill page payload: bill details card, field
 * technician details, TM details and the activity log.
 */
async function buildBillPayload(bill, order) {
  const activityLog = await db.activity.findMany({
    where: { entityType: "ORDER", entityId: order.id },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  const vendorNames = order.vendors.map((v) => v.vendor.companyName);

  return {
    billNo: bill.billNo,
    status: bill.status,
    issueDate: bill.issueDate,
    dueDate: bill.dueDate,
    paidAt: bill.paidAt,
    documentUrl: bill.documentUrl,
    billDetails: {
      product: order.productName,
      grade: order.productGrade,
      quantity: bill.quantity,
      clientName: order.client.companyName,
      site: order.project.siteName,
      contactNo: order.client.contactNumber,
      orderNo: order.orderId,
      vendorName: vendorNames.join(", "),
      vendors: order.vendors.map((v) => ({
        id: v.id,
        vendorId: v.vendor.id,
        companyName: v.vendor.companyName,
        plantName: v.vendorLocation?.plantName ?? null,
      })),
      date: order.date,
      rate: bill.rate,
      amount: bill.amount,
    },
    fieldTechnicians: order.technicians.map((t) => ({
      id: t.id,
      name: t.user.name,
      contactNo: t.user.phone,
      employeeId: t.user.employeeId,
    })),
    tmDetails: order.tmDetails.map((tm) => ({
      id: tm.id,
      tmNumber: tm.tmNumber,
      truckNo: tm.truckNo,
      qty: tm.qty,
      dispatchTime: tm.dispatchTime,
      arrivalTime: tm.arrivalTime,
      batchStartTime: tm.batchStartTime,
      batchEndTime: tm.batchEndTime,
      challanNo: tm.challanNo,
      challanUrl: tm.challanUrl,
      status: tm.status,
      approvalStatus: tm.approvalStatus,
      rejectionReason: tm.rejectionReason,
      approvedAt: tm.approvedAt,
    })),
    activityLog: activityLog.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      action: a.action,
      createdAt: a.createdAt,
      createdBy: a.createdBy?.name ?? null,
    })),
  };
}

/**
 * Generate a bill for a COMPLETED order from the order's own quantity and rate.
 *
 * Shared by the manual create endpoint and the automatic generation that fires
 * when an order is marked COMPLETED, so both produce identical bills. Returns
 * { error, statusCode } instead of throwing, because the automatic caller must
 * not fail the status update it is riding on.
 */
export async function generateBillForOrder(
  orderId,
  { rate: overrideRate, dueDate, createdById } = {},
) {
  const order = await db.order.findFirst({
    where: { orderId, isDeleted: false },
    include: buildBillOrderInclude(),
  });

  if (!order) {
    return { error: "Order not found", statusCode: 404 };
  }

  if (order.status !== BILLABLE_ORDER_STATUS) {
    return {
      error: `Order ${orderId} is ${order.status} — only ${BILLABLE_ORDER_STATUS} orders can be billed`,
      statusCode: 400,
    };
  }

  const existing = await db.bill.findFirst({
    where: { orderId: order.id, isDeleted: false },
  });

  if (existing) {
    return {
      error: `Order already has bill ${existing.billNo}`,
      statusCode: 409,
      bill: existing,
    };
  }

  const { error: qtyError, quantity } = resolveQuantity(order);
  if (qtyError) {
    return { error: qtyError, statusCode: 400 };
  }

  const { error: rateError, rate } = await resolveRate(order, overrideRate);
  if (rateError) {
    return { error: rateError, statusCode: 400 };
  }

  // Generate billNo
  const currentYear = new Date().getFullYear();
  const lastBill = await db.bill.findFirst({
    where: { billNo: { startsWith: `BILL-${currentYear}-` } },
    orderBy: { billNo: "desc" },
  });

  let seq = 1;
  if (lastBill) {
    seq = parseInt(lastBill.billNo.split("-")[2]) + 1;
  }
  const billNo = `BILL-${currentYear}-${String(seq).padStart(4, "0")}`;

  const bill = await db.bill.create({
    data: {
      billNo,
      orderId: order.id,
      quantity,
      rate,
      amount: quantity * rate,
      status: "PENDING",
      issueDate: new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });

  await createActivityLog({
    title: "Bill generated",
    description: `Bill ${billNo} generated for order ${orderId} — ${quantity} × ${rate} = ${bill.amount}`,
    entityType: "ORDER",
    entityId: order.id,
    action: "CREATED",
    createdById,
  });

  logger.info(`Bill generated successfully: ${billNo}`);

  return { bill, order };
}

/**
 * Generate a bill for a COMPLETED order.
 *
 * Orders are billed automatically the moment they are marked COMPLETED, so this
 * is the manual fallback for orders that finished without one.
 */
export const createBill = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, createBillValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { orderId, rate: overrideRate, dueDate } = req.body;

    logger.info(`Generating bill for order: ${orderId}`);

    const { error, statusCode, bill, order } = await generateBillForOrder(orderId, {
      rate: overrideRate,
      dueDate,
      createdById: Number(req.user?.data?.id) || null,
    });

    if (error) {
      return res.status(statusCode).json({ success: false, message: error });
    }

    return res.status(201).json({
      success: true,
      message: "Bill generated successfully",
      data: await buildBillPayload(bill, order),
    });
  } catch (error) {
    logger.error("Error generating bill:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate bill",
      error: error.message,
    });
  }
};

/**
 * Get list of all bills with pagination and filters
 */
export const getBillList = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, clientId, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const where = {
      isDeleted: false,
      ...(status && { status }),
      ...(clientId && { order: { client: { clientId } } }),
      ...(search && {
        OR: [
          { billNo: { contains: search } },
          { order: { orderId: { contains: search } } },
          { order: { client: { companyName: { contains: search } } } },
        ],
      }),
    };

    const [bills, total] = await Promise.all([
      db.bill.findMany({
        where,
        include: {
          order: {
            select: {
              orderId: true,
              productName: true,
              productGrade: true,
              date: true,
              client: { select: { clientId: true, companyName: true } },
              project: { select: { projectId: true, siteName: true } },
              _count: {
                select: { tmDetails: { where: { isDeleted: false } } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      db.bill.count({ where }),
    ]);

    const data = bills.map((bill) => ({
      ...bill,
      orderId: bill.order.orderId,
      assignedTrucks: bill.order._count.tmDetails,
    }));

    return res.status(200).json({ success: true, data, total, page: pageNum });
  } catch (error) {
    logger.error("Error fetching bills:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bills",
      error: error.message,
    });
  }
};

/**
 * Get full bill details for the bill page
 */
export const getBillDetails = async (req, res) => {
  try {
    const { billNo } = req.params;

    logger.info(`Fetching bill details: ${billNo}`);

    const bill = await db.bill.findFirst({ where: { billNo, isDeleted: false } });

    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }

    const order = await db.order.findFirst({
      where: { id: bill.orderId },
      include: buildBillOrderInclude(),
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({ success: true, data: await buildBillPayload(bill, order) });
  } catch (error) {
    logger.error("Error fetching bill details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bill details",
      error: error.message,
    });
  }
};

/**
 * Attach an uploaded PDF/photo (e.g. signed challan, physical bill scan) to a bill.
 */
export const uploadBillDocument = async (req, res) => {
  try {
    const { billNo } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const bill = await db.bill.findFirst({ where: { billNo, isDeleted: false } });

    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }

    const documentUrl = getBillDocPublicUrl(billNo, req.file.filename);

    const updated = await db.bill.update({
      where: { id: bill.id },
      data: { documentUrl },
    });

    await createActivityLog({
      title: "Bill document uploaded",
      description: `Document uploaded for bill ${billNo}`,
      entityType: "BILL",
      entityId: bill.id,
      action: "UPDATE",
      createdById: req.user?.id,
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    logger.error("Error uploading bill document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload bill document",
      error: error.message,
    });
  }
};

/**
 * Get the bill for a given order
 */
export const getBillByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
      include: buildBillOrderInclude(),
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const bill = await db.bill.findFirst({ where: { orderId: order.id, isDeleted: false } });

    if (!bill) {
      return res.status(404).json({ success: false, message: "No bill generated for this order" });
    }

    return res.status(200).json({ success: true, data: await buildBillPayload(bill, order) });
  } catch (error) {
    logger.error("Error fetching bill by order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bill",
      error: error.message,
    });
  }
};

/**
 * Update a bill's rate / due date, optionally recalculating from accepted TMs
 */
export const updateBill = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, updateBillValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { billNo, rate: overrideRate, dueDate, recalculate } = req.body;

    logger.info(`Updating bill: ${billNo}`);

    const bill = await db.bill.findFirst({ where: { billNo, isDeleted: false } });

    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }

    if (LOCKED_BILL_STATUSES.includes(bill.status)) {
      return res.status(409).json({
        success: false,
        message: `Bill ${billNo} is ${bill.status} and can no longer be edited`,
      });
    }

    const order = await db.order.findFirst({
      where: { id: bill.orderId },
      include: buildBillOrderInclude(),
    });

    let quantity = bill.quantity;
    if (recalculate) {
      const { error: qtyError, quantity: resolved } = resolveQuantity(order);
      if (qtyError) {
        return res.status(400).json({ success: false, message: qtyError });
      }
      quantity = resolved;
    }

    let rate = bill.rate;
    if (overrideRate !== undefined) {
      const { error: rateError, rate: resolved } = await resolveRate(order, overrideRate);
      if (rateError) {
        return res.status(400).json({ success: false, message: rateError });
      }
      rate = resolved;
    }

    const updated = await db.bill.update({
      where: { id: bill.id },
      data: {
        quantity,
        rate,
        amount: quantity * rate,
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      },
    });

    await createActivityLog({
      title: "Bill updated",
      description: `Bill ${billNo} updated — ${quantity} × ${rate} = ${updated.amount}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Bill updated successfully: ${billNo}`);

    return res.status(200).json({
      success: true,
      message: "Bill updated successfully",
      data: await buildBillPayload(updated, order),
    });
  } catch (error) {
    logger.error("Error updating bill:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update bill",
      error: error.message,
    });
  }
};

/**
 * Update a bill's status (PENDING / SENT / PAID / OVERDUE / CANCELLED)
 */
export const updateBillStatus = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, updateBillStatusValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { billNo, status } = req.body;

    logger.info(`Updating bill status: ${billNo} -> ${status}`);

    const bill = await db.bill.findFirst({ where: { billNo, isDeleted: false } });

    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }

    const updated = await db.bill.update({
      where: { id: bill.id },
      data: {
        status,
        // Stamp paidAt the first time it is marked PAID; clear it if the bill
        // moves back out of PAID.
        ...(status === "PAID" && !bill.paidAt && { paidAt: new Date() }),
        ...(status !== "PAID" && bill.paidAt && { paidAt: null }),
      },
    });

    const order = await db.order.findFirst({ where: { id: bill.orderId } });

    // Tell the client their bill is ready / settled.
    if (["SENT", "PAID", "OVERDUE"].includes(status) && order) {
      await sendNotification({
        targetType: "CLIENT",
        targetId: order.clientId,
        title: `Bill ${status === "SENT" ? "Received" : status === "PAID" ? "Paid" : "Overdue"}`,
        message: `Bill ${billNo} for order ${order.orderId} is ${status.toLowerCase()}`,
        type: "STATUS_UPDATED",
        relatedId: order.id,
        orderId: order.id,
      });
    }

    await createActivityLog({
      title: "Bill status updated",
      description: `Bill ${billNo} marked ${status}`,
      entityType: "ORDER",
      entityId: bill.orderId,
      action: "STATUS_CHANGED",
      createdById: Number(req.user?.data?.id) || null,
    });

    return res.status(200).json({
      success: true,
      message: "Bill status updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating bill status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update bill status",
      error: error.message,
    });
  }
};

/**
 * Delete a bill (soft)
 */
export const deleteBill = async (req, res) => {
  try {
    const { billNo } = req.params;

    logger.info(`Deleting bill: ${billNo}`);

    const bill = await db.bill.findFirst({ where: { billNo, isDeleted: false } });

    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }

    if (bill.status === "PAID") {
      return res.status(409).json({
        success: false,
        message: `Bill ${billNo} is PAID and cannot be deleted — cancel it instead`,
      });
    }

    await db.bill.update({ where: { id: bill.id }, data: { isDeleted: true } });

    await createActivityLog({
      title: "Bill deleted",
      description: `Bill ${billNo} deleted`,
      entityType: "ORDER",
      entityId: bill.orderId,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Bill deleted successfully: ${billNo}`);

    return res.status(200).json({ success: true, message: "Bill deleted successfully" });
  } catch (error) {
    logger.error("Error deleting bill:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete bill",
      error: error.message,
    });
  }
};


/**
 * Attach a challan (PDF/photo) to one of the bill's TMs.
 *
 * Challans are collected when the bill is reviewed, against each TM listed on
 * the bill detail page.
 */
export const uploadTmChallan = async (req, res) => {
  try {
    const { billNo, tmId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const { error, statusCode, tm } = await resolveBillTm(billNo, tmId);
    if (error) {
      return res.status(statusCode).json({ success: false, message: error });
    }

    const challanUrl = getChallanPublicUrl(billNo, req.file.filename);

    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: { challanUrl },
    });

    await createActivityLog({
      title: "Challan uploaded",
      description: `Challan uploaded for ${tm.tmNumber} (${tm.truckNo}) on bill ${billNo}`,
      entityType: "ORDER",
      entityId: tm.orderId,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Challan uploaded for TM ${tmId} on ${billNo}: ${challanUrl}`);

    return res.status(200).json({
      success: true,
      message: "Challan uploaded successfully",
      data: updated,
    });
  } catch (error) {
    logger.error("Error uploading challan:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload challan",
      error: error.message,
    });
  }
};

/**
 * Accept or reject one of the bill's TMs.
 *
 * Purely a record shown against the TM on the bill detail page — the billed
 * amount comes from the order's quantity and does not change when a TM is
 * rejected.
 */
export const updateTmApproval = async (req, res) => {
  try {
    const { billNo, tmId } = req.params;
    const { err, status: validationStatus } = await validatorFunction(
      { ...req.body, billNo, tmId },
      updateTmApprovalValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { approvalStatus, rejectionReason } = req.body;

    if (approvalStatus === "REJECTED" && !rejectionReason?.trim()) {
      return res.status(400).json({
        success: false,
        message: "rejectionReason is required when rejecting a TM",
      });
    }

    const { error, statusCode, tm } = await resolveBillTm(billNo, tmId);
    if (error) {
      return res.status(statusCode).json({ success: false, message: error });
    }

    logger.info(`Updating TM approval: ${tmId} -> ${approvalStatus}`);

    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: {
        approvalStatus,
        rejectionReason:
          approvalStatus === "REJECTED" ? rejectionReason.trim() : null,
        approvedAt: approvalStatus === "ACCEPTED" ? new Date() : null,
      },
    });

    await createActivityLog({
      title: `TM ${approvalStatus.toLowerCase()}`,
      description:
        approvalStatus === "REJECTED"
          ? `${tm.tmNumber} (${tm.truckNo}) rejected on bill ${billNo} — ${rejectionReason.trim()}`
          : `${tm.tmNumber} (${tm.truckNo}) ${approvalStatus.toLowerCase()} on bill ${billNo}`,
      entityType: "ORDER",
      entityId: tm.orderId,
      action: "STATUS_CHANGED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`TM approval updated successfully: ${tmId}`);

    return res.status(200).json({
      success: true,
      message: `TM ${approvalStatus.toLowerCase()} successfully`,
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating TM approval:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update TM approval",
      error: error.message,
    });
  }
};
