import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import { sendNotification } from '../../../helper/notificationHelper.js';
import { getOrderChallanPublicUrl } from '../../../config/challanUploadConfig.js';

// ─── Create TM detail ─────────────────────────────────────────────────────────

/**
 * Log a transit mixer against an assigned order.
 *
 * DELIBERATELY has no order-status gate: a TM can be added at any time,
 * including after the order is DELIVERED or COMPLETED, because challans and
 * paperwork routinely reach the technician late. `createdAt` records when the
 * entry was really made, so a late addition is auditable rather than blocked.
 *
 * Accepts multipart/form-data so the challan photo rides along in the same
 * request (field name `challan`, wired by uploadSingleOrderChallan). The file
 * is optional — the numbers can be logged first and the photo attached later
 * through updateTm.
 */
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

    // An uploaded file always wins over a challanUrl sent in the body.
    const uploadedChallanUrl = req.file
      ? getOrderChallanPublicUrl(orderId, req.file.filename)
      : null;

    const tm = await db.tmDetail.create({
      data: {
        orderId: order.id,
        tmNumber,
        truckNo,
        qty,
        batchStartTime,
        batchEndTime,
        challanNo,
        challanUrl: uploadedChallanUrl || challanUrl || null,
        status: 'ASSIGNED',
      },
    });

    // Notify client (DB row + push to their registered devices)
    await sendNotification({
      targetType: 'CLIENT',
      targetId: order.clientId,
      title: 'TM Details Added',
      message: `Truck ${truckNo} details added for your order ${orderId}`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    });

    return res.status(201).json({ success: true, data: tm });
  } catch (error) {
    logger.error('createTm error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Update TM detail ─────────────────────────────────────────────────────────

/**
 * Update a TM. Every field is optional — send only what changes.
 *
 * Like createTm this has no order-status gate: attaching a challan photo to an
 * already-closed order is a normal, expected correction.
 */
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

    const uploadedChallanUrl = req.file
      ? getOrderChallanPublicUrl(orderId, req.file.filename)
      : null;

    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: {
        ...(truckNo && { truckNo }),
        ...(qty && { qty }),
        ...(batchStartTime && { batchStartTime }),
        ...(batchEndTime && { batchEndTime }),
        ...(challanNo && { challanNo }),
        ...(uploadedChallanUrl
          ? { challanUrl: uploadedChallanUrl }
          : challanUrl !== undefined && { challanUrl }),
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
