import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import { sendNotification, notifyAdmins } from '../../../helper/notificationHelper.js';
import { createActivityLog } from '../../../helper/activityLogger.js';
import { rejectIfLocked } from '../../../helper/updateWindow.js';
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
    const { truckNo, qty, batchStartTime, batchEndTime, challanNo, challanUrl, dispatchTime, arrivalTime } = req.body;
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

    if (await rejectIfLocked(order, req, res)) return;

    // Auto-generate TM number
    // Deleted rows count too, so a number already printed on a challan is
    // never reused (the panel numbers the same way).
    const existingCount = await db.tmDetail.count({
      where: { orderId: order.id },
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
        dispatchTime: dispatchTime || null,
        arrivalTime: arrivalTime || null,
        challanUrl: uploadedChallanUrl || challanUrl || null,
        status: uploadedChallanUrl || challanUrl ? 'DELIVERED' : 'ASSIGNED',
        ...((uploadedChallanUrl || challanUrl) && { deliveredAt: new Date() }),
      },
    });

    await createActivityLog({
      title: 'TM added (field app)',
      description: `${tmNumber} (${truckNo}) added to order ${orderId}, qty ${qty}, challan ${challanNo}${tm.challanUrl ? " with photo" : ""}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'UPDATED',
      createdById: Number(userId),
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
    const { truckNo, qty, batchStartTime, batchEndTime, challanNo, challanUrl, status, dispatchTime, arrivalTime } = req.body;
    const userId = req.user.data.id;

    const order = await db.order.findFirst({
      where: { orderId, technicians: { some: { userId, isDeleted: false } }, isDeleted: false },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (await rejectIfLocked(order, req, res)) return;

    const tm = await db.tmDetail.findFirst({
      where: { id: tmId, orderId: order.id, isDeleted: false },
    });

    if (!tm) {
      return res.status(404).json({ success: false, message: 'TM detail not found' });
    }

    // P1.4: once the office has accepted or rejected a truck, only the office
    // can change it (the change is then logged against a user).
    if (tm.approvalStatus !== 'PENDING') {
      return res.status(409).json({ success: false, message: `${tm.tmNumber} is already ${tm.approvalStatus.toLowerCase()} — ask the office to change it` });
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
        ...(dispatchTime && { dispatchTime }),
        ...(arrivalTime && { arrivalTime }),
        ...(uploadedChallanUrl
          ? { challanUrl: uploadedChallanUrl }
          : challanUrl !== undefined && { challanUrl }),
        ...(status && { status }),
        // A challan photo means the truck was poured.
        ...(!status && uploadedChallanUrl && ['ASSIGNED', 'IN_TRANSIT', 'REACHED'].includes(tm.status) && { status: 'DELIVERED' }),
        ...(uploadedChallanUrl && !tm.deliveredAt && { deliveredAt: new Date() }),
      },
    });

    await createActivityLog({
      title: 'TM updated (field app)',
      description: `${tm.tmNumber} updated on order ${orderId}: qty ${tm.qty} → ${updated.qty}, challan ${tm.challanNo || "-"} → ${updated.challanNo || "-"}${uploadedChallanUrl ? ", new photo" : ""}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'UPDATED',
      createdById: Number(userId),
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

    if (await rejectIfLocked(order, req, res)) return;

    const tm = await db.tmDetail.findFirst({
      where: { id: tmId, orderId: order.id, isDeleted: false },
    });

    if (!tm) {
      return res.status(404).json({ success: false, message: 'TM detail not found' });
    }

    // P1.4: once the office has accepted or rejected a truck, only the office
    // can change it (the change is then logged against a user).
    if (tm.approvalStatus !== 'PENDING') {
      return res.status(409).json({ success: false, message: `${tm.tmNumber} is already ${tm.approvalStatus.toLowerCase()} — ask the office to change it` });
    }

    await db.tmDetail.update({ where: { id: tmId }, data: { isDeleted: true } });

    await createActivityLog({
      title: 'TM deleted (field app)',
      description: `${tm.tmNumber} (${tm.truckNo}) removed from order ${orderId}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'UPDATED',
      createdById: Number(userId),
    });
    return res.status(200).json({ success: true, message: 'TM detail removed' });
  } catch (error) {
    logger.error('deleteTm error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Mark one truck as reached site (W32) ─────────────────────────────────────

/**
 * The technician taps "Reached site" on a truck. Stamps arrivalTime and moves
 * the truck to REACHED — the point from which the client may reject it.
 */
export async function markTmReached(req, res) {
  try {
    const { orderId, tmId } = req.params;
    const userId = req.user.data.id;

    const order = await db.order.findFirst({
      where: { orderId, technicians: { some: { userId, isDeleted: false } }, isDeleted: false },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (await rejectIfLocked(order, req, res)) return;
    if (order.status === 'CANCELLED') return res.status(409).json({ success: false, message: 'Order is cancelled' });

    const tm = await db.tmDetail.findFirst({ where: { id: tmId, orderId: order.id, isDeleted: false } });
    if (!tm) return res.status(404).json({ success: false, message: 'TM detail not found' });
    if (!['ASSIGNED', 'IN_TRANSIT'].includes(tm.status)) {
      return res.status(409).json({ success: false, message: `${tm.tmNumber} is already ${tm.status}` });
    }

    const now = new Date();
    const arrivalTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: { status: 'REACHED', arrivalTime: tm.arrivalTime || arrivalTime },
    });
    if (['ASSIGNED', 'IN_TRANSIT'].includes(order.deliveryStatus)) {
      await db.order.update({ where: { id: order.id }, data: { deliveryStatus: 'REACHED', status: order.status === 'CONFIRMED' ? 'IN_PROGRESS' : order.status } });
    }

    await createActivityLog({
      title: 'TM reached site',
      description: `${tm.tmNumber} (${tm.truckNo}) reached site on order ${orderId} at ${updated.arrivalTime}`,
      entityType: 'ORDER',
      entityId: order.id,
      action: 'STATUS_CHANGED',
      createdById: Number(userId),
    });
    await sendNotification({
      targetType: 'CLIENT',
      targetId: order.clientId,
      title: 'Truck reached site',
      message: `${tm.tmNumber} (${tm.truckNo}) reached your site for order ${orderId}. Check the material — you can reject it before the challan is added.`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    logger.error('markTmReached error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Client rejects a truck at site (W32, D18) ────────────────────────────────

export const SITE_REJECTION_REASONS = ['Quality / slump not OK', 'Damaged / segregated', 'Wrong grade', 'Too late', 'Other'];

/**
 * Allowed only while the truck is REACHED and before its challan is added —
 * after the pour a rejection is a credit note, handled by the office.
 * A rejected truck needs no challan and is never billed or counted as credit.
 */
export async function clientRejectTm(req, res) {
  try {
    const { orderId, tmId } = req.params;
    const { reason, note } = req.body;
    const clientDbId = req.user.data.id;

    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }

    const order = await db.order.findFirst({ where: { orderId, clientId: clientDbId, isDeleted: false } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (await rejectIfLocked(order, req, res)) return;

    const tm = await db.tmDetail.findFirst({ where: { id: tmId, orderId: order.id, isDeleted: false } });
    if (!tm) return res.status(404).json({ success: false, message: 'TM detail not found' });
    if (tm.status !== 'REACHED' || tm.challanUrl || tm.approvalStatus !== 'PENDING') {
      return res.status(409).json({ success: false, message: 'This truck can no longer be rejected — please message the office' });
    }

    const rejectionReason = note?.trim() ? `${reason.trim()} — ${note.trim()}` : reason.trim();
    const updated = await db.tmDetail.update({
      where: { id: tmId },
      data: {
        approvalStatus: 'REJECTED',
        rejectionReason,
        rejectedAt: new Date(),
        rejectedByType: 'CLIENT',
        rejectedById: String(clientDbId),
      },
    });

    // ponytail: Activity needs a User as actor, so a client action can't be logged
    // there yet (W31 adds actorType in 009). The admin bell below is the trail.
    await notifyAdmins({
      title: 'Truck rejected at site',
      message: `Client rejected ${tm.tmNumber} (${tm.truckNo}) on ${orderId}: ${rejectionReason}`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    });
    const techs = await db.orderTechnician.findMany({ where: { orderId: order.id, isDeleted: false }, select: { userId: true } });
    await Promise.all(techs.map((x) => sendNotification({
      targetType: 'FIELD_TECH',
      targetId: String(x.userId),
      title: 'Truck rejected at site',
      message: `Client rejected ${tm.tmNumber} (${tm.truckNo}) on ${orderId}: ${rejectionReason}`,
      type: 'STATUS_UPDATED',
      relatedId: order.id,
      orderId: order.id,
    })));

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    logger.error('clientRejectTm error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
