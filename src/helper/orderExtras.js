import db from '../config/database.js';
import { createActivityLog } from './activityLogger.js';

/**
 * Extra services on an order (2026-09-29): pumping, part load, or anything
 * else agreed in the PO. The Shivesh team (admin, PM, FT, accounts) adds them
 * from Confirmed until the bill is paid; the bill carries them as extra lines.
 * Removal is soft, needs a reason, and only while the bill is unpaid.
 */
export const EXTRA_KINDS = { PUMPING: 'Pumping', PART_LOAD: 'Part load', OTHER: 'Other' };
export const EXTRA_OPEN_STATUSES = ['CONFIRMED', 'DISPATCHED', 'DELAYED', 'REACHED'];
const LOCKED_BILL = ['PAID', 'PARTIALLY_PAID', 'CANCELLED'];

const r2 = (n) => Math.round(n * 100) / 100;

export const extrasSelect = {
  where: { removedAt: null },
  orderBy: { createdAt: 'asc' },
  select: { id: true, kind: true, name: true, amount: true, createdAt: true, addedBy: { select: { id: true, name: true } } },
};

/** Sum of an order's live extras. */
export async function extrasTotal(orderDbId) {
  const { _sum } = await db.orderExtra.aggregate({ where: { orderId: orderDbId, removedAt: null }, _sum: { amount: true } });
  return r2(_sum.amount ?? 0);
}

/** Keep an existing (unpaid) bill in step with the extras. */
async function syncBill(order) {
  const bill = await db.bill.findUnique({ where: { orderId: order.id } });
  if (!bill || bill.isDeleted) return null;
  const extrasAmount = await extrasTotal(order.id);
  return db.bill.update({ where: { id: bill.id }, data: { extrasAmount, amount: r2(bill.quantity * bill.rate + extrasAmount) } });
}

/**
 * Add one extra. `amount` defaults to the project's PO rate for PUMPING /
 * PART_LOAD. `scope` narrows the order lookup (a tech's projects).
 * Returns { status, error } or { extra }.
 */
export async function addExtra(orderId, { kind, name, amount }, actorId, scope = {}) {
  const order = await db.order.findFirst({
    where: { orderId, isDeleted: false, ...scope },
    select: { id: true, orderId: true, status: true, bill: { select: { status: true, isDeleted: true } }, project: { select: { pumpingRate: true, partLoadRate: true } } },
  });
  if (!order) return { status: 404, error: 'Order not found' };
  const unpaidBill = order.bill && !order.bill.isDeleted && !LOCKED_BILL.includes(order.bill.status);
  if (!EXTRA_OPEN_STATUSES.includes(order.status) && !(order.status === 'COMPLETED' && unpaidBill)) {
    return { status: 409, error: `Extras can be added from Confirmed until the bill is paid (this order is ${order.status.toLowerCase()})` };
  }
  const k = EXTRA_KINDS[kind] ? kind : 'OTHER';
  const preset = k === 'PUMPING' ? order.project.pumpingRate : k === 'PART_LOAD' ? order.project.partLoadRate : null;
  const value = amount === undefined || amount === null || amount === '' ? preset : Number(amount);
  if (!Number.isFinite(value) || value <= 0) return { status: 400, error: 'Enter the price of the extra service' };
  const label = (String(name ?? '').trim() || EXTRA_KINDS[k]).slice(0, 190);

  const extra = await db.orderExtra.create({
    data: { orderId: order.id, kind: k, name: label, amount: r2(value), addedById: Number(actorId) },
    select: extrasSelect.select,
  });
  await syncBill(order);
  await createActivityLog({
    title: 'Extra service added',
    description: `${order.orderId}: ${label} ₹${r2(value)}`,
    entityType: 'ORDER', entityId: order.id, action: 'UPDATED', createdById: Number(actorId),
  });
  return { extra };
}

/** Remove one extra (soft), with a reason; refused once the bill is paid. */
export async function removeExtra(orderId, extraId, reason, actorId) {
  if (!String(reason ?? '').trim()) return { status: 400, error: 'Give a reason for removing it' };
  const order = await db.order.findFirst({ where: { orderId, isDeleted: false }, select: { id: true, orderId: true, bill: { select: { status: true, isDeleted: true } } } });
  if (!order) return { status: 404, error: 'Order not found' };
  if (order.bill && !order.bill.isDeleted && LOCKED_BILL.includes(order.bill.status)) {
    return { status: 409, error: 'The bill is already paid — adjust it with a credit note instead' };
  }
  const extra = await db.orderExtra.findFirst({ where: { id: extraId, orderId: order.id, removedAt: null } });
  if (!extra) return { status: 404, error: 'Extra service not found' };
  await db.orderExtra.update({ where: { id: extra.id }, data: { removedAt: new Date(), removedById: Number(actorId), removeReason: reason.trim() } });
  await syncBill(order);
  await createActivityLog({
    title: 'Extra service removed',
    description: `${order.orderId}: ${extra.name} ₹${extra.amount} — ${reason.trim()}`,
    entityType: 'ORDER', entityId: order.id, action: 'UPDATED', createdById: Number(actorId),
  });
  return { ok: true };
}
