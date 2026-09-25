import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';

export async function getStats(req, res) {
  try {
    const [
      totalClients,
      activeClients,
      totalProjects,
      activeProjects,
      totalOrders,
      newOrders,
      activeOrders,
      completedOrders,
      cancelledOrders,
      totalUsers,
      totalVendors,
      totalLeads,
      recentOrders,
    ] = await Promise.all([
      db.client.count({ where: { isDeleted: false } }),
      db.client.count({ where: { isDeleted: false, status: 'ACTIVE' } }),
      db.project.count({ where: { isDeleted: false } }),
      db.project.count({ where: { isDeleted: false, status: 'ACTIVE' } }),
      db.order.count({ where: { isDeleted: false } }),
      db.order.count({ where: { isDeleted: false, status: 'NEW' } }),
      // 'ACTIVE' is not an OrderStatus — Prisma rejected it and the whole endpoint 500'd.
      db.order.count({ where: { isDeleted: false, status: { in: ['CONFIRMED', 'IN_PROGRESS', 'DELIVERED'] } } }),
      db.order.count({ where: { isDeleted: false, status: 'COMPLETED' } }),
      db.order.count({ where: { isDeleted: false, status: 'CANCELLED' } }),
      db.user.count({ where: { isDeleted: false } }),
      db.vendor.count({ where: { isDeleted: false } }),
      db.lead.count(),
      db.order.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          project: { select: { projectName: true } },
          client: { select: { companyName: true } },
          technicians: {
            where: { isDeleted: false },
            select: { user: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);

    // P2.12 money tiles (tip 15): this month, open balances, overdue 60+, DSO,
    // credit holds, and orders waiting on challans.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [billedMonth, collectedMonth, openBills, holds, completedUnbilled] = await Promise.all([
      db.bill.aggregate({ where: { isDeleted: false, status: { not: 'CANCELLED' }, issueDate: { gte: monthStart } }, _sum: { amount: true } }),
      db.payment.aggregate({ where: { status: 'ACTIVE', receivedOn: { gte: monthStart } }, _sum: { amount: true } }),
      db.bill.findMany({ where: { isDeleted: false, status: { in: ['PENDING', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'] } }, select: { amount: true, dueDate: true, issueDate: true, allocations: { where: { isReversed: false }, select: { amount: true } } } }),
      db.order.count({ where: { isDeleted: false, creditHold: true } }),
      db.order.count({ where: { isDeleted: false, status: 'COMPLETED', bill: null } }),
    ]);
    const bal = (b) => b.amount - b.allocations.reduce((s, a) => s + a.amount, 0);
    const outstanding = openBills.reduce((s, b) => s + bal(b), 0);
    const overdue60 = openBills.filter((b) => b.dueDate && now - new Date(b.dueDate) > 60 * 864e5).reduce((s, b) => s + bal(b), 0);
    const billed90 = (await db.bill.aggregate({ where: { isDeleted: false, status: { not: 'CANCELLED' }, issueDate: { gte: new Date(now - 90 * 864e5) } }, _sum: { amount: true } }))._sum.amount || 0;
    const r2 = (n) => Math.round(n * 100) / 100;
    const money = {
      billedThisMonth: r2(billedMonth._sum.amount || 0),
      collectedThisMonth: r2(collectedMonth._sum.amount || 0),
      outstanding: r2(outstanding),
      overdue60: r2(overdue60),
      dso: billed90 > 0 ? Math.round((outstanding / billed90) * 90) : null,
      creditHolds: holds,
      awaitingChallans: completedUnbilled,
    };

    return res.status(200).json({
      success: true,
      data: {
        money,
        clients: { total: totalClients, active: activeClients },
        projects: { total: totalProjects, active: activeProjects },
        orders: {
          total: totalOrders,
          new: newOrders,
          active: activeOrders,
          completed: completedOrders,
          cancelled: cancelledOrders,
        },
        users: { total: totalUsers },
        vendors: { total: totalVendors },
        leads: { total: totalLeads },
        recentOrders,
      },
    });
  } catch (error) {
    logger.error('getStats error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
