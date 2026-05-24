import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';

// GET /api/v1/admin/notifications — list admin notifications (paginated)
export async function listNotifications(req, res) {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const where = {
      targetType: 'ADMIN',
      ...(unreadOnly === 'true' && { isRead: false }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      db.notification.count({ where }),
      db.notification.count({ where: { targetType: 'ADMIN', isRead: false } }),
    ]);

    return res.status(200).json({ success: true, data: notifications, total, unreadCount, page: pageNum });
  } catch (error) {
    logger.error('admin listNotifications error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// PUT /api/v1/admin/notifications/:id/read — mark one as read
export async function markRead(req, res) {
  try {
    const { id } = req.params;
    await db.notification.update({ where: { id }, data: { isRead: true } });
    return res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (error) {
    logger.error('admin markRead error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// PUT /api/v1/admin/notifications/read-all — mark all admin notifications as read
export async function markAllRead(req, res) {
  try {
    await db.notification.updateMany({ where: { targetType: 'ADMIN', isRead: false }, data: { isRead: true } });
    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('admin markAllRead error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
