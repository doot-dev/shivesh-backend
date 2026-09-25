import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { validatorFunction } from "../../../helper/validate.js";
import {
  createCubeTestValidation,
  updateCubeTestValidation,
} from "../validations/cubeTestValidation.js";
import { createActivityLog } from "../../../helper/activityLogger.js";
import { sendNotification } from "../../../helper/notificationHelper.js";
import { withStatus } from "../../../helper/cubeTest.js";
import { dateTimeDayRange } from "../../../helper/dateRange.js";
import { saveCubeTest, removeAttachment, uploadedFiles, WITH_ATTACHMENTS } from "../../../helper/cubeTestStore.js";

async function resolveOrder(orderId) {
  return db.order.findFirst({ where: { orderId, isDeleted: false } });
}

/** The panel user behind the request, for "added by" on tests and files. */
async function panelActor(req) {
  const id = Number(req.user?.data?.id) || null;
  const user = id ? await db.user.findUnique({ where: { id }, select: { name: true } }) : null;
  return { type: "USER", id, name: user?.name ?? req.user?.data?.userName ?? null };
}

/**
 * Create a cube test against an order. Accepts multipart/form-data so the
 * result image/PDF can be attached in the same request; the file field is
 * optional (`file`) and can be added later via update.
 */
export const createCubeTest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { err, status: validationStatus } = await validatorFunction(
      { ...req.body, orderId },
      createCubeTestValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const order = await resolveOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const files = uploadedFiles(req);
    const r = await saveCubeTest({ order, body: req.body, files, actor: await panelActor(req) });
    if (r.status) return res.status(r.status).json({ success: false, message: r.message });
    const { cubeTest } = r;
    const { toDate } = cubeTest;
    const quantity = cubeTest.quantity;

    await createActivityLog({
      title: "Cube test added",
      description: `Cube test added for order ${orderId} — ${quantity}, testing on ${toDate.toDateString()}${files.length ? `, ${files.length} file(s) attached` : ""}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    await sendNotification({
      targetType: "CLIENT",
      targetId: order.clientId,
      title: files.length ? "Cube test result added" : "Cube Test Added",
      message: `A cube test was logged for order ${orderId}, testing on ${toDate.toDateString()}`,
      type: "STATUS_UPDATED",
      relatedId: order.id,
      orderId: order.id,
    });

    return res.status(201).json({
      success: true,
      message: "Cube test created successfully",
      data: cubeTest,
    });
  } catch (error) {
    logger.error("Error creating cube test:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create cube test",
      error: error.message,
    });
  }
};

/** List every cube test logged against an order. */
export const getCubeTests = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await resolveOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const cubeTests = await db.cubeTest.findMany({
      where: { orderId: order.id, isDeleted: false },
      include: WITH_ATTACHMENTS,
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ success: true, data: cubeTests.map(withStatus) });
  } catch (error) {
    logger.error("Error fetching cube tests:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cube tests",
      error: error.message,
    });
  }
};

/** Fetch a single cube test. */
export const getCubeTest = async (req, res) => {
  try {
    const { orderId, cubeTestId } = req.params;

    const order = await resolveOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const cubeTest = await db.cubeTest.findFirst({
      where: { id: cubeTestId, orderId: order.id, isDeleted: false },
      include: WITH_ATTACHMENTS,
    });

    if (!cubeTest) {
      return res.status(404).json({ success: false, message: "Cube test not found" });
    }

    return res.status(200).json({ success: true, data: withStatus(cubeTest) });
  } catch (error) {
    logger.error("Error fetching cube test:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cube test",
      error: error.message,
    });
  }
};

/**
 * Update a cube test. Every field is optional — send only what changes.
 * Changing `period` away from CUSTOM recomputes `toDate` from the casting
 * date; changing it to CUSTOM requires `customDate`. A new file replaces the
 * old one on disk.
 */
export const updateCubeTest = async (req, res) => {
  try {
    const { orderId, cubeTestId } = req.params;
    const { err, status: validationStatus } = await validatorFunction(
      { ...req.body, orderId, cubeTestId },
      updateCubeTestValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const order = await resolveOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const existing = await db.cubeTest.findFirst({
      where: { id: cubeTestId, orderId: order.id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Cube test not found" });
    }

    const r = await saveCubeTest({ order, existing, body: req.body, files: uploadedFiles(req), actor: await panelActor(req) });
    if (r.status) return res.status(r.status).json({ success: false, message: r.message });
    const updated = r.cubeTest;

    await createActivityLog({
      title: "Cube test updated",
      description: `Cube test updated on order ${orderId}${r.added ? `, ${r.added} file(s) attached` : ""}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    if (r.resultAdded) {
      await sendNotification({
        targetType: "CLIENT",
        targetId: order.clientId,
        title: "Cube test result added",
        message: `The cube test result for order ${orderId} is ready`,
        type: "STATUS_UPDATED",
        relatedId: order.id,
        orderId: order.id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cube test updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating cube test:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update cube test",
      error: error.message,
    });
  }
};

/** Soft-delete a cube test. */
export const deleteCubeTest = async (req, res) => {
  try {
    const { orderId, cubeTestId } = req.params;

    const order = await resolveOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const existing = await db.cubeTest.findFirst({
      where: { id: cubeTestId, orderId: order.id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Cube test not found" });
    }

    await db.cubeTest.update({
      where: { id: cubeTestId },
      data: { isDeleted: true },
    });

    await createActivityLog({
      title: "Cube test deleted",
      description: `Cube test deleted on order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    return res.status(200).json({ success: true, message: "Cube test deleted successfully" });
  } catch (error) {
    logger.error("Error deleting cube test:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete cube test",
      error: error.message,
    });
  }
};

/** DELETE /:orderId/cube-test/:cubeTestId/attachments/:attachmentId — any file (soft). */
export const deleteAttachment = async (req, res) => {
  try {
    const { orderId, cubeTestId, attachmentId } = req.params;
    const order = await resolveOrder(orderId);
    const existing = order && await db.cubeTest.findFirst({ where: { id: cubeTestId, orderId: order.id, isDeleted: false } });
    if (!existing) return res.status(404).json({ success: false, message: "Cube test not found" });

    const r = await removeAttachment({ cubeTestId, attachmentId });
    if (r.status) return res.status(r.status).json({ success: false, message: r.message });

    await createActivityLog({
      title: "Cube test file removed",
      description: `Removed ${r.removed.fileName || "a file"} from a cube test on order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });
    return res.status(200).json({ success: true, message: "Attachment removed", data: r.cubeTest });
  } catch (error) {
    logger.error("Error removing cube test attachment:", error);
    return res.status(500).json({ success: false, message: "Failed to remove attachment" });
  }
};

/**
 * GET /orders/cube-tests?dateFrom=&dateTo= — all cube tests whose TEST date
 * falls in the window (what the lab needs to plan for), with their order.
 */
export async function listAllCubeTests(req, res) {
  try {
    const due = dateTimeDayRange(req.query.dateFrom, req.query.dateTo);
    const rows = await db.cubeTest.findMany({
      where: { isDeleted: false, order: { isDeleted: false }, ...(due && { toDate: due }) },
      include: {
        ...WITH_ATTACHMENTS,
        order: { select: { orderId: true, productName: true, productGrade: true, status: true, date: true,
          client: { select: { companyName: true } }, project: { select: { projectName: true } } } },
      },
      orderBy: { toDate: "asc" },
      take: 1000,
    });
    const data = rows.map(({ order, ...ct }) => ({
      ...withStatus(ct),
      orderCode: order.orderId,
      clientName: order.client?.companyName || "—",
      projectName: order.project?.projectName || "—",
      productName: order.productName,
      productGrade: order.productGrade,
    }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error("admin listAllCubeTests error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}
