import db from '../config/database.js';
import { sendNotification } from './notificationHelper.js';

/**
 * Which orders a field technician works on (2026-09-28): every order of every
 * project they are on, plus any order naming them as its contact person
 * (OrderTechnician). Every tech route, the socket and the push fan-out use this.
 */

/** Spread into a Prisma Order `where`. AND, so it never clashes with a search OR. */
export const techOrderScope = (userId) => ({
  AND: [{
    OR: [
      { technicians: { some: { userId: Number(userId), isDeleted: false } } },
      { project: { technicians: { some: { userId: Number(userId) } } } },
    ],
  }],
});

/** userIds of everyone who works an order: project techs + contact persons. */
export async function orderTechUserIds(orderDbId) {
  const order = await db.order.findUnique({
    where: { id: orderDbId },
    select: {
      technicians: { where: { isDeleted: false }, select: { userId: true } },
      project: { select: { technicians: { select: { userId: true } } } },
    },
  });
  if (!order) return [];
  return [...new Set([...order.technicians, ...order.project.technicians].map((t) => t.userId))];
}

/**
 * New order → push to every FT on its project (2026-09-28), except the tech
 * who placed it. Returns their ids for the socket emit.
 */
export async function notifyProjectTechsOfNewOrder(order, { exceptUserId = null } = {}) {
  const ids = (await orderTechUserIds(order.id)).filter((id) => id !== Number(exceptUserId));
  const who = order.client?.companyName ? ` by ${order.client.companyName}` : '';
  await Promise.all(ids.map((id) => sendNotification({
    targetType: 'FIELD_TECH',
    targetId: String(id),
    title: 'New order',
    message: `${order.orderId}${who}: ${order.productName} ${order.productGrade}, ${order.quantity} on ${order.date ?? 'date TBD'}`,
    type: 'ORDER_CREATED',
    relatedId: order.id,
    orderId: order.id,
  })));
  return ids;
}
