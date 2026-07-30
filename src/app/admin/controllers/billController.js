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

// Bills are locked once money has moved or the bill is void.
const LOCKED_BILL_STATUSES = ["PAID", "CANCELLED"];

/**
 * TmDetail.qty is free text ("6", "6 m3"), so a bill's quantity depends on
 * parsing it. Anything we cannot read as a positive number is rejected rather
 * than coerced to 0 — silently under-billing is worse than refusing to bill.
 */
function parseQty(raw) {
  const value = parseFloat(String(raw ?? "").trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Sum the accepted TM quantities on an order.
 * Returns { error } naming the offending TM when a quantity is unreadable.
 */
function sumAcceptedQty(tmDetails) {
  const accepted = tmDetails.filter((tm) => tm.approvalStatus === "ACCEPTED");

  if (!accepted.length) {
    return { error: "Order has no accepted TM details to bill" };
  }

  let total = 0;
  for (const tm of accepted) {
    const qty = parseQty(tm.qty);
    if (qty === null) {
      return { error: `Cannot read quantity "${tm.qty}" on ${tm.tmNumber}` };
    }
    total += qty;
  }

  return { total, accepted };
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
 * Generate a bill for an order from its accepted TM details
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

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
      include: buildBillOrderInclude(),
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const existing = await db.bill.findFirst({
      where: { orderId: order.id, isDeleted: false },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Order already has bill ${existing.billNo}`,
      });
    }

    const { error: qtyError, total } = sumAcceptedQty(order.tmDetails);
    if (qtyError) {
      return res.status(400).json({ success: false, message: qtyError });
    }

    const { error: rateError, rate } = await resolveRate(order, overrideRate);
    if (rateError) {
      return res.status(400).json({ success: false, message: rateError });
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
        quantity: total,
        rate,
        amount: total * rate,
        status: "PENDING",
        issueDate: new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    await createActivityLog({
      title: "Bill generated",
      description: `Bill ${billNo} generated for order ${orderId} — ${total} × ${rate} = ${bill.amount}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Bill generated successfully: ${billNo}`);

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
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      db.bill.count({ where }),
    ]);

    return res.status(200).json({ success: true, data: bills, total, page: pageNum });
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
      const { error: qtyError, total } = sumAcceptedQty(order.tmDetails);
      if (qtyError) {
        return res.status(400).json({ success: false, message: qtyError });
      }
      quantity = total;
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
      await db.notification.create({
        data: {
          targetType: "CLIENT",
          targetId: order.clientId,
          title: `Bill ${status === "SENT" ? "Received" : status === "PAID" ? "Paid" : "Overdue"}`,
          message: `Bill ${billNo} for order ${order.orderId} is ${status.toLowerCase()}`,
          type: "STATUS_UPDATED",
          relatedId: order.id,
          orderId: order.id,
        },
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
 * Accept or reject a TM detail. Only accepted TMs are billed.
 */
export const updateTmApproval = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, updateTmApprovalValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { orderId, tmId, approvalStatus, rejectionReason } = req.body;

    if (approvalStatus === "REJECTED" && !rejectionReason?.trim()) {
      return res.status(400).json({
        success: false,
        message: "rejectionReason is required when rejecting a TM",
      });
    }

    logger.info(`Updating TM approval: ${tmId} -> ${approvalStatus}`);

    const order = await db.order.findFirst({ where: { orderId, isDeleted: false } });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const tm = await db.tmDetail.findFirst({
      where: { id: tmId, orderId: order.id, isDeleted: false },
    });

    if (!tm) {
      return res.status(404).json({ success: false, message: "TM detail not found" });
    }

    // An issued bill was calculated from the TMs as they were; changing an
    // approval afterwards would silently desync the amount.
    const bill = await db.bill.findFirst({ where: { orderId: order.id, isDeleted: false } });
    if (bill && LOCKED_BILL_STATUSES.includes(bill.status)) {
      return res.status(409).json({
        success: false,
        message: `Bill ${bill.billNo} is ${bill.status} — TM approvals can no longer be changed`,
      });
    }

    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: {
        approvalStatus,
        rejectionReason: approvalStatus === "REJECTED" ? rejectionReason.trim() : null,
        approvedAt: approvalStatus === "ACCEPTED" ? new Date() : null,
      },
    });

    await createActivityLog({
      title: `TM ${approvalStatus.toLowerCase()}`,
      description:
        approvalStatus === "REJECTED"
          ? `${tm.tmNumber} (${tm.truckNo}) rejected on order ${orderId} — ${rejectionReason.trim()}`
          : `${tm.tmNumber} (${tm.truckNo}) ${approvalStatus.toLowerCase()} on order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "STATUS_CHANGED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`TM approval updated successfully: ${tmId}`);

    return res.status(200).json({
      success: true,
      message: `TM ${approvalStatus.toLowerCase()} successfully`,
      data: updated,
      ...(bill && {
        billWarning: `Bill ${bill.billNo} was generated before this change — recalculate it to pick up the new quantity`,
      }),
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
