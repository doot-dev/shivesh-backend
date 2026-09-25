/**
 * Order status rules (W9) — one table both the panel and the field app obey.
 * Before this, any status could follow any other, and a technician could
 * complete a cancelled order.
 */
export const ORDER_TRANSITIONS = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Truck/order delivery steps, in order. The field app may only move forward. */
export const DELIVERY_STEPS = ['ASSIGNED', 'IN_TRANSIT', 'REACHED', 'DELIVERED', 'COMPLETED'];

/** Order status each delivery step implies (field app). */
export const DELIVERY_TO_ORDER_STATUS = {
  ASSIGNED: 'CONFIRMED',
  IN_TRANSIT: 'IN_PROGRESS',
  REACHED: 'IN_PROGRESS',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
};

/** Why `from` → `to` is not allowed, or null. Same status is a no-op, allowed. */
export function orderStatusBlocked(from, to) {
  if (!to || from === to) return null;
  if ((ORDER_TRANSITIONS[from] || []).includes(to)) return null;
  return `an order that is ${from} cannot move to ${to}`;
}

/** Why a delivery step change is not allowed, or null. */
export function deliveryStepBlocked(orderStatus, from, to) {
  if (orderStatus === 'CANCELLED') return 'the order is cancelled';
  if (from === to) return null;
  if (DELIVERY_STEPS.indexOf(to) < DELIVERY_STEPS.indexOf(from)) return `cannot move back from ${from} to ${to}`;
  return null;
}
