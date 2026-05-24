import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';

// ─── Client profile ───────────────────────────────────────────────────────────

export async function registerFcmToken(req, res) {
  try {
    const clientDbId = req.user.data.id;
    const { token, platform = 'android' } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }

    await db.deviceToken.upsert({
      where: { token },
      update: { targetType: 'CLIENT', targetId: clientDbId, platform },
      create: { token, platform, targetType: 'CLIENT', targetId: clientDbId },
    });

    return res.status(200).json({ success: true, message: 'FCM token registered' });
  } catch (error) {
    logger.error('registerFcmToken error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

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
// ─── Products for order creation ─────────────────────────────────────────────

export async function getProjectProducts(req, res) {
  try {
    const clientDbId = req.user.data.id;
    const { projectId } = req.params;

    // Verify project belongs to this client
    const project = await db.project.findFirst({
      where: { projectId, clientId: clientDbId, isDeleted: false },
      select: { id: true },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const products = await db.projectProduct.findMany({
      where: { projectId: project.id },
      select: { productName: true, productGrade: true },
      orderBy: { productName: 'asc' },
    });

    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    logger.error('getProjectProducts error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

export async function getProductNames(req, res) {
  try {
    const products = await db.product.findMany({
      where: { isActive: true, isDeleted: false },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    return res.status(200).json({
      success: true,
      data: products.map((p) => p.name),
    });
  } catch (error) {
    logger.error('getProductNames error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

export async function getProductGrades(req, res) {
  try {
    const { productName } = req.params;

    const sizes = await db.size.findMany({
      where: {
        isActive: true,
        Product: { name: productName, isActive: true, isDeleted: false },
      },
      select: { name: true, subcategory: true },
      orderBy: { name: 'asc' },
    });

    const grades = sizes.map((s) =>
      s.subcategory ? `${s.name} ${s.subcategory}`.trim() : s.name,
    );

    return res.status(200).json({ success: true, data: grades });
  } catch (error) {
    logger.error('getProductGrades error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
// ─── Single project detail ───────────────────────────────────────────────────

export async function getProjectDetail(req, res) {
  try {
    const clientDbId = req.user.data.id;
    const { projectId } = req.params;

    const project = await db.project.findFirst({
      where: { projectId, clientId: clientDbId, isDeleted: false },
      select: {
        id: true,
        projectId: true,
        projectName: true,
        siteName: true,
        projectLocation: true,
        projectManager: true,
        address: true,
        status: true,
        creditAmount: true,
        creditResetPeriodDays: true,
        createdAt: true,
      },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    return res.status(200).json({ success: true, data: project });
  } catch (error) {
    logger.error('getProjectDetail error:', error);
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
