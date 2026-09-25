import db from '../../../config/database.js';
import { orderProjectScope } from '../../../helper/clientAccess.js';
import logger from '../../../helper/logger.js';
import { sendNotification } from '../../../helper/notificationHelper.js';
import {
  getCubeTestPublicUrl,
  deleteCubeTestFile,
} from '../../../config/cubeTestUploadConfig.js';
import { resolveToDate, SELECTABLE_PERIODS, cubeTestStatus, withStatus } from '../../../helper/cubeTest.js';
import { productByName } from '../../../helper/productUnits.js';
import { createActivityLog } from '../../../helper/activityLogger.js';

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

// ─── Cross-order cube test feed ───────────────────────────────────────────────

/**
 * Shape one cube test row for the mobile "all cube tests" screens.
 *
 * Flattens the joined order/project/client down onto the row because the apps
 * render a flat card list — nesting would force every client to walk
 * `row.order.project.projectName` for a single label.
 */
function toFeedRow(ct) {
  return {
    id: ct.id,
    castingDate: ct.castingDate,
    quantity: ct.quantity,
    period: ct.period,
    fromDate: ct.fromDate,
    toDate: ct.toDate,
    fileUrl: ct.fileUrl,
    status: cubeTestStatus(ct),
    createdAt: ct.createdAt,
    orderId: ct.order?.orderId ?? null,
    productName: ct.order?.productName ?? null,
    productGrade: ct.order?.productGrade ?? null,
    projectName: ct.order?.project?.projectName ?? null,
    siteName: ct.order?.project?.siteName ?? null,
    clientName: ct.order?.client?.companyName ?? null,
  };
}

const FEED_INCLUDE = {
  order: {
    select: {
      orderId: true,
      productName: true,
      productGrade: true,
      project: { select: { projectName: true, siteName: true } },
      client: { select: { companyName: true } },
    },
  },
};

/**
 * Build the shared `where` for a cube test feed from the query string.
 *
 * `scope` is the caller's ownership filter (assigned-technician or own-client)
 * and is merged in by the caller — this helper only handles the user-supplied
 * filters, so it can never widen visibility on its own.
 *
 * Supported: `q` (order code / project / client / product, case-insensitive),
 * `dateFrom`/`dateTo` on the CASTING date, and `status` of
 * `due` (test date reached) or `upcoming` (still scheduled).
 */
function buildFeedFilters(query) {
  const { q, dateFrom, dateTo, status } = query;
  const where = { isDeleted: false };

  const text = typeof q === 'string' ? q.trim() : '';
  if (text) {
    where.order = {
      OR: [
        { orderId: { contains: text } },
        { productName: { contains: text } },
        { productGrade: { contains: text } },
        { project: { projectName: { contains: text } } },
        { project: { siteName: { contains: text } } },
        { client: { companyName: { contains: text } } },
      ],
    };
  }

  // Casting date range. An unparseable value is ignored rather than erroring,
  // matching how the order list endpoints already treat bad date input.
  const castingDate = {};
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!Number.isNaN(from.getTime())) castingDate.gte = from;
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (!Number.isNaN(to.getTime())) {
      // Inclusive of the whole end day — a bare yyyy-MM-dd parses to midnight,
      // which would otherwise exclude everything cast later that same day.
      to.setHours(23, 59, 59, 999);
      castingDate.lte = to;
    }
  }
  if (Object.keys(castingDate).length) where.castingDate = castingDate;

  // due = test date reached and no result yet; done = result attached (W36).
  if (status === 'due') { where.toDate = { lte: new Date() }; where.fileUrl = null; }
  else if (status === 'upcoming') where.toDate = { gt: new Date() };
  else if (status === 'done') where.fileUrl = { not: null };

  return where;
}

/**
 * Every cube test on the orders this TECHNICIAN is assigned to, newest first.
 *
 * This is the cross-order feed behind the app's "Cube Tests" tab — the
 * per-order list is `listCubeTests`. Ownership is enforced by the nested
 * `technicians.some` filter, NOT by the client-supplied query.
 */
export async function listAllCubeTests(req, res) {
  try {
    const userId = req.user.data.id;

    // DEV BYPASS — remove before production
    if (userId === DEV_TECH_ID) {
      return res.status(200).json({ success: true, data: [] });
    }

    const where = buildFeedFilters(req.query);
    where.order = {
      ...(where.order ?? {}),
      isDeleted: false,
      technicians: { some: { userId, isDeleted: false } },
    };

    const cubeTests = await db.cubeTest.findMany({
      where,
      include: FEED_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    return res.status(200).json({
      success: true,
      data: cubeTests.map(toFeedRow),
    });
  } catch (error) {
    logger.error('tech listAllCubeTests error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

/**
 * Every cube test on this CLIENT's own orders, newest first.
 *
 * Read-only by design: clients see results, technicians and admins log them.
 * Scoped by `order.clientId`, so the filters below can never reach another
 * client's rows.
 */
export async function clientListAllCubeTests(req, res) {
  try {
    const clientDbId = req.user.data.id;

    const where = buildFeedFilters(req.query);
    where.order = {
      ...(where.order ?? {}),
      isDeleted: false,
      clientId: clientDbId,
      ...orderProjectScope(req.clientAccess),
    };

    const cubeTests = await db.cubeTest.findMany({
      where,
      include: FEED_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    return res.status(200).json({
      success: true,
      data: cubeTests.map(toFeedRow),
    });
  } catch (error) {
    logger.error('client listAllCubeTests error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

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

    return res.status(200).json({ success: true, data: cubeTests.map(withStatus) });
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

    if (!SELECTABLE_PERIODS.includes(period)) {
      return res.status(422).json({
        success: false,
        message: `period must be one of ${SELECTABLE_PERIODS.join(', ')}`,
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

    // W38: cube tests only make sense for concrete.
    if ((await productByName(order.productName))?.isConcrete === false) {
      return res.status(400).json({ success: false, message: 'Cube tests apply only to concrete products' });
    }

    const { error, toDate } = resolveToDate(period, casting, customDate, order);
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

    await createActivityLog({
      title: 'Cube test added (field app)',
      description: `Cube test on ${orderId}: cast ${casting.toDateString()}, ${period}, testing ${toDate.toDateString()}${fileUrl ? ', result attached' : ''}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'CREATED',
      createdById: Number(userId),
    });
    logger.info(`Cube test ${cubeTest.id} created on ${orderId} by tech ${userId}`);

    return res.status(201).json({
      success: true,
      message: 'Cube test created successfully',
      data: withStatus(cubeTest),
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

    if (period && !SELECTABLE_PERIODS.includes(period)) {
      return res.status(422).json({
        success: false,
        message: `period must be one of ${SELECTABLE_PERIODS.join(', ')}`,
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
        const { error, toDate } = resolveToDate('CUSTOM', nextCastingDate, customDate, order);
        if (error) return res.status(400).json({ success: false, message: error });
        nextToDate = toDate;
      } else if (existing.period !== 'CUSTOM') {
        return res.status(422).json({
          success: false,
          message: 'customDate is required when period is CUSTOM',
        });
      }
    } else if (period || castingDate) {
      const { error, toDate } = resolveToDate(nextPeriod, nextCastingDate, customDate, order);
      if (error) return res.status(400).json({ success: false, message: error });
      nextToDate = toDate;
    }

    let fileUrl = existing.fileUrl;
    if (req.file) {
      if (existing.fileUrl) {
        deleteCubeTestFile(orderId, existing.fileUrl.split('/').pop());
      }
      fileUrl = getCubeTestPublicUrl(orderId, req.file.filename);
    }

    const resultAdded = Boolean(req.file) && !existing.fileUrl;

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

    await createActivityLog({
      title: 'Cube test updated (field app)',
      description: `Cube test on ${orderId}: test date ${new Date(existing.toDate).toDateString()} → ${new Date(updated.toDate).toDateString()}${resultAdded ? ', result attached' : ''}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'UPDATED',
      createdById: Number(userId),
    });
    if (resultAdded) {
      await sendNotification({
        targetType: 'CLIENT',
        targetId: order.clientId,
        title: 'Cube test result added',
        message: `The cube test result for order ${orderId} is ready`,
        type: 'STATUS_UPDATED',
        relatedId: order.id,
        orderId: order.id,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cube test updated successfully',
      data: withStatus(updated),
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

    await createActivityLog({
      title: 'Cube test deleted (field app)',
      description: `Cube test (testing ${new Date(existing.toDate).toDateString()}) deleted on ${orderId}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'UPDATED',
      createdById: Number(userId),
    });
    return res.status(200).json({ success: true, message: 'Cube test deleted successfully' });
  } catch (error) {
    logger.error('tech deleteCubeTest error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
