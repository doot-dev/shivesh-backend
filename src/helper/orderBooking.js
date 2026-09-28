import db from '../config/database.js';
import { getCreditPosition } from './creditPosition.js';
import { productByName } from './productUnits.js';

/**
 * What an order freezes at booking (W2, W38): the agreed rate, the plant's
 * rate and the unit. Later price-list changes never touch an existing order.
 */
export async function bookingSnapshot(projectDbId, productName, productGrade) {
  const pp = await db.projectProduct.findFirst({
    where: { projectId: projectDbId, productName, productGrade },
    include: { vendors: { orderBy: { priority: 'asc' }, take: 1, select: { customPrice: true } } },
  });
  const product = await productByName(productName);
  return {
    rate: pp?.costPrice ?? null,
    vendorRate: pp?.vendors?.[0]?.customPrice ?? null,
    unit: product?.unit ?? 'CBM',
  };
}

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Credit check at booking (W23). Since 2026-09-28 it NEVER holds an order: the
 * people placing it see the credit band and decide among themselves. `warning`
 * is the reason text for anyone allowed to see amounts.
 * @returns {{ hold: false, reason: null, warning: string|null, band: string, position: object }}
 */
export async function creditGate(clientDbId, orderValue) {
  const position = await getCreditPosition(clientDbId);
  let warning = null;
  if (position.flag === 'OVERDUE') {
    warning = `${position.overdueBillCount} bill(s) overdue: ${inr(position.overdueAmount)}, oldest ${position.oldestOverdueDays} days past due`;
  } else if (position.limit > 0 && position.used + (orderValue || 0) > position.limit + position.extra) {
    warning = `Limit ${inr(position.limit + position.extra)} (incl. extra), used ${inr(position.used)}, this order ${inr(orderValue || 0)}`;
  }
  return { hold: false, reason: null, warning, band: position.band, position };
}
