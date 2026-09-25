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
import { getChallanPublicUrl, getOrderChallanPublicUrl } from "../../../config/challanUploadConfig.js";
import { billIfReady } from "../../../helper/orderCompletion.js";
import { rejectIfLocked } from "../../../helper/updateWindow.js";
import { productByName } from "../../../helper/productUnits.js";
import { buildInvoicePdf } from "../../../helper/invoicePdf.js";

/**
 * Resolve a bill and one of its order's TMs together.
 *
 * TM review happens against a generated bill, so both endpoints below address a
 * TM through its billNo rather than its order.
 */
/**
 * Resolve a TM from either route: /bills/:billNo/tm/:tmId (legacy, needs a bill)
 * or /orders/:orderId/tm/:tmId (W11 — review before any bill exists).
 * Returns { tm, orderCode } or { error, statusCode }.
 */
async function resolveTm({ billNo, orderId, tmId }) {
  if (billNo) {
    const r = await resolveBillTm(billNo, tmId);
    if (r.error) return r;
    const order = await db.order.findFirst({ where: { id: r.tm.orderId } });
    return { tm: r.tm, order, orderCode: order.orderId };
  }
  const order = await db.order.findFirst({ where: { orderId, isDeleted: false } });
  if (!order) return { error: "Order not found", statusCode: 404 };
  const tm = await db.tmDetail.findFirst({ where: { id: tmId, orderId: order.id, isDeleted: false } });
  if (!tm) return { error: "TM detail not found on this order", statusCode: 404 };
  return { tm, order, orderCode: order.orderId };
}

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

/**
 * Why a bill may not move from `from` to `to`, or null if it may.
 * Exported for scripts/verify_bill_status_rules.mjs.
 */
export function billStatusChangeBlocked(from, to, access) {
  if (from === to) return null;
  if (from === "CANCELLED") return "a cancelled bill is final";
  if (from === "PAID") return "a paid bill cannot move back";
  if (to === "CANCELLED" && !access?.isSuperAdmin) return "only the Super Admin can cancel a bill";
  return null;
}

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

/** Same include the invoice PDF uses — shared with the client-app invoice download. */
export const invoiceOrderInclude = () => buildBillOrderInclude();

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
    // Shown on the bill page. Auto-bills use the accepted truck total (D4).
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
      rejectedByType: tm.rejectedByType,
      rejectedAt: tm.rejectedAt,
    })),
    // W21: payments received against this bill, and what is still pending.
    payments: await (async () => {
      const allocs = await db.paymentAllocation.findMany({
        where: { billId: bill.id, isReversed: false },
        orderBy: { createdAt: "asc" },
        include: { payment: { select: { id: true, receiptNo: true, receivedOn: true, mode: true, reference: true } } },
      });
      const paid = Math.round(allocs.reduce((s, a) => s + a.amount, 0) * 100) / 100;
      return { paid, pending: Math.round((bill.amount - paid) * 100) / 100, rows: allocs.map((a) => ({ ...a.payment, amount: a.amount })) };
    })(),
    // P1.13 / G10: ordered vs delivered vs accepted vs billed, side by side.
    quantities: (() => {
      const q = (v) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };
      const live = order.tmDetails.filter((tm) => tm.approvalStatus !== "REJECTED");
      const r3 = (n) => Math.round(n * 1000) / 1000;
      return {
        ordered: q(order.quantity),
        delivered: r3(live.reduce((s, tm) => s + q(tm.qty), 0)),
        accepted: r3(order.tmDetails.filter((tm) => tm.approvalStatus === "ACCEPTED").reduce((s, tm) => s + q(tm.qty), 0)),
        billed: bill.quantity,
      };
    })(),
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
  { rate: overrideRate, dueDate, createdById, quantity: overrideQuantity } = {},
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

  // billIfReady passes the accepted truck total (D4); the manual endpoint falls
  // back to the ordered quantity.
  const { error: qtyError, quantity } = overrideQuantity
    ? { quantity: overrideQuantity }
    : resolveQuantity(order);
  if (qtyError) {
    return { error: qtyError, statusCode: 400 };
  }

  // W2: the rate frozen on the order at booking wins over today's price list.
  const { error: rateError, rate } = await resolveRate(order, overrideRate ?? order.rate ?? undefined);
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
      // P2.7 / D11: due = bill date + the client's credit days (M), unless given.
      dueDate: dueDate ? new Date(dueDate) : await defaultDueDate(order.clientId),
    },
  });

  await createActivityLog({
    event: "BILL_GENERATED",
    billId: bill.id,
    orderRef: orderId,
    after: { billNo, quantity, rate, amount: bill.amount, dueDate: bill.dueDate },
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

/** issue date + client credit days (null when the client has no credit period). */
async function defaultDueDate(clientDbId) {
  const client = await db.client.findUnique({ where: { id: clientDbId }, select: { creditDays: true } });
  if (!client?.creditDays) return null;
  const d = new Date();
  d.setDate(d.getDate() + client.creditDays);
  return d;
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
    const { page = 1, limit = 20, status, clientId, search, dateFrom, dateTo } = req.query;
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const where = {
      isDeleted: false,
      ...(status && { status }),
      ...(clientId && { order: { client: { clientId } } }),
      // G16: server-side invoice-date range (IST, inclusive).
      ...((iso.test(dateFrom || "") || iso.test(dateTo || "")) && {
        issueDate: {
          ...(iso.test(dateFrom || "") && { gte: new Date(`${dateFrom}T00:00:00`) }),
          ...(iso.test(dateTo || "") && { lte: new Date(`${dateTo}T23:59:59.999`) }),
        },
      }),
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
          allocations: { where: { isReversed: false }, select: { amount: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      db.bill.count({ where }),
    ]);
    const sums = await db.bill.aggregate({ where, _sum: { amount: true, quantity: true } });

    const now = new Date();
    const data = bills.map(({ allocations, ...bill }) => ({
      ...bill,
      paid: Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100,
      balance: Math.round((bill.amount - allocations.reduce((s, a) => s + a.amount, 0)) * 100) / 100,
      orderId: bill.order.orderId,
      assignedTrucks: bill.order._count.tmDetails,
      // G18: computed "Overdue · N days" — nothing flips the stored status.
      daysOverdue:
        ["PENDING", "SENT", "OVERDUE", "PARTIALLY_PAID"].includes(bill.status) && bill.dueDate && new Date(bill.dueDate) < now
          ? Math.floor((now - new Date(bill.dueDate)) / 864e5)
          : 0,
    }));

    return res.status(200).json({
      success: true,
      data,
      total,
      page: pageNum,
      totals: { amount: sums._sum.amount || 0, quantity: sums._sum.quantity || 0 },
    });
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
 * Stream the invoice PDF for a bill: invoice page + the attached bill document
 * and every non-rejected TM challan appended as pages. Built fresh each time so
 * it always reflects the latest approvals and uploads.
 */
export const downloadInvoice = async (req, res) => {
  try {
    const { billNo } = req.params;

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

    order.unit = (await productByName(order.productName))?.unit; // W38
    const pdf = await buildInvoicePdf(bill, order);

    await createActivityLog({
      title: "Invoice downloaded",
      description: `Invoice PDF for bill ${billNo} generated/downloaded`,
      entityType: "ORDER",
      entityId: bill.orderId,
      action: "LOGGED",
      createdById: Number(req.user?.data?.id) || null,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Invoice-${bill.billNo}.pdf"`);
    return res.status(200).send(Buffer.from(pdf));
  } catch (error) {
    logger.error("Error generating invoice:", error);
    return res.status(500).json({ success: false, message: "Failed to generate invoice", error: error.message });
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
      entityType: "ORDER",
      entityId: bill.orderId,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
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

    // W21: paid / part-paid come only from recorded payments, never by hand.
    if (["PAID", "PARTIALLY_PAID"].includes(status) && bill.status !== status) {
      return res.status(409).json({ success: false, message: "Record a payment against the bill — its status updates by itself" });
    }

    // G4 / D5: an issued bill must not quietly unlock. CANCELLED is final, a
    // PAID bill never moves back, and only the Super Admin may cancel.
    const blocked = billStatusChangeBlocked(bill.status, status, req.access);
    if (blocked) {
      return res.status(409).json({ success: false, message: `Bill ${billNo}: ${blocked}` });
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

    // Only a draft can be deleted. Once sent, a bill is cancelled with a reason
    // (Super Admin) so its number is never silently lost (G4, G13).
    if (bill.status !== "PENDING") {
      return res.status(409).json({
        success: false,
        message: `Bill ${billNo} is ${bill.status} and cannot be deleted — cancel it instead`,
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

    const { error, statusCode, tm, order, orderCode } = await resolveTm(req.params);
    if (error) {
      return res.status(statusCode).json({ success: false, message: error });
    }
    if (await rejectIfLocked(order, req, res)) return;

    const challanUrl = billNo
      ? getChallanPublicUrl(billNo, req.file.filename)
      : getOrderChallanPublicUrl(orderCode, req.file.filename);

    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: {
        challanUrl,
        // W13: pouring time (first challan), and the truck counts as delivered.
        ...(!tm.deliveredAt && { deliveredAt: new Date() }),
        ...(["ASSIGNED", "IN_TRANSIT", "REACHED"].includes(tm.status) && { status: "DELIVERED" }),
      },
    });

    await createActivityLog({
      title: "Challan uploaded",
      description: `Challan uploaded for ${tm.tmNumber} (${tm.truckNo}) on ${billNo ? `bill ${billNo}` : `order ${orderCode}`}`,
      entityType: "ORDER",
      entityId: tm.orderId,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Challan uploaded for TM ${tmId} on ${billNo || orderCode}: ${challanUrl}`);

    const billing = await billIfReady(orderCode, { createdById: Number(req.user?.data?.id) || null });

    return res.status(200).json({
      success: true,
      message: "Challan uploaded successfully",
      data: updated,
      ...(billing.bill && { bill: billing.bill }),
      ...(billing.pending && { billPending: billing.pending }),
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

    const { error, statusCode, tm, order, orderCode } = await resolveTm(req.params);
    if (error) {
      return res.status(statusCode).json({ success: false, message: error });
    }
    if (await rejectIfLocked(order, req, res)) return;

    logger.info(`Updating TM approval: ${tmId} -> ${approvalStatus}`);

    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: {
        approvalStatus,
        rejectionReason:
          approvalStatus === "REJECTED" ? rejectionReason.trim() : null,
        approvedAt: approvalStatus === "ACCEPTED" ? new Date() : null,
        // W32: staff rejecting (incl. on the client's behalf) is recorded as USER.
        ...(approvalStatus === "REJECTED"
          ? { rejectedAt: new Date(), rejectedByType: "USER", rejectedById: String(req.user?.data?.id ?? "") }
          : { rejectedAt: null, rejectedByType: null, rejectedById: null }),
      },
    });

    await createActivityLog({
      title: `TM ${approvalStatus.toLowerCase()}`,
      description:
        approvalStatus === "REJECTED"
          ? `${tm.tmNumber} (${tm.truckNo}) rejected on ${billNo || orderCode} — ${rejectionReason.trim()}`
          : `${tm.tmNumber} (${tm.truckNo}) ${approvalStatus.toLowerCase()} on ${billNo || orderCode}`,
      entityType: "ORDER",
      entityId: tm.orderId,
      action: "STATUS_CHANGED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`TM approval updated successfully: ${tmId}`);

    const billing = await billIfReady(orderCode, { createdById: Number(req.user?.data?.id) || null });

    return res.status(200).json({
      success: true,
      message: `TM ${approvalStatus.toLowerCase()} successfully`,
      data: updated,
      ...(billing.bill && { bill: billing.bill }),
      ...(billing.pending && { billPending: billing.pending }),
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
