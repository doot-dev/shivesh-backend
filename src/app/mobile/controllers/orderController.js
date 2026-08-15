import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import { sendNotification } from '../../../helper/notificationHelper.js';
import { emitOrderEvent } from '../../../realtime/socketServer.js';

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

function formatOrder(o) {
  return {
    ...o,
    isActive: orderIsActive(o.status),
  };
}

const DEV_CLIENT_ID = 'dev-client';
const DEV_TECH_ID   = 'dev-tech';

// ─── Client: list their own orders ────────────────────────────────────────────

export async function clientListOrders(req, res) {
  try {
    const { type = 'active', page = 1, limit = 20, projectId } = req.query;
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

    // Verify project belongs to this client
    const project = await db.project.findFirst({
      where: { projectId, clientId: clientDbId, isDeleted: false },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
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

    // Notify admin (create notification for type ADMIN)
    await sendNotification({
      targetType: 'ADMIN',
      targetId: 'admin',
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

// ─── Tech: list assigned orders ───────────────────────────────────────────────

export async function techListOrders(req, res) {
  try {
    const { type = 'active', page = 1, limit = 20 } = req.query;
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

    const validStatuses = ['ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
    if (!deliveryStatus || !validStatuses.includes(deliveryStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid deliveryStatus' });
    }

    const order = await db.order.findFirst({
      where: { orderId, ...assignedToTech(userId), isDeleted: false },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const statusMap = {
      ASSIGNED: 'CONFIRMED',
      IN_TRANSIT: 'IN_PROGRESS',
      DELIVERED: 'DELIVERED',
      COMPLETED: 'COMPLETED',
    };

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        deliveryStatus,
        status: statusMap[deliveryStatus] || order.status,
      },
    });

    // Notify the client
    await sendNotification({
      targetType: 'CLIENT',
      targetId: order.clientId,
      title: 'Order Status Updated',
      message: `Your order ${orderId} status has been updated to ${deliveryStatus.replace('_', ' ')}`,
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

    return res.status(200).json({ success: true, message: 'Status updated', data: { deliveryStatus: updated.deliveryStatus } });
  } catch (error) {
    logger.error('techUpdateStatus error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Shared: list comments ────────────────────────────────────────────────────

export async function listComments(req, res) {
  try {
    const { orderId } = req.params;

    const order = await db.order.findFirst({ where: { orderId, isDeleted: false } });
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

    const order = await db.order.findFirst({ where: { orderId, isDeleted: false } });
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
