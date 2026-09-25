import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { validatorFunction } from "../../../helper/validate.js";
import {
  createCubeTestValidation,
  updateCubeTestValidation,
} from "../validations/cubeTestValidation.js";
import { createActivityLog } from "../../../helper/activityLogger.js";
import { sendNotification } from "../../../helper/notificationHelper.js";
import { resolveToDate, withStatus } from "../../../helper/cubeTest.js";
import { productByName } from "../../../helper/productUnits.js";
import {
  getCubeTestPublicUrl,
  deleteCubeTestFile,
} from "../../../config/cubeTestUploadConfig.js";

async function resolveOrder(orderId) {
  return db.order.findFirst({ where: { orderId, isDeleted: false } });
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

    const { castingDate, quantity, period, customDate } = req.body;

    const order = await resolveOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // W38: cube tests only make sense for concrete.
    if ((await productByName(order.productName))?.isConcrete === false) {
      return res.status(400).json({ success: false, message: "Cube tests apply only to concrete products" });
    }

    const { error, toDate } = resolveToDate(period, castingDate, customDate, order);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const fromDate = new Date(castingDate);
    const fileUrl = req.file ? getCubeTestPublicUrl(orderId, req.file.filename) : null;

    const cubeTest = await db.cubeTest.create({
      data: {
        orderId: order.id,
        castingDate: fromDate,
        quantity,
        period,
        fromDate,
        toDate,
        fileUrl,
      },
    });

    await createActivityLog({
      title: "Cube test added",
      description: `Cube test added for order ${orderId} — ${quantity}, testing on ${toDate.toDateString()}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    await sendNotification({
      targetType: "CLIENT",
      targetId: order.clientId,
      title: cubeTest.fileUrl ? "Cube test result added" : "Cube Test Added",
      message: `A cube test was logged for order ${orderId}, testing on ${toDate.toDateString()}`,
      type: "STATUS_UPDATED",
      relatedId: order.id,
      orderId: order.id,
    });

    return res.status(201).json({
      success: true,
      message: "Cube test created successfully",
      data: withStatus(cubeTest),
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

    const { castingDate, quantity, period, customDate } = req.body;

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

    const nextPeriod = period || existing.period;
    const nextCastingDate = castingDate ? new Date(castingDate) : existing.castingDate;

    let nextToDate = existing.toDate;
    if (nextPeriod === "CUSTOM") {
      if (customDate) {
        const { error, toDate } = resolveToDate("CUSTOM", nextCastingDate, customDate, order);
        if (error) {
          return res.status(400).json({ success: false, message: error });
        }
        nextToDate = toDate;
      } else if (existing.period !== "CUSTOM") {
        return res.status(422).json({
          success: false,
          message: "Validation failed",
          errors: { customDate: ["The custom date field is required when period is CUSTOM."] },
        });
      }
    } else if (period || castingDate) {
      // Period changed to a standard one, or casting date moved — recompute.
      const { error, toDate } = resolveToDate(nextPeriod, nextCastingDate, customDate, order);
      if (error) return res.status(400).json({ success: false, message: error });
      nextToDate = toDate;
    }

    let fileUrl = existing.fileUrl;
    if (req.file) {
      if (existing.fileUrl) {
        deleteCubeTestFile(orderId, existing.fileUrl.split("/").pop());
      }
      fileUrl = getCubeTestPublicUrl(orderId, req.file.filename);
    }

    const updated = await db.cubeTest.update({
      where: { id: cubeTestId },
      data: {
        ...(castingDate && { castingDate: nextCastingDate }),
        ...(quantity && { quantity }),
        ...(period && { period }),
        fromDate: nextCastingDate,
        toDate: nextToDate,
        fileUrl,
      },
    });

    await createActivityLog({
      title: "Cube test updated",
      description: `Cube test updated on order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    return res.status(200).json({
      success: true,
      message: "Cube test updated successfully",
      data: withStatus(updated),
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
