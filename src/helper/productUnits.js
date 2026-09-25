import db from '../config/database.js';

/**
 * Units a product can be sold in (W38). Shivesh trades many materials, not only
 * RMC, so the unit comes from the product instead of a hard-coded "m3".
 */
export const PRODUCT_UNITS = ['CBM', 'NOS', 'MT', 'KG', 'BAG', 'RMT', 'SQM', 'LTR'];

/** The product master row behind an order's productName (name is how orders link to it). */
export function productByName(name) {
  return db.product.findFirst({
    where: { name, isDeleted: false },
    select: { unit: true, isConcrete: true },
  });
}
