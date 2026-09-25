/**
 * Cube-test date rules — the single copy shared by the panel and field-app
 * controllers (W36). The calculation is unchanged from before: test date =
 * casting date + N days, or a typed CUSTOM date.
 */
export const PERIOD_DAYS = {
  SEVEN_DAYS: 7,
  FOURTEEN_DAYS: 14, // legacy, kept for old rows (D21)
  FIFTEEN_DAYS: 15,
  TWENTYONE_DAYS: 21, // legacy, kept for old rows (D21)
  TWENTYEIGHT_DAYS: 28,
};

/** What the pickers offer for new tests (D21): 7, 15, 28 days + custom. */
export const SELECTABLE_PERIODS = ['SEVEN_DAYS', 'FIFTEEN_DAYS', 'TWENTYEIGHT_DAYS', 'CUSTOM'];
/** Every value an existing row may carry. */
export const ALL_PERIODS = [...Object.keys(PERIOD_DAYS), 'CUSTOM'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/**
 * { toDate } or { error }. Checks: casting date is a real date, not in the
 * future, not before the order's delivery date; a custom test date is not in
 * the future and not before the casting date.
 */
export function resolveToDate(period, castingDate, customDate, order) {
  const casting = new Date(castingDate);
  if (Number.isNaN(casting.getTime())) return { error: 'castingDate is not a valid date' };
  if (startOfDay(casting) > startOfDay(new Date())) return { error: 'Casting date cannot be in the future' };
  if (order?.date && /^\d{4}-\d{2}-\d{2}$/.test(order.date) && startOfDay(casting) < new Date(`${order.date}T00:00:00`)) {
    return { error: `Casting date cannot be before the order's delivery date (${order.date})` };
  }

  if (period === 'CUSTOM') {
    if (!customDate) return { error: 'customDate is required when period is CUSTOM' };
    const custom = new Date(customDate);
    if (Number.isNaN(custom.getTime())) return { error: 'customDate is not a valid date' };
    if (custom.getTime() > Date.now()) return { error: 'Custom date cannot be a future date' };
    if (startOfDay(custom) < startOfDay(casting)) return { error: 'Custom test date cannot be before the casting date' };
    return { toDate: custom };
  }

  if (!PERIOD_DAYS[period]) return { error: `Unknown period ${period}` };
  const toDate = new Date(casting);
  toDate.setDate(toDate.getDate() + PERIOD_DAYS[period]);
  return { toDate };
}

/** SCHEDULED (test date ahead) → DUE (date passed, no result) → RESULT_ADDED (file attached). */
export function cubeTestStatus(ct, now = new Date()) {
  if (ct.fileUrl) return 'RESULT_ADDED';
  return new Date(ct.toDate) <= now ? 'DUE' : 'SCHEDULED';
}

/** Days a DUE test has been waiting for its result. */
export function daysPending(ct, now = new Date()) {
  return Math.max(0, Math.floor((startOfDay(now) - startOfDay(ct.toDate)) / 86400000));
}

export const withStatus = (ct) => ct && { ...ct, status: cubeTestStatus(ct), daysPending: ct.fileUrl ? 0 : daysPending(ct) };
