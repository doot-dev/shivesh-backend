import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import { sendNotification } from '../../../helper/notificationHelper.js';
import {
  getCubeTestPublicUrl,
  deleteCubeTestFile,
} from '../../../config/cubeTestUploadConfig.js';

/**
 * Cube testing reports as seen by the FIELD TECHNICIAN app.
 *
 * This is deliberately a separate controller from admin/cubeTestController.js
 * even though the table is the same: every function here resolves the order
 * through `assignedOrder()`, so a technician can only read or write cube tests
 * on orders they are actually assigned to. The admin controller intentionally
 * has no such restriction, and reusing it on a mobile route would hand any
 * authenticated technician the entire cube-test table.
 */

const PERIOD_DAYS = {
  SEVEN_DAYS: 7,
  FOURTEEN_DAYS: 14,
  TWENTYONE_DAYS: 21,
};

const VALID_PERIODS = [...Object.keys(PERIOD_DAYS), 'CUSTOM'];

/**
 * Resolve `toDate` from the casting date + period — same rule as the admin side:
 * standard periods are a SCHEDULED future test date, CUSTOM is a backdated
 * record of a test that already happened and so may not be in the future.
 */
function resolveToDate(period, castingDate, customDate) {
  if (period === 'CUSTOM') {
    if (!customDate) {
      return { error: 'customDate is required when period is CUSTOM' };
    }
    const custom = new Date(customDate);
    if (Number.isNaN(custom.getTime())) {
      return { error: 'customDate is not a valid date' };
    }
    if (custom.getTime() > Date.now()) {
      return { error: 'Custom date cannot be a future date' };
    }
    return { toDate: custom };
  }

  const toDate = new Date(castingDate);
  toDate.setDate(toDate.getDate() + PERIOD_DAYS[period]);
  return { toDate };
}

/**
 * The order, ONLY if this technician is assigned to it. Returns null otherwise,
 * which every caller turns into a 404 — the same answer as a genuinely missing
 * order, so this cannot be used to probe which orders exist.
 */
function assignedOrder(orderId, userId) {
  return db.order.findFirst({
    where: {
      orderId,
      isDeleted: false,
      technicians: { some: { userId, isDeleted: false } },
    },
  });
}

const DEV_TECH_ID = 'dev-tech';

// ─── List cube tests for an assigned order ────────────────────────────────────

export async function listCubeTests(req, res) {
  try {
    const { orderId } = req.params;
    const userId = req.user.data.id;

    // DEV BYPASS — remove before production
    if (userId === DEV_TECH_ID) {
      return res.status(200).json({ success: true, data: [] });
    }

    const order = await assignedOrder(orderId, userId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const cubeTests = await db.cubeTest.findMany({
      where: { orderId: order.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ success: true, data: cubeTests });
  } catch (error) {
    logger.error('tech listCubeTests error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Create a cube test ───────────────────────────────────────────────────────

/**
 * Log a cube test against an assigned order.
 *
 * Accepts multipart/form-data so the result image/PDF rides along in the same
 * request (field name `file`, wired by uploadSingleCubeTestFile). The file is
 * optional — a technician commonly records the casting first and attaches the
 * result sheet days later via update.
 */
export async function createCubeTest(req, res) {
  try {
    const { orderId } = req.params;
    const userId = req.user.data.id;
    const { castingDate, quantity, period, customDate } = req.body;

    if (!castingDate || !quantity || !period) {
      return res.status(400).json({
        success: false,
        message: 'castingDate, quantity and period are required',
      });
    }

    if (!VALID_PERIODS.includes(period)) {
      return res.status(422).json({
        success: false,
        message: `period must be one of ${VALID_PERIODS.join(', ')}`,
      });
    }

    const casting = new Date(castingDate);
    if (Number.isNaN(casting.getTime())) {
      return res.status(422).json({ success: false, message: 'castingDate is not a valid date' });
    }

    const order = await assignedOrder(orderId, userId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const { error, toDate } = resolveToDate(period, casting, customDate);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const fileUrl = req.file ? getCubeTestPublicUrl(orderId, req.file.filename) : null;

    const cubeTest = await db.cubeTest.create({
      data: {
        orderId: order.id,
        castingDate: casting,
        quantity: String(quantity),
        period,
        fromDate: casting,
        toDate,
        fileUrl,
      },
    });

    // The client is the party waiting on cube results, so tell them a test was logged.
    await sendNotification({
      targetType: 'CLIENT',
      targetId: order.clientId,
      title: 'Cube Test Added',
      message: `A cube test was logged for order ${orderId}, testing on ${toDate.toDateString()}`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    });

    logger.info(`Cube test ${cubeTest.id} created on ${orderId} by tech ${userId}`);

    return res.status(201).json({
      success: true,
      message: 'Cube test created successfully',
      data: cubeTest,
    });
  } catch (error) {
    logger.error('tech createCubeTest error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Update a cube test ───────────────────────────────────────────────────────

/**
 * Update a cube test. Every field is optional — send only what changes.
 * A new file replaces the old one on disk so uploads cannot accumulate.
 */
export async function updateCubeTest(req, res) {
  try {
    const { orderId, cubeTestId } = req.params;
    const userId = req.user.data.id;
    const { castingDate, quantity, period, customDate } = req.body;

    if (period && !VALID_PERIODS.includes(period)) {
      return res.status(422).json({
        success: false,
        message: `period must be one of ${VALID_PERIODS.join(', ')}`,
      });
    }

    const order = await assignedOrder(orderId, userId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const existing = await db.cubeTest.findFirst({
      where: { id: cubeTestId, orderId: order.id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Cube test not found' });
    }

    const nextPeriod = period || existing.period;
    const nextCastingDate = castingDate ? new Date(castingDate) : existing.castingDate;

    if (Number.isNaN(new Date(nextCastingDate).getTime())) {
      return res.status(422).json({ success: false, message: 'castingDate is not a valid date' });
    }

    let nextToDate = existing.toDate;
    if (nextPeriod === 'CUSTOM') {
      if (customDate) {
        const { error, toDate } = resolveToDate('CUSTOM', nextCastingDate, customDate);
        if (error) return res.status(400).json({ success: false, message: error });
        nextToDate = toDate;
      } else if (existing.period !== 'CUSTOM') {
        return res.status(422).json({
          success: false,
          message: 'customDate is required when period is CUSTOM',
        });
      }
    } else if (period || castingDate) {
      const { toDate } = resolveToDate(nextPeriod, nextCastingDate, customDate);
      nextToDate = toDate;
    }

    let fileUrl = existing.fileUrl;
    if (req.file) {
      if (existing.fileUrl) {
        deleteCubeTestFile(orderId, existing.fileUrl.split('/').pop());
      }
      fileUrl = getCubeTestPublicUrl(orderId, req.file.filename);
    }

    const updated = await db.cubeTest.update({
      where: { id: cubeTestId },
      data: {
        ...(castingDate && { castingDate: nextCastingDate }),
        ...(quantity && { quantity: String(quantity) }),
        ...(period && { period }),
        fromDate: nextCastingDate,
        toDate: nextToDate,
        fileUrl,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Cube test updated successfully',
      data: updated,
    });
  } catch (error) {
    logger.error('tech updateCubeTest error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Delete a cube test (soft) ────────────────────────────────────────────────

export async function deleteCubeTest(req, res) {
  try {
    const { orderId, cubeTestId } = req.params;
    const userId = req.user.data.id;

    const order = await assignedOrder(orderId, userId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const existing = await db.cubeTest.findFirst({
      where: { id: cubeTestId, orderId: order.id, isDeleted: false },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Cube test not found' });
    }

    await db.cubeTest.update({
      where: { id: cubeTestId },
      data: { isDeleted: true },
    });

    return res.status(200).json({ success: true, message: 'Cube test deleted successfully' });
  } catch (error) {
    logger.error('tech deleteCubeTest error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
