import db from "../config/database.js";
import logger from "./logger.js";

/**
 * Write one audit row (W31/W33).
 *
 * Old callers pass { title, description, entityType, entityId, action,
 * createdById } and keep working. New fields: event (BILL_GENERATED,
 * PAYMENT_RECORDED …), actorType (USER | CLIENT | SYSTEM), actorId, source
 * (PANEL | CLIENT_APP | FIELD_APP | SYSTEM), billId, paymentId, orderRef,
 * clientRef, before, after.
 *
 * Best-effort by default (a failure is logged loudly, never thrown). Money
 * actions pass `tx` (a Prisma transaction client) and `strict: true` so the log
 * row commits — or fails — together with the change it records.
 */
export const createActivityLog = async ({ tx, strict = false, ...fields }) => {
  const data = {
    ...fields,
    createdById: fields.createdById ? Number(fields.createdById) : null,
    actorType: fields.actorType ?? (fields.createdById ? "USER" : "SYSTEM"),
    actorId: fields.actorId ?? (fields.createdById ? String(fields.createdById) : null),
  };
  try {
    return await (tx || db).activity.create({ data });
  } catch (error) {
    if (strict) throw error;
    // Still best-effort, but loud: a lost audit row must show in the logs (W33).
    logger.error(`Activity log NOT saved (${fields.title}): ${error.message}`);
  }
};
