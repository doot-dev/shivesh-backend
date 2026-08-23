/**
 * Delivery-date window rules, shared by the client (mobile) and admin order
 * endpoints so the two can't drift apart.
 *
 * Business rule: an order may not be scheduled more than 3 calendar months
 * into the future. Nobody — client or admin — can create or reschedule an
 * order past that window.
 *
 * THREE THINGS THAT LOOK WRONG BUT ARE NOT:
 *  1. Order.date is a STRING column holding ISO `YYYY-MM-DD`, not a DateTime.
 *     Everything here is string-in / string-out so it compares directly against
 *     what is stored (see buildOrderSearchFilter in mobile/orderController.js).
 *  2. Month arithmetic CLAMPS to the end of the target month instead of using
 *     Date.setMonth. setMonth overflows: 2025-11-30 + 3mo yields 2026-03-02,
 *     which would silently allow orders 2 days past the cap.
 *  3. A blank/absent date is allowed. Date is optional on an order (it can be
 *     scheduled later); this validates the value only when one is supplied.
 */

export const MAX_ORDER_MONTHS_AHEAD = 3;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as ISO `YYYY-MM-DD` in server-local time. */
export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Add whole calendar months to an ISO date, clamping to the last valid day of
 * the target month (2025-11-30 + 3mo -> 2026-02-28, and -> 02-29 in a leap year).
 */
export function addMonthsIso(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = m - 1 + months;
  const ty = y + Math.floor(target / 12);
  const tm = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d, lastDay);
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
}

/** The latest delivery date that may currently be booked, as ISO. */
export function maxDeliveryDateIso(now = new Date()) {
  return addMonthsIso(todayIso(now), MAX_ORDER_MONTHS_AHEAD);
}

/**
 * Validate a supplied delivery date against the booking window.
 *
 * Returns `{ valid: true }` when the date is absent/blank or inside the window,
 * otherwise `{ valid: false, message }` with a message safe to return to the
 * caller. ISO strings compare lexicographically, so plain `<` / `>` are correct.
 */
export function validateDeliveryDate(date, now = new Date()) {
  if (date === undefined || date === null || String(date).trim() === '') {
    return { valid: true };
  }

  const value = String(date).trim();

  if (!ISO_DATE.test(value)) {
    return { valid: false, message: 'Delivery date must be in YYYY-MM-DD format' };
  }

  // Reject impossible calendar dates (e.g. 2026-02-31) that pass the regex.
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return { valid: false, message: 'Delivery date is not a valid calendar date' };
  }

  const max = maxDeliveryDateIso(now);
  if (value > max) {
    return {
      valid: false,
      message: `Delivery date cannot be more than ${MAX_ORDER_MONTHS_AHEAD} months ahead (latest allowed is ${max})`,
    };
  }

  return { valid: true };
}
