import db from '../../../config/database.js';
import { dateTimeDayRange } from '../../../helper/dateRange.js';
import { buildLedger } from '../../admin/controllers/paymentController.js';
import { getCreditPosition } from '../../../helper/creditPosition.js';
import { buildInvoicePdf } from '../../../helper/invoicePdf.js';
import { productByName } from '../../../helper/productUnits.js';
import { invoiceOrderInclude } from '../../admin/controllers/billController.js';
import logger from '../../../helper/logger.js';
import { projectScope, orderProjectScope, contactMaySee } from '../../../helper/clientAccess.js';
import {
  registerDeviceToken,
  removeDeviceToken,
  MAX_DEVICES_PER_USER,
} from '../../../helper/deviceTokenHelper.js';

// ─── Client profile ───────────────────────────────────────────────────────────

/**
 * Register this device's FCM token against the signed-in client.
 * Capped at MAX_DEVICES_PER_USER devices — a 6th login evicts the oldest.
 */
export async function registerFcmToken(req, res) {
  try {
    const clientDbId = req.user.data.id;
    const { token, platform = 'android' } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }

    // docs/06: pushes go per person, so each phone only gets what its role allows.
    const contactId = req.clientAccess.contact?.id;
    const { deviceCount } = await registerDeviceToken({
      token,
      platform,
      targetType: contactId ? 'CLIENT_CONTACT' : 'CLIENT',
      targetId: contactId ?? clientDbId,
    });

    return res.status(200).json({
      success: true,
      message: 'FCM token registered',
      data: { deviceCount, maxDevices: MAX_DEVICES_PER_USER },
    });
  } catch (error) {
    logger.error('registerFcmToken error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

/**
 * Unregister this device on logout so a signed-out phone stops receiving pushes
 * and frees one of the client's device slots.
 */
export async function unregisterFcmToken(req, res) {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }

    await removeDeviceToken(token);

    return res.status(200).json({ success: true, message: 'FCM token removed' });
  } catch (error) {
    logger.error('unregisterFcmToken error:', error);
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

    const where = { clientId: clientDbId, isDeleted: false, status: 'ACTIVE', ...projectScope(req.clientAccess) };
    const [projects, total] = await Promise.all([
      db.project.findMany({
        where,
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
      db.project.count({ where }),
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

    // Verify project belongs to this client (and to this contact's projects)
    const project = await db.project.findFirst({
      where: { projectId, clientId: clientDbId, isDeleted: false, ...projectScope(req.clientAccess) },
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

    // W38: each product carries its unit so the app stops assuming "m3".
    const units = Object.fromEntries(
      (await db.product.findMany({
        where: { name: { in: [...new Set(products.map((p) => p.productName))] }, isDeleted: false },
        select: { name: true, unit: true, isConcrete: true },
      })).map((p) => [p.name, p]),
    );
    const data = products.map((p) => ({
      ...p,
      unit: units[p.productName]?.unit ?? 'CBM',
      isConcrete: units[p.productName]?.isConcrete ?? true,
    }));

    return res.status(200).json({ success: true, data });
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
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    // Sub-category used to be appended to the grade name here. It now lives on
    // the project product (chosen from the Subcategory master), so a grade is
    // just its own name again.
    const grades = sizes.map((s) => s.name);

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
      where: { projectId, clientId: clientDbId, isDeleted: false, ...projectScope(req.clientAccess) },
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

    // ponytail: one feed per client, filtered per contact after the page is read,
    // so a scoped contact can get a short page. Store per-contact rows if that bites.
    const rows = await db.notification.findMany({
      where: { targetType: 'CLIENT', targetId: clientDbId },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: { order: { select: { projectId: true, placedByContactId: true } } },
    });
    const data = rows
      .filter((n) => contactMaySee(req.clientAccess, { type: n.type, order: n.order }))
      .map(({ order, ...n }) => n);

    return res.status(200).json({ success: true, data });
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

// ─── Client money: credit, bills, invoice (P1.14, P1.16) ─────────────────────

/** GET /client/credit — the client's real credit position (replaces the fake app figures, W17). */
export async function getCredit(req, res) {
  try {
    return res.status(200).json({ success: true, data: await getCreditPosition(req.user.data.id) });
  } catch (error) {
    logger.error('getCredit error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

// Drafts (PENDING) are the office's working copy; the client sees issued bills.
const CLIENT_BILL_STATUSES = ['SENT', 'PAID', 'OVERDUE', 'PARTIALLY_PAID'];

/** GET /client/bills?projectId= — the client's issued bills (W16). */
export async function listBills(req, res) {
  try {
    const { projectId, dateFrom, dateTo } = req.query;
    const issued = dateTimeDayRange(dateFrom, dateTo);
    const bills = await db.bill.findMany({
      where: {
        isDeleted: false,
        ...(issued && { issueDate: issued }),
        status: { in: CLIENT_BILL_STATUSES },
        order: { clientId: req.user.data.id, isDeleted: false, ...orderProjectScope(req.clientAccess), ...(projectId && { project: { projectId } }) },
      },
      orderBy: { issueDate: 'desc' },
      select: {
        billNo: true, quantity: true, rate: true, amount: true, status: true, issueDate: true, dueDate: true, paidAt: true,
        allocations: { where: { isReversed: false }, select: { amount: true } },
        order: { select: { orderId: true, productName: true, productGrade: true, project: { select: { projectId: true, projectName: true, siteName: true } } } },
      },
    });
    const now = new Date();
    const data = bills.map(({ allocations, ...b }) => ({
      ...b,
      paid: Math.round(allocations.reduce((s, x) => s + x.amount, 0) * 100) / 100,
      balance: Math.round((b.amount - allocations.reduce((s, x) => s + x.amount, 0)) * 100) / 100,
      daysOverdue: b.status !== 'PAID' && b.dueDate && new Date(b.dueDate) < now ? Math.floor((now - new Date(b.dueDate)) / 864e5) : 0,
    }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('listBills error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

/** GET /client/bills/:billNo/invoice — the invoice PDF, only for the client's own issued bill. */
export async function downloadBillInvoice(req, res) {
  try {
    const bill = await db.bill.findFirst({
      where: { billNo: req.params.billNo, isDeleted: false, status: { in: CLIENT_BILL_STATUSES }, order: { clientId: req.user.data.id, ...orderProjectScope(req.clientAccess) } },
    });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    const order = await db.order.findFirst({ where: { id: bill.orderId }, include: invoiceOrderInclude() });
    order.unit = (await productByName(order.productName))?.unit;
    const pdf = await buildInvoicePdf(bill, order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bill.billNo}.pdf"`);
    return res.send(Buffer.from(pdf));
  } catch (error) {
    logger.error('downloadBillInvoice error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

/** GET /client/payments — the client's recorded payments (read-only). */
export async function listPayments(req, res) {
  try {
    const payments = await db.payment.findMany({
      where: { clientId: req.user.data.id, status: 'ACTIVE' },
      orderBy: { receivedOn: 'desc' },
      select: { receiptNo: true, amount: true, receivedOn: true, mode: true, reference: true, allocations: { where: { isReversed: false }, select: { amount: true, bill: { select: { billNo: true } } } } },
    });
    return res.status(200).json({ success: true, data: payments });
  } catch (error) {
    logger.error('listPayments error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

/** GET /client/ledger — bills (Dr) and payments (Cr) with a running balance. */
export async function getLedger(req, res) {
  try {
    return res.status(200).json({ success: true, data: await buildLedger(req.user.data.id, req.query) });
  } catch (error) {
    logger.error('getLedger error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
