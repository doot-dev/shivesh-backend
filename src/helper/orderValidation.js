import db from '../config/database.js';

/**
 * Checks shared by the client-app and panel order endpoints (W3, W4).
 * Returns an error message, or null when the order line is valid.
 */

// "30", "30.5", "30 m3", "30 CBM" — a positive number, optional unit after it.
const QTY = /^\s*(\d+(?:\.\d{1,3})?)(?:\s*[a-zA-Z³][a-zA-Z0-9³]*)?\s*$/;

export function quantityError(quantity) {
  const m = QTY.exec(String(quantity ?? ''));
  if (!m || !(parseFloat(m[1]) > 0)) return `Quantity "${quantity}" must be a positive number (up to 3 decimals)`;
  return null;
}

/** The product + grade must be priced on this project, or billing fails later. */
export async function priceListError(projectDbId, productName, productGrade) {
  const priced = await db.projectProduct.findFirst({
    where: { projectId: projectDbId, productName, productGrade },
    select: { id: true },
  });
  return priced ? null : `${productName} ${productGrade} is not in this project's price list`;
}
