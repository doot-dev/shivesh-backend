/**
 * Order status rules — one table the panel, the field app and the client app
 * all obey (W9).
 *
 * One status per order (user decision 2026-09-26); it replaced the old
 * status + deliveryStatus pair:
 *
 *   NEW → CONFIRMED → DISPATCHED → REACHED → COMPLETED
 *
 * DELAYED can be set any time before REACHED; the next step clears it.
 * CANCELLED only before the order is dispatched (the office decides after).
 * A truck keeps its own status on TmDetail — that is per truck, not per order.
 */
export const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'DELAYED', 'DISPATCHED', 'REACHED', 'COMPLETED', 'CANCELLED'];
export const ACTIVE_STATUSES = ['NEW', 'CONFIRMED', 'DELAYED', 'DISPATCHED', 'REACHED'];
export const PAST_STATUSES = ['COMPLETED', 'CANCELLED'];

export const ORDER_TRANSITIONS = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DELAYED', 'DISPATCHED', 'CANCELLED'],
  DELAYED: ['DISPATCHED', 'REACHED', 'CANCELLED'],
  DISPATCHED: ['DELAYED', 'REACHED'],
  REACHED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Statuses the field technician may set from the app. */
export const FIELD_STATUSES = ['DISPATCHED', 'DELAYED', 'REACHED', 'COMPLETED'];

export const isActiveStatus = (status) => ACTIVE_STATUSES.includes(status);

/** Why `from` → `to` is not allowed, or null. Same status is a no-op, allowed. */
export function orderStatusBlocked(from, to) {
  if (!to || from === to) return null;
  if ((ORDER_TRANSITIONS[from] || []).includes(to)) return null;
  return `an order that is ${from} cannot move to ${to}`;
}
