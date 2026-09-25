import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import { sendNotification, notifyAdmins } from '../../../helper/notificationHelper.js';
import { emitOrderEvent } from '../../../realtime/socketServer.js';
import { validateDeliveryDate } from '../../../helper/deliveryDateHelper.js';
import { createActivityLog } from '../../../helper/activityLogger.js';
import { onOrderCompleted } from '../../../helper/orderCompletion.js';
import { quantityError, priceListError } from '../../../helper/orderValidation.js';
import { rejectIfLocked, orderEditableUntil } from '../../../helper/updateWindow.js';
import { DELIVERY_STEPS, DELIVERY_TO_ORDER_STATUS, deliveryStepBlocked } from '../../../helper/orderStatus.js';

/** userIds of the techs assigned to an order — the WS emit target list. */
async function assignedTechUserIds(orderDbId) {
  const rows = await db.orderTechnician.findMany({
    where: { orderId: orderDbId, isDeleted: false },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function orderIsActive(status) {
  return !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(status);
}

function buildOrderSelect() {
  return {
    id: true,
    orderId: true,
    productName: true,
    productGrade: true,
    quantity: true,
    deliveryAddress: true,
    date: true,
    time: true,
    status: true,
    deliveryStatus: true,
    createdAt: true,
    project: { select: { projectId: true, projectName: true, siteName: true, projectLocation: true } },
    client: { select: { clientId: true, companyName: true, contactNumber: true } },
    vendors: {
      where: { isDeleted: false },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        vendor: { select: { id: true, companyName: true } },
        vendorLocation: { select: { id: true, plantName: true, address: true } },
        vendorHandler: { select: { id: true, name: true, phone: true } },
      },
    },
    technicians: {
      where: { isDeleted: false },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        user: { select: { id: true, name: true, employeeId: true, phone: true } },
      },
    },
    tmDetails: {
      where: { isDeleted: false },
      orderBy: { createdAt: 'asc' },
    },
    comments: { orderBy: { createdAt: 'asc' } },
  };
}

/**
 * Orders this technician is assigned to. Replaces the old `assignedToId: userId`
 * filter now that an order can carry several technicians.
 */
function assignedToTech(userId) {
  return { technicians: { some: { userId, isDeleted: false } } };
}

/**
 * The order, only if the caller may see it: a client's own order, or an order
 * the technician is assigned to. Order codes are sequential, so an unscoped
 * lookup let any client read or post in any other client's chat.
 */
function callerOrderWhere(orderId, user) {
  const scope = user?.type === 'CLIENT'
    ? { clientId: user.id }
    : assignedToTech(user?.id);
  return { orderId, isDeleted: false, ...scope };
}

function formatOrder(o) {
  return {
    ...o,
    isActive: orderIsActive(o.status),
    // W37: apps show "Editable until …" and hide edit buttons after it.
    editableUntil: o.date || o.createdAt ? orderEditableUntil(o) : null,
  };
}

/**
 * Free-text + date-range filters for the mobile order lists, shared by the
 * client and technician endpoints so the two can't drift apart.
 *
 * `q` matches the order code, project name, client company, product and grade.
 * `dateFrom`/`dateTo` (and the `date` shorthand for a single day) filter
 * Order.date.
 *
 * TWO THINGS THAT LOOK WRONG BUT ARE NOT:
 *  1. No `mode: 'insensitive'` — the MySQL connector REJECTS that argument
 *     ("Unknown argument `mode`"). It isn't needed: the column collation is
 *     already case-insensitive, verified with contains 'demo' vs 'DEMO'.
 *  2. Order.date is a STRING column, not DateTime, holding ISO `YYYY-MM-DD`.
 *     Lexicographic gte/lte therefore range correctly — but only for that
 *     format, so bad input is dropped rather than passed to the DB.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildOrderSearchFilter({ q, dateFrom, dateTo, date } = {}) {
  const filter = {};

  const term = typeof q === 'string' ? q.trim() : '';
  if (term) {
    filter.OR = [
      { orderId: { contains: term } },
      { productName: { contains: term } },
      { productGrade: { contains: term } },
      { deliveryAddress: { contains: term } },
      { project: { projectName: { contains: term } } },
      { project: { siteName: { contains: term } } },
      { client: { companyName: { contains: term } } },
    ];
  }

  // A single `date` is just a one-day range.
  const from = ISO_DATE.test(date ?? '') ? date : (ISO_DATE.test(dateFrom ?? '') ? dateFrom : null);
  const to = ISO_DATE.test(date ?? '') ? date : (ISO_DATE.test(dateTo ?? '') ? dateTo : null);

  if (from || to) {
    filter.date = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  return filter;
}

const DEV_CLIENT_ID = 'dev-client';
const DEV_TECH_ID   = 'dev-tech';

// ─── Client: list their own orders ────────────────────────────────────────────

export async function clientListOrders(req, res) {
  try {
    const { type = 'active', page = 1, limit = 20, projectId, q, dateFrom, dateTo, date } = req.query;
    const clientDbId = req.user.data.id;

    // DEV BYPASS — remove before production
    if (clientDbId === DEV_CLIENT_ID) {
      return res.status(200).json({ success: true, data: [], total: 0, page: 1 });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const activeStatuses = ['NEW', 'CONFIRMED', 'IN_PROGRESS'];
    const pastStatuses = ['DELIVERED', 'COMPLETED', 'CANCELLED'];

    const where = {
      clientId: clientDbId,
      isDeleted: false,
      status: { in: type === 'past' ? pastStatuses : activeStatuses },
      ...(projectId ? { project: { projectId } } : {}),
      ...buildOrderSearchFilter({ q, dateFrom, dateTo, date }),
    };

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        select: buildOrderSelect(),
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      db.order.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: orders.map(formatOrder),
      total,
      page: pageNum,
    });
  } catch (error) {
    logger.error('clientListOrders error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Client: list orders for a specific project (path param) ─────────────────

export async function clientListProjectOrders(req, res) {
  // Merge path param into query so the shared logic in clientListOrders can be reused
  req.query.projectId = req.params.projectId;
  return clientListOrders(req, res);
}

// ─── Client: get single order ─────────────────────────────────────────────────

export async function clientGetOrder(req, res) {
  try {
    const { orderId } = req.params;
    const clientDbId = req.user.data.id;

    // DEV BYPASS — remove before production
    if (clientDbId === DEV_CLIENT_ID) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = await db.order.findFirst({
      where: { orderId, clientId: clientDbId, isDeleted: false },
      select: buildOrderSelect(),
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.status(200).json({ success: true, data: formatOrder(order) });
  } catch (error) {
    logger.error('clientGetOrder error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Client: create order ─────────────────────────────────────────────────────

export async function clientCreateOrder(req, res) {
  try {
    const clientDbId = req.user.data.id;

    // DEV BYPASS — remove before production
    if (clientDbId === DEV_CLIENT_ID) {
      return res.status(201).json({ success: true, message: 'Order created successfully', data: { orderId: 'ORD-DEV-0001', id: 'dev-order' } });
    }
    const { projectId, productName, productGrade, quantity, date, time, deliveryAddress } = req.body;

    if (!projectId || !productName || !productGrade || !quantity) {
      return res.status(400).json({ success: false, message: 'projectId, productName, productGrade and quantity are required' });
    }

    // Orders may not be booked more than 3 months out. Enforced here as well as
    // in the app so a crafted request can't bypass the picker's date limits.
    const dateCheck = validateDeliveryDate(date);
    if (!dateCheck.valid) {
      return res.status(400).json({ success: false, message: dateCheck.message });
    }

    // Verify project belongs to this client
    const project = await db.project.findFirst({
      where: { projectId, clientId: clientDbId, isDeleted: false, status: 'ACTIVE' },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const lineError = quantityError(quantity) || (await priceListError(project.id, productName, productGrade));
    if (lineError) {
      return res.status(400).json({ success: false, message: lineError });
    }

    // Generate orderId
    const currentYear = new Date().getFullYear();
    const lastOrder = await db.order.findFirst({
      where: { orderId: { startsWith: `ORD-${currentYear}-` } },
      orderBy: { orderId: 'desc' },
    });

    let seq = 1;
    if (lastOrder) {
      const parts = lastOrder.orderId.split('-');
      seq = parseInt(parts[2]) + 1;
    }
    const orderId = `ORD-${currentYear}-${String(seq).padStart(4, '0')}`;

    const order = await db.order.create({
      data: {
        orderId,
        projectId: project.id,
        clientId: clientDbId,
        productName,
        productGrade,
        quantity,
        date: date || null,
        time: time || null,
        deliveryAddress: deliveryAddress || null,
        status: 'NEW',
        deliveryStatus: 'ASSIGNED',
      },
    });

    // Notify the admin panel's bell (live over the WebSocket).
    await notifyAdmins({
      title: 'New Order Created',
      message: `Client placed a new order ${orderId} for ${productName} ${productGrade} (${quantity})`,
      type: 'ORDER_CREATED',
      relatedId: order.id,
      orderId: order.id,
    });

    // Live push so the client's other devices and the admin panel see it now.
    const created = await db.order.findFirst({
      where: { id: order.id },
      select: buildOrderSelect(),
    });
    emitOrderEvent(order.orderId, 'order:new', formatOrder(created), {
      clientDbId,
    });

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { orderId: order.orderId, id: order.id },
    });
  } catch (error) {
    logger.error('clientCreateOrder error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Client: cancel before dispatch (D15, W6) ─────────────────────────────────

/**
 * The client may cancel directly while the order is NEW or CONFIRMED and no
 * truck has started batching or been dispatched. After that the concrete is
 * committed and it is a conversation with the office.
 */
export async function clientCancelOrder(req, res) {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const clientDbId = req.user.data.id;

    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }

    const order = await db.order.findFirst({
      where: { orderId, clientId: clientDbId, isDeleted: false },
      include: { tmDetails: { where: { isDeleted: false } } },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const dispatched =
      !['NEW', 'CONFIRMED'].includes(order.status) ||
      order.deliveryStatus !== 'ASSIGNED' ||
      order.tmDetails.some((tm) => tm.dispatchTime || tm.batchStartTime || tm.status !== 'ASSIGNED');
    if (dispatched) {
      return res.status(409).json({ success: false, message: 'Order already dispatched — please message the office' });
    }

    await db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    // ponytail: the reason lives in the order chat until 009 adds Order.cancelReason.
    await db.orderComment.create({
      data: {
        orderId: order.id,
        message: `Order cancelled by client: ${reason.trim()}`,
        authorType: 'CLIENT',
        authorId: String(clientDbId),
        authorName: req.user.data.name || 'Client',
      },
    });
    await notifyAdmins({
      title: 'Order cancelled by client',
      message: `${orderId} cancelled by the client: ${reason.trim()}`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    });
    const techUserIds = await assignedTechUserIds(order.id);
    await Promise.all(techUserIds.map((id) => sendNotification({
      targetType: 'FIELD_TECH',
      targetId: String(id),
      title: 'Order cancelled',
      message: `Order ${orderId} was cancelled by the client`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    })));
    emitOrderEvent(orderId, 'order:status', { orderId, status: 'CANCELLED', deliveryStatus: order.deliveryStatus, isActive: false }, { clientDbId, techUserIds });

    return res.status(200).json({ success: true, message: 'Order cancelled' });
  } catch (error) {
    logger.error('clientCancelOrder error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Tech: list assigned orders ───────────────────────────────────────────────

export async function techListOrders(req, res) {
  try {
    const { type = 'active', page = 1, limit = 20, q, dateFrom, dateTo, date } = req.query;
    const userId = req.user.data.id;

    // DEV BYPASS — remove before production
    if (userId === DEV_TECH_ID) {
      return res.status(200).json({ success: true, data: [], total: 0, page: 1 });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const activeStatuses = ['NEW', 'CONFIRMED', 'IN_PROGRESS'];
    const pastStatuses = ['DELIVERED', 'COMPLETED', 'CANCELLED'];

    const where = {
      ...assignedToTech(userId),
      isDeleted: false,
      status: { in: type === 'past' ? pastStatuses : activeStatuses },
      ...buildOrderSearchFilter({ q, dateFrom, dateTo, date }),
    };

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        select: buildOrderSelect(),
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      db.order.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: orders.map(formatOrder),
      total,
      page: pageNum,
    });
  } catch (error) {
    logger.error('techListOrders error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Tech: get single order ───────────────────────────────────────────────────

export async function techGetOrder(req, res) {
  try {
    const { orderId } = req.params;
    const userId = req.user.data.id;

    // DEV BYPASS — remove before production
    if (userId === DEV_TECH_ID) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = await db.order.findFirst({
      where: { orderId, ...assignedToTech(userId), isDeleted: false },
      select: buildOrderSelect(),
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.status(200).json({ success: true, data: formatOrder(order) });
  } catch (error) {
    logger.error('techGetOrder error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Tech: update delivery status ────────────────────────────────────────────

export async function techUpdateStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { deliveryStatus } = req.body;
    const userId = req.user.data.id;

    const validStatuses = DELIVERY_STEPS;
    if (!deliveryStatus || !validStatuses.includes(deliveryStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid deliveryStatus' });
    }

    const order = await db.order.findFirst({
      where: { orderId, ...assignedToTech(userId), isDeleted: false },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (await rejectIfLocked(order, req, res)) return;

    // W9: forward only, never on a cancelled order, never reopening a completed one.
    const blocked =
      deliveryStepBlocked(order.status, order.deliveryStatus, deliveryStatus) ||
      (order.status === 'COMPLETED' && deliveryStatus !== 'COMPLETED' ? 'the order is already completed' : null);
    if (blocked) {
      return res.status(409).json({ success: false, message: `Order ${orderId}: ${blocked}` });
    }
    const statusMap = DELIVERY_TO_ORDER_STATUS;

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        deliveryStatus,
        status: statusMap[deliveryStatus] || order.status,
      },
    });

    const statusLabel = deliveryStatus.replace('_', ' ');

    await createActivityLog({
      title: 'Order status updated (field app)',
      description: `Order ${orderId} moved to ${statusLabel} by ${req.user.data.name || 'a technician'} (was ${order.deliveryStatus})`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'STATUS_CHANGED',
      createdById: Number(userId),
    });

    // Field-app completions used to skip billing entirely (G2).
    const billing = updated.status === 'COMPLETED' && order.status !== 'COMPLETED'
      ? await onOrderCompleted(orderId, { createdById: Number(userId) })
      : null;

    // Notify the client
    await sendNotification({
      targetType: 'CLIENT',
      targetId: order.clientId,
      title: 'Order Status Updated',
      message: `Your order ${orderId} status has been updated to ${statusLabel}`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    });

    // Admins watch every order, so a technician moving an order forward is
    // exactly the kind of thing the back office needs to see without asking.
    await notifyAdmins({
      title: 'Order Status Updated',
      message: `${req.user.data.name || 'A technician'} moved order ${orderId} to ${statusLabel}`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    });

    emitOrderEvent(
      orderId,
      'order:status',
      {
        orderId,
        status: updated.status,
        deliveryStatus: updated.deliveryStatus,
        isActive: orderIsActive(updated.status),
      },
      {
        clientDbId: order.clientId,
        techUserIds: await assignedTechUserIds(order.id),
      },
    );

    return res.status(200).json({
      success: true,
      message: 'Status updated',
      data: { deliveryStatus: updated.deliveryStatus },
      ...(billing?.error && { billError: billing.error }),
      ...(billing?.pending && { billPending: billing.pending }),
    });
  } catch (error) {
    logger.error('techUpdateStatus error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Shared: list comments ────────────────────────────────────────────────────

export async function listComments(req, res) {
  try {
    const { orderId } = req.params;

    const order = await db.order.findFirst({ where: callerOrderWhere(orderId, req.user.data) });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const comments = await db.orderComment.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({ success: true, data: comments });
  } catch (error) {
    logger.error('listComments error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Shared: add comment ──────────────────────────────────────────────────────

export async function addComment(req, res) {
  try {
    const { orderId } = req.params;
    const { message } = req.body;
    const userData = req.user.data;

    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const order = await db.order.findFirst({ where: callerOrderWhere(orderId, req.user.data) });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const authorType = userData.type; // CLIENT or FIELD_TECH
    const authorId = String(userData.id);
    const authorName = userData.name;

    const comment = await db.orderComment.create({
      data: {
        orderId: order.id,
        message: message.trim(),
        authorType,
        authorId,
        authorName,
      },
    });

    // Notify the other party — a client comment reaches every assigned tech,
    // a tech comment reaches the client.
    const notifyTargets =
      authorType === 'CLIENT'
        ? (
            await db.orderTechnician.findMany({
              where: { orderId: order.id, isDeleted: false },
              select: { userId: true },
            })
          ).map((t) => ({ targetType: 'FIELD_TECH', targetId: String(t.userId) }))
        : [{ targetType: 'CLIENT', targetId: order.clientId }];

    await Promise.all(
      notifyTargets.map((target) =>
        sendNotification({
          ...target,
          title: 'New Comment',
          message: `${authorName} commented on order ${orderId}`,
          type: 'COMMENT_ADDED',
          relatedId: order.id,
          orderId: order.id,
        })
      )
    );

    // The admin panel sees BOTH sides of the conversation — a client message
    // and a technician message both land in the bell, labelled with who sent it.
    await notifyAdmins({
      title: authorType === 'CLIENT' ? 'New Client Message' : 'New Technician Message',
      message: `${authorName} commented on order ${orderId}: ${message.trim().slice(0, 120)}`,
      type: 'COMMENT_ADDED',
      relatedId: order.id,
      orderId: order.id,
    });

    // Real-time fan-out: the comment appears on every open device immediately.
    emitOrderEvent(orderId, 'comment:new', comment, {
      clientDbId: order.clientId,
      techUserIds: await assignedTechUserIds(order.id),
    });

    return res.status(201).json({ success: true, data: comment });
  } catch (error) {
    logger.error('addComment error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
