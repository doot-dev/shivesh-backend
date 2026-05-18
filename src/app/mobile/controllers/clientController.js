import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';

// ─── Client profile ───────────────────────────────────────────────────────────

export async function getProfile(req, res) {
  try {
    const clientDbId = req.user.data.id;

    const client = await db.client.findFirst({
      where: { id: clientDbId, isDeleted: false },
      select: {
        clientId: true,
        companyName: true,
        ownerName: true,
        contactNumber: true,
        email: true,
        status: true,
        kycStatus: true,
        address: true,
      },
    });

    if (!client) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    return res.status(200).json({ success: true, data: client });
  } catch (error) {
    logger.error('getClientProfile error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Client projects ──────────────────────────────────────────────────────────

export async function getProjects(req, res) {
  try {
    const clientDbId = req.user.data.id;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const [projects, total] = await Promise.all([
      db.project.findMany({
        where: { clientId: clientDbId, isDeleted: false, status: 'ACTIVE' },
        select: {
          id: true,
          projectId: true,
          projectName: true,
          siteName: true,
          projectLocation: true,
          status: true,
          creditAmount: true,
          creditResetPeriodDays: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      db.project.count({ where: { clientId: clientDbId, isDeleted: false, status: 'ACTIVE' } }),
    ]);

    return res.status(200).json({ success: true, data: projects, total, page: pageNum });
  } catch (error) {
    logger.error('getClientProjects error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Client notifications ─────────────────────────────────────────────────────

export async function getNotifications(req, res) {
  try {
    const clientDbId = req.user.data.id;
    const { page = 1, limit = 30 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const notifications = await db.notification.findMany({
      where: { targetType: 'CLIENT', targetId: clientDbId },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    return res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    logger.error('getClientNotifications error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Mark notification as read ────────────────────────────────────────────────

export async function markNotificationRead(req, res) {
  try {
    const { notificationId } = req.params;
    const clientDbId = req.user.data.id;

    await db.notification.updateMany({
      where: { id: notificationId, targetId: clientDbId, targetType: 'CLIENT' },
      data: { isRead: true },
    });

    return res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    logger.error('markNotificationRead error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
