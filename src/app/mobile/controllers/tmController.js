import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';

// ─── Create TM detail ─────────────────────────────────────────────────────────

export async function createTm(req, res) {
  try {
    const { orderId } = req.params;
    const { truckNo, qty, batchStartTime, batchEndTime, challanNo, challanUrl } = req.body;
    const userId = req.user.data.id;

    if (!truckNo || !qty || !batchStartTime || !batchEndTime || !challanNo) {
      return res.status(400).json({ success: false, message: 'truckNo, qty, batchStartTime, batchEndTime and challanNo are required' });
    }

    const order = await db.order.findFirst({
      where: { orderId, technicians: { some: { userId, isDeleted: false } }, isDeleted: false },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Auto-generate TM number
    const existingCount = await db.tmDetail.count({
      where: { orderId: order.id, isDeleted: false },
    });
    const tmNumber = `TM ${String(existingCount + 1).padStart(2, '0')}`;

    const tm = await db.tmDetail.create({
      data: {
        orderId: order.id,
        tmNumber,
        truckNo,
        qty,
        batchStartTime,
        batchEndTime,
        challanNo,
        challanUrl: challanUrl || null,
        status: 'ASSIGNED',
      },
    });

    // Notify client
    await db.notification.create({
      data: {
        targetType: 'CLIENT',
        targetId: order.clientId,
        title: 'TM Details Added',
        message: `Truck ${truckNo} details added for your order ${orderId}`,
        type: 'STATUS_UPDATED',
        relatedId: order.id,
        orderId: order.id,
      },
    });

    return res.status(201).json({ success: true, data: tm });
  } catch (error) {
    logger.error('createTm error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Update TM detail ─────────────────────────────────────────────────────────

export async function updateTm(req, res) {
  try {
    const { orderId, tmId } = req.params;
    const { truckNo, qty, batchStartTime, batchEndTime, challanNo, challanUrl, status } = req.body;
    const userId = req.user.data.id;

    const order = await db.order.findFirst({
      where: { orderId, technicians: { some: { userId, isDeleted: false } }, isDeleted: false },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const tm = await db.tmDetail.findFirst({
      where: { id: tmId, orderId: order.id, isDeleted: false },
    });

    if (!tm) {
      return res.status(404).json({ success: false, message: 'TM detail not found' });
    }

    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: {
        ...(truckNo && { truckNo }),
        ...(qty && { qty }),
        ...(batchStartTime && { batchStartTime }),
        ...(batchEndTime && { batchEndTime }),
        ...(challanNo && { challanNo }),
        ...(challanUrl !== undefined && { challanUrl }),
        ...(status && { status }),
      },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    logger.error('updateTm error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Delete TM detail (soft) ──────────────────────────────────────────────────

export async function deleteTm(req, res) {
  try {
    const { orderId, tmId } = req.params;
    const userId = req.user.data.id;

    const order = await db.order.findFirst({
      where: { orderId, technicians: { some: { userId, isDeleted: false } }, isDeleted: false },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const tm = await db.tmDetail.findFirst({
      where: { id: tmId, orderId: order.id, isDeleted: false },
    });

    if (!tm) {
      return res.status(404).json({ success: false, message: 'TM detail not found' });
    }

    await db.tmDetail.update({ where: { id: tmId }, data: { isDeleted: true } });

    return res.status(200).json({ success: true, message: 'TM detail removed' });
  } catch (error) {
    logger.error('deleteTm error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
