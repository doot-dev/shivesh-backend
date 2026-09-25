/**
 * List filters by date: ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD, both optional
 * and inclusive. Bad values are ignored (same as the existing list endpoints),
 * so a malformed query widens the list rather than erroring.
 *
 * Days are local server days — the backend runs in Asia/Kolkata — so "today"
 * means the IST business day, not UTC.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const valid = (s) => typeof s === 'string' && ISO.test(s) ? s : null;
const day = (iso, plus = 0) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d + plus); };

/** For YYYY-MM-DD string columns (Order.date): lexicographic = chronological. */
export function isoDayRange(dateFrom, dateTo) {
  const from = valid(dateFrom), to = valid(dateTo);
  if (!from && !to) return undefined;
  return { ...(from && { gte: from }), ...(to && { lte: to }) };
}

/** For DateTime columns: from the start of dateFrom to the end of dateTo. */
export function dateTimeDayRange(dateFrom, dateTo) {
  const from = valid(dateFrom), to = valid(dateTo);
  if (!from && !to) return undefined;
  return { ...(from && { gte: day(from) }), ...(to && { lt: day(to, 1) }) };
}
