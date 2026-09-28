import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import { sendNotification, notifyAdmins } from '../../../helper/notificationHelper.js';
import { emitOrderEvent } from '../../../realtime/socketServer.js';
import { validateDeliveryDate } from '../../../helper/deliveryDateHelper.js';
import { createActivityLog } from '../../../helper/activityLogger.js';
import { onOrderCompleted } from '../../../helper/orderCompletion.js';
import { quantityError, priceListError } from '../../../helper/orderValidation.js';
import { bookingSnapshot, creditGate } from '../../../helper/orderBooking.js';
import { getCreditPosition, getCreditBand } from '../../../helper/creditPosition.js';
import { rejectIfLocked, orderEditableUntil } from '../../../helper/updateWindow.js';
import { orderProjectScope, projectScope, isClientOwner } from '../../../helper/clientAccess.js';
import { ACTIVE_STATUSES, PAST_STATUSES, FIELD_STATUSES, isActiveStatus, orderStatusBlocked } from '../../../helper/orderStatus.js';
import { techOrderScope, orderTechUserIds, notifyProjectTechsOfNewOrder } from '../../../helper/techAccess.js';

const assignedTechUserIds = orderTechUserIds;

// ─── Shared helpers ───────────────────────────────────────────────────────────

const orderIsActive = isActiveStatus;

/** Field-app builds before the single status sent a delivery step instead. */
const r2 = (n) => Math.round(n * 100) / 100;
const LEGACY_STEP_TO_STATUS = { IN_TRANSIT: 'DISPATCHED', REACHED: 'REACHED', DELIVERED: 'REACHED', COMPLETED: 'COMPLETED' };

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
    // docs/06: who placed it from the client app, so the plant/tech knows whom to call.
    placedBy: { select: { name: true, phone: true, role: { select: { name: true } } } },
  };
}

/**
 * Orders this technician is assigned to. Replaces the old `assignedToId: userId`
 * filter now that an order can carry several technicians.
 */
const assignedToTech = techOrderScope;

/**
 * The order, only if the caller may see it: a client's own order, or an order
 * the technician is assigned to. Order codes are sequential, so an unscoped
 * lookup let any client read or post in any other client's chat.
 */
function callerOrderWhere(orderId, user, clientAccess) {
  const scope = user?.type === 'CLIENT'
    ? { clientId: user.id, ...orderProjectScope(clientAccess) }
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

    const activeStatuses = ACTIVE_STATUSES;
    const pastStatuses = PAST_STATUSES;

    const where = {
      clientId: clientDbId,
      ...orderProjectScope(req.clientAccess),
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
      where: { orderId, clientId: clientDbId, isDeleted: false, ...orderProjectScope(req.clientAccess) },
      select: buildOrderSelect(),
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Everyone sees the band; only the Owner sees amounts and what this order
    // does to them once delivered (e.g. ₹8,00,000 → ₹7,40,000).
    const pos = await getCreditPosition(clientDbId);
    const thisOrder = pos.pendingByOrder[orderId];
    return res.status(200).json({
      success: true,
      data: {
        ...formatOrder(order),
        creditBand: pos.band,
        ...(isClientOwner(req.clientAccess) && thisOrder > 0 && pos.limit > 0 && {
          creditPreview: { available: pos.available, afterThisOrder: r2(pos.available - thisOrder), orderValue: thisOrder },
        }),
      },
    });
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
    // The project must be this client's, and one this contact may order for (Q3).
    const project = req.body.projectId && await db.project.findFirst({
      where: { projectId: req.body.projectId, clientId: clientDbId, isDeleted: false, status: 'ACTIVE', ...projectScope(req.clientAccess) },
    });
    const placer = req.clientAccess.contact;
    return await placeOrder(req, res, project, {
      placedByContactId: placer?.id ?? null,
      by: placer ? `${placer.name} (${placer.role.name})` : 'Client',
      log: {
        title: 'Order placed (client app)',
        description: `placed by ${placer ? `${placer.name} (${placer.role.name}, ${placer.phone})` : 'the client'}`,
        actorType: placer ? 'CLIENT_CONTACT' : 'CLIENT',
        actorId: placer?.id ?? clientDbId,
        source: 'CLIENT_APP',
      },
    });
  } catch (error) {
    logger.error('clientCreateOrder error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

/** POST /tech/orders — an FT on the project books an order for it (2026-09-28). */
export async function techCreateOrder(req, res) {
  try {
    const userId = Number(req.user.data.id);
    const project = req.body.projectId && await db.project.findFirst({
      where: { projectId: req.body.projectId, isDeleted: false, status: 'ACTIVE', technicians: { some: { userId } } },
    });
    const name = req.user.data.name || 'A field technician';
    return await placeOrder(req, res, project, {
      placedByContactId: null,
      by: `${name} (field technician)`,
      exceptTechUserId: userId,
      log: {
        title: 'Order placed (field app)',
        description: `placed by ${name} (field technician)`,
        actorType: 'FIELD_TECH',
        actorId: String(userId),
        source: 'FIELD_APP',
      },
    });
  } catch (error) {
    logger.error('techCreateOrder error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

/**
 * The booking both apps share: validate, number, freeze rate, check credit
 * (warns only), save, log, then tell the admins, the client and the project's FTs.
 */
async function placeOrder(req, res, project, { placedByContactId, by, log, exceptTechUserId = null }) {
    const { productName, productGrade, quantity, date, time, deliveryAddress } = req.body;

    if (!req.body.projectId || !productName || !productGrade || !quantity) {
      return res.status(400).json({ success: false, message: 'projectId, productName, productGrade and quantity are required' });
    }

    // Orders may not be booked more than 3 months out. Enforced here as well as
    // in the app so a crafted request can't bypass the picker's date limits.
    const dateCheck = validateDeliveryDate(date);
    if (!dateCheck.valid) {
      return res.status(400).json({ success: false, message: dateCheck.message });
    }

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const clientDbId = project.clientId;

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

    // W2/W38 freeze rate + unit; W23 credit gate (hold for approval, D12).
    const snap = await bookingSnapshot(project.id, productName, productGrade);
    const gate = await creditGate(clientDbId, (parseFloat(quantity) || 0) * (snap.rate || 0));

    const order = await db.order.create({
      data: {
        orderId,
        projectId: project.id,
        clientId: clientDbId,
        productName,
        productGrade,
        quantity,
        ...snap,
        date: date || null,
        time: time || null,
        deliveryAddress: deliveryAddress || null,
        status: 'NEW',
        placedByContactId,
      },
    });

    await createActivityLog({
      ...log,
      description: `${orderId} ${log.description}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'CREATED',
      event: 'ORDER_PLACED',
      orderRef: orderId,
    });

    // Notify the admin panel's bell (live over the WebSocket).
    await notifyAdmins({
      title: 'New Order Created',
      message: `${by} placed a new order ${orderId} for ${productName} ${productGrade} (${quantity})`,
      type: 'ORDER_CREATED',
      relatedId: order.id,
      orderId: order.id,
    });

    // Booked by the FT on the client's behalf: the client hears about it.
    if (exceptTechUserId) {
      await sendNotification({
        targetType: 'CLIENT',
        targetId: clientDbId,
        title: 'New order placed',
        message: `${by} placed order ${orderId} for ${productName} ${productGrade} (${quantity})`,
        type: 'ORDER_CREATED',
        relatedId: order.id,
        orderId: order.id,
      });
    }

    // Live push so the client's other devices and the admin panel see it now.
    const created = await db.order.findFirst({
      where: { id: order.id },
      select: buildOrderSelect(),
    });
    emitOrderEvent(order.orderId, 'order:new', formatOrder(created), {
      clientDbId,
      techUserIds: await notifyProjectTechsOfNewOrder(created, { exceptUserId: exceptTechUserId }),
    });

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { orderId: order.orderId, id: order.id, creditHold: false, creditBand: gate.band },
    });
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
      where: { orderId, clientId: clientDbId, isDeleted: false, ...orderProjectScope(req.clientAccess) },
      include: { tmDetails: { where: { isDeleted: false } } },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const dispatched =
      !['NEW', 'CONFIRMED', 'DELAYED'].includes(order.status) ||
      order.tmDetails.some((tm) => tm.dispatchTime || tm.batchStartTime || tm.status !== 'ASSIGNED');
    if (dispatched) {
      return res.status(409).json({ success: false, message: 'Order already dispatched — please message the office' });
    }

    await db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelReason: `Client: ${reason.trim()}` } });
    await db.orderComment.create({
      data: {
        orderId: order.id,
        message: `Order cancelled by client: ${reason.trim()}`,
        authorType: 'CLIENT',
        authorId: String(clientDbId),
        authorName: req.user.data.contactName || req.user.data.name || 'Client',
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
    emitOrderEvent(orderId, 'order:status', { orderId, status: 'CANCELLED', isActive: false }, { clientDbId, techUserIds });

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

    const activeStatuses = ACTIVE_STATUSES;
    const pastStatuses = PAST_STATUSES;

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

    const { clientId: clientDbId, ...order } = await db.order.findFirst({
      where: { orderId, ...assignedToTech(userId), isDeleted: false },
      select: { ...buildOrderSelect(), clientId: true },
    }) ?? {};

    if (!order.orderId) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Band only — a technician never sees the client's amounts.
    const { band } = await getCreditBand(clientDbId);
    return res.status(200).json({ success: true, data: { ...formatOrder(order), creditBand: band } });
  } catch (error) {
    logger.error('techGetOrder error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Tech: move the order along (Dispatched, Delayed, Reached, Completed) ─────

export async function techUpdateStatus(req, res) {
  try {
    const { orderId } = req.params;
    const status = req.body.status ?? LEGACY_STEP_TO_STATUS[req.body.deliveryStatus];
    const userId = req.user.data.id;

    if (!FIELD_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of ${FIELD_STATUSES.join(', ')}` });
    }

    const order = await db.order.findFirst({
      where: { orderId, ...assignedToTech(userId), isDeleted: false },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (await rejectIfLocked(order, req, res)) return;

    // W9: the same transition table as the panel.
    const blocked = orderStatusBlocked(order.status, status);
    if (blocked) {
      return res.status(409).json({ success: false, message: `Order ${orderId}: ${blocked}` });
    }
    const updated = await db.order.update({
      where: { id: order.id },
      data: { status },
    });

    const statusLabel = status.charAt(0) + status.slice(1).toLowerCase();

    await createActivityLog({
      title: 'Order status updated (field app)',
      description: `Order ${orderId} moved to ${statusLabel} by ${req.user.data.name || 'a technician'} (was ${order.status})`,
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
      data: { status: updated.status },
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

    const order = await db.order.findFirst({ where: callerOrderWhere(orderId, req.user.data, req.clientAccess) });
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

    const order = await db.order.findFirst({ where: callerOrderWhere(orderId, req.user.data, req.clientAccess) });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const authorType = userData.type; // CLIENT or FIELD_TECH
    const authorId = String(userData.id);
    const authorName = userData.contactName || userData.name;

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
            await orderTechUserIds(order.id)
          ).map((id) => ({ targetType: 'FIELD_TECH', targetId: String(id) }))
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
