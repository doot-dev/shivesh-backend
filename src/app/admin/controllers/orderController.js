import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { createActivityLog } from "../../../helper/activityLogger.js";

function buildInclude() {
  return {
    project: {
      select: {
        projectId: true,
        projectName: true,
        siteName: true,
        projectLocation: true,
      },
    },
    client: {
      select: { clientId: true, companyName: true, contactNumber: true },
    },
    assignedTo: {
      select: { id: true, name: true, employeeId: true, phone: true },
    },
    vendor: { select: { id: true, companyName: true } },
    vendorLocation: { select: { id: true, plantName: true, address: true } },
    vendorHandler: { select: { id: true, name: true, phone: true } },
    tmDetails: { where: { isDeleted: false }, orderBy: { createdAt: "asc" } },
    comments: { orderBy: { createdAt: "asc" } },
  };
}

// ─── List orders ──────────────────────────────────────────────────────────────

export async function listOrders(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      clientId,
      assignedToId,
      search,
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const where = {
      isDeleted: false,
      ...(status && { status }),
      ...(assignedToId && { assignedToId: parseInt(assignedToId) }),
      ...(clientId && {
        client: { clientId },
      }),
      ...(search && {
        OR: [
          { orderId: { contains: search } },
          { productName: { contains: search } },
          { project: { projectName: { contains: search } } },
        ],
      }),
    };

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        include: {
          project: {
            select: { projectId: true, projectName: true, siteName: true },
          },
          client: { select: { clientId: true, companyName: true } },
          assignedTo: { select: { id: true, name: true, employeeId: true } },
          _count: { select: { tmDetails: true, comments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      db.order.count({ where }),
    ]);

    return res
      .status(200)
      .json({ success: true, data: orders, total, page: pageNum });
  } catch (error) {
    logger.error("admin listOrders error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}

// ─── Get order detail ─────────────────────────────────────────────────────────

export async function getOrder(req, res) {
  try {
    console.log("getOrder req.params:", req.params);
    const { orderId } = req.params;

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
      include: buildInclude(),
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    logger.error("admin getOrder error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}

// ─── Create order ─────────────────────────────────────────────────────────────

export async function createOrder(req, res) {
  try {
    console.log("post api called");
    const {
      projectId,
      clientId,
      assignedToId,
      vendorId,
      vendorLocationId,
      vendorHandlerId,
      productName,
      productGrade,
      quantity,
      deliveryAddress,
      date,
      time,
    } = req.body;

    console.log("createOrder req.body:", req.body);

    if (!projectId || !clientId || !productName || !productGrade || !quantity) {
      console.log("createOrder validation failed:", {
        projectId,
        clientId,
        productName,
        productGrade,
        quantity,
      });
      return res.status(400).json({
        success: false,
        message:
          "projectId, clientId, productName, productGrade and quantity are required",
      });
    }

    const project = await db.project.findFirst({
      where: { projectId, isDeleted: false },
    });
    console.log("createOrder project lookup:", { projectId, found: !!project });
    if (!project)
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });

    const client = await db.client.findFirst({
      where: { clientId, isDeleted: false },
    });
    console.log("createOrder client lookup:", { clientId, found: !!client });
    if (!client)
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });

    // Generate orderId
    const currentYear = new Date().getFullYear();
    const lastOrder = await db.order.findFirst({
      where: { orderId: { startsWith: `ORD-${currentYear}-` } },
      orderBy: { orderId: "desc" },
    });
    let seq = 1;
    if (lastOrder) {
      seq = parseInt(lastOrder.orderId.split("-")[2]) + 1;
    }
    const orderId = `ORD-${currentYear}-${String(seq).padStart(4, "0")}`;
    console.log(
      "createOrder generated orderId:",
      orderId,
      "lastOrder:",
      lastOrder?.orderId,
    );

    const orderData = {
      orderId,
      projectId: project.id,
      clientId: client.id,
      assignedToId: assignedToId ? parseInt(assignedToId) : null,
      vendorId: vendorId ? parseInt(vendorId) : null,
      vendorLocationId: vendorLocationId ? parseInt(vendorLocationId) : null,
      vendorHandlerId: vendorHandlerId ? parseInt(vendorHandlerId) : null,
      productName,
      productGrade,
      quantity,
      deliveryAddress: deliveryAddress || null,
      date: date || null,
      time: time || null,
      status: "NEW",
      deliveryStatus: "ASSIGNED",
    };
    console.log("createOrder data to insert:", orderData);

    const order = await db.order.create({ data: orderData });
    console.log("createOrder created order:", order);

    // Notify client
    await db.notification.create({
      data: {
        targetType: "CLIENT",
        targetId: client.id,
        title: "New Order Created",
        message: `Order ${orderId} has been created for ${productName} ${productGrade} (${quantity})`,
        type: "ORDER_CREATED",
        relatedId: order.id,
        orderId: order.id,
      },
    });

    // Notify field tech if assigned
    if (assignedToId) {
      await db.notification.create({
        data: {
          targetType: "FIELD_TECH",
          targetId: String(assignedToId),
          title: "New Order Assigned",
          message: `You have been assigned to order ${orderId} — ${productName} ${productGrade} (${quantity})`,
          type: "ORDER_CREATED",
          relatedId: order.id,
          orderId: order.id,
        },
      });
    }

    await createActivityLog({
      title: "Order created",
      description: `Order ${orderId} created for project ${projectId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    return res.status(201).json({
      success: true,
      message: "Order created",
      data: { orderId: order.orderId, id: order.id },
    });
  } catch (error) {
    console.log("createOrder error:", error);
    logger.error("admin createOrder error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}

// ─── Update order ─────────────────────────────────────────────────────────────

export async function updateOrder(req, res) {
  try {
    const { orderId } = req.params;
    const {
      assignedToId,
      status,
      deliveryStatus,
      vendorId,
      vendorLocationId,
      vendorHandlerId,
      date,
      time,
      deliveryAddress,
    } = req.body;

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        ...(assignedToId !== undefined && {
          assignedToId: assignedToId ? parseInt(assignedToId) : null,
        }),
        ...(status && { status }),
        ...(deliveryStatus && { deliveryStatus }),
        ...(vendorId !== undefined && {
          vendorId: vendorId ? parseInt(vendorId) : null,
        }),
        ...(vendorLocationId !== undefined && {
          vendorLocationId: vendorLocationId
            ? parseInt(vendorLocationId)
            : null,
        }),
        ...(vendorHandlerId !== undefined && {
          vendorHandlerId: vendorHandlerId ? parseInt(vendorHandlerId) : null,
        }),
        ...(date !== undefined && { date }),
        ...(time !== undefined && { time }),
        ...(deliveryAddress !== undefined && { deliveryAddress }),
      },
    });

    // Notify field tech if newly assigned
    if (assignedToId && assignedToId !== order.assignedToId) {
      await db.notification.create({
        data: {
          targetType: "FIELD_TECH",
          targetId: String(assignedToId),
          title: "Order Assigned",
          message: `You have been assigned to order ${orderId}`,
          type: "ORDER_CREATED",
          relatedId: order.id,
          orderId: order.id,
        },
      });
    }

    await createActivityLog({
      title: "Order updated",
      description: `Order ${orderId} was updated`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    return res
      .status(200)
      .json({ success: true, message: "Order updated", data: updated });
  } catch (error) {
    logger.error("admin updateOrder error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}

// ─── Delete order (soft) ──────────────────────────────────────────────────────

export async function deleteOrder(req, res) {
  try {
    const { orderId } = req.params;

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    await db.order.update({
      where: { id: order.id },
      data: { isDeleted: true },
    });

    return res.status(200).json({ success: true, message: "Order deleted" });
  } catch (error) {
    logger.error("admin deleteOrder error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}

// ─── Add admin comment ────────────────────────────────────────────────────────

export async function addComment(req, res) {
  try {
    const { orderId } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Message is required" });
    }

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    const userData = req.user?.data;
    const comment = await db.orderComment.create({
      data: {
        orderId: order.id,
        message: message.trim(),
        authorType: "ADMIN",
        authorId: String(userData?.id || 0),
        authorName: userData?.userName || "Admin",
      },
    });

    // Notify client and field tech
    const notifyTargets = [
      { type: "CLIENT", id: order.clientId },
      ...(order.assignedToId
        ? [{ type: "FIELD_TECH", id: String(order.assignedToId) }]
        : []),
    ];

    await Promise.all(
      notifyTargets.map((t) =>
        db.notification.create({
          data: {
            targetType: t.type,
            targetId: t.id,
            title: "New Comment from Admin",
            message: `Admin commented on order ${orderId}`,
            type: "COMMENT_ADDED",
            relatedId: order.id,
            orderId: order.id,
          },
        }),
      ),
    );

    return res.status(201).json({ success: true, data: comment });
  } catch (error) {
    logger.error("admin addComment error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}

// ─── List field technicians ───────────────────────────────────────────────────

export async function listFieldTechs(req, res) {
  try {
    const techs = await db.user.findMany({
      where: { role: "FIELD_TECHNICIAN", isDeleted: false, status: true },
      select: { id: true, name: true, employeeId: true, phone: true },
      orderBy: { name: "asc" },
    });

    return res.status(200).json({ success: true, data: techs });
  } catch (error) {
    logger.error("listFieldTechs error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}
