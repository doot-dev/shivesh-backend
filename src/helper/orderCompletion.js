import db from '../config/database.js';
import logger from './logger.js';
import { generateBillForOrder } from '../app/admin/controllers/billController.js';

/**
 * Why a completed order can't be billed yet, or null when it can.
 *
 * D13/W11: the bill waits for the challans. Every truck that wasn't rejected
 * needs a challan no., a challan photo and the office's acceptance. Rejected
 * trucks (at site or by the office) are simply left out (D18).
 * Pure — exported for scripts/verify_phase1.mjs.
 */
export function billBlocker(tms) {
  const live = tms.filter((tm) => !tm.isDeleted && tm.approvalStatus !== 'REJECTED');
  if (!live.length) return 'no accepted trucks yet';
  const missing = live.filter((tm) => !tm.challanNo || !tm.challanUrl || tm.approvalStatus !== 'ACCEPTED');
  if (missing.length) {
    return `awaiting challans: ${missing.length} of ${live.length} truck(s) need a challan no., a photo and acceptance (${missing.map((tm) => tm.tmNumber).join(', ')})`;
  }
  return null;
}

/** D4: bill the accepted quantity — the sum of accepted trucks. Null if any qty is unreadable. */
export function acceptedQuantity(tms) {
  let total = 0;
  for (const tm of tms) {
    if (tm.isDeleted || tm.approvalStatus !== 'ACCEPTED') continue;
    const q = parseFloat(String(tm.qty ?? '').trim());
    if (!Number.isFinite(q) || q <= 0) return null;
    total += q;
  }
  return Math.round(total * 1000) / 1000;
}

/**
 * Bill the order if it is COMPLETED, has no bill yet, and every live truck has
 * its challan in and accepted. Safe to call any time (it no-ops otherwise), so
 * it runs on completion AND after every challan upload / truck review.
 * Never throws.
 *
 * @returns {Promise<{ bill?: object, pending?: string, error?: string }>}
 */
export async function billIfReady(orderCode, { createdById } = {}) {
  try {
    const order = await db.order.findFirst({
      where: { orderId: orderCode, isDeleted: false },
      include: { tmDetails: true, bill: true },
    });
    if (!order || order.status !== 'COMPLETED') return { pending: 'order not completed' };
    if (order.bill && !order.bill.isDeleted) return { pending: `already billed as ${order.bill.billNo}` };

    const blocker = billBlocker(order.tmDetails);
    if (blocker) return { pending: blocker };

    const quantity = acceptedQuantity(order.tmDetails);
    if (!quantity) return { error: `Cannot read a truck quantity on ${orderCode} — fix it, then bill manually` };

    const result = await generateBillForOrder(orderCode, { createdById, quantity });
    if (result.error) logger.warn(`Auto-billing skipped for ${orderCode}: ${result.error}`);
    else logger.info(`Auto-billed ${orderCode} as ${result.bill.billNo} for accepted qty ${quantity}`);
    return result;
  } catch (err) {
    logger.error(`Auto-billing failed for ${orderCode}:`, err);
    return { error: 'Auto-billing failed — create the bill manually' };
  }
}

/** Kept as the completion hook both status endpoints call (P0.5). */
export const onOrderCompleted = billIfReady;
