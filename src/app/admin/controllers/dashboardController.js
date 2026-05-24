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
      db.order.count({ where: { isDeleted: false, status: 'ACTIVE' } }),
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
          assignedTo: { select: { name: true } },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
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
