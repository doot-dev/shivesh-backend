import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';

// ─── Tech profile ─────────────────────────────────────────────────────────────

export async function getProfile(req, res) {
  try {
    const userId = req.user.data.id;

    const user = await db.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: {
        id: true,
        name: true,
        employeeId: true,
        phone: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    logger.error('getTechProfile error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Tech notifications ───────────────────────────────────────────────────────

export async function getNotifications(req, res) {
  try {
    const userId = req.user.data.id;
    const { type = 'all', page = 1, limit = 30 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const where = {
      targetType: 'FIELD_TECH',
      targetId: String(userId),
      ...(type === 'reminder' && { type: 'REMINDER' }),
      ...(type === 'general' && { type: { not: 'REMINDER' } }),
    };

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    return res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    logger.error('getTechNotifications error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// ─── Mark notification read ───────────────────────────────────────────────────

export async function markNotificationRead(req, res) {
  try {
    const { notificationId } = req.params;
    const userId = req.user.data.id;

    await db.notification.updateMany({
      where: { id: notificationId, targetId: String(userId), targetType: 'FIELD_TECH' },
      data: { isRead: true },
    });

    return res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    logger.error('markNotificationRead error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
