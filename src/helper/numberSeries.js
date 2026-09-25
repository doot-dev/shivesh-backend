/**
 * Locked number series (G3/G20). Each (series, fy) row is incremented with an
 * atomic upsert inside the caller's transaction, so two users can never get
 * the same number. Receipts use it now; FY invoice numbers join in Phase 3.
 */

/** "26-27" for 25 Sep 2026 (financial year April–March, server time = IST). */
export function fyLabel(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}

/** Next number in the series, e.g. nextNumber(tx, 'SHV-RC') → "SHV-RC/26-27/0001". */
export async function nextNumber(tx, series, date = new Date()) {
  const fy = fyLabel(date);
  await tx.$executeRaw`INSERT INTO InvoiceCounter (series, fy, next) VALUES (${series}, ${fy}, 1)
    ON DUPLICATE KEY UPDATE next = next + 1`;
  const row = await tx.invoiceCounter.findUnique({ where: { series_fy: { series, fy } } });
  return `${series}/${fy}/${String(row.next).padStart(4, '0')}`;
}
