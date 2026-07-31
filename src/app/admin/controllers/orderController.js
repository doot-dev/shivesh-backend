import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { validatorFunction } from "../../../helper/validate.js";
import {
  updateOrderValidation,
  updateOrderStatusValidation,
  createOrderVendorValidation,
  updateOrderVendorValidation,
  createOrderTechnicianValidation,
  updateOrderTechnicianValidation,
} from "../validations/orderValidation.js";
import { createActivityLog } from "../../../helper/activityLogger.js";

function buildVendorInclude() {
  return {
    where: { isDeleted: false },
    orderBy: { createdAt: "asc" },
    include: {
      vendor: {
        select: { id: true, companyName: true, ownerName: true, phone: true },
      },
      vendorLocation: { select: { id: true, plantName: true, address: true } },
      vendorHandler: { select: { id: true, name: true, phone: true } },
    },
  };
}

function buildTechnicianInclude() {
  return {
    where: { isDeleted: false },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, employeeId: true, phone: true } },
    },
  };
}

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
    vendors: buildVendorInclude(),
    technicians: buildTechnicianInclude(),
    tmDetails: { where: { isDeleted: false }, orderBy: { createdAt: "asc" } },
    comments: { orderBy: { createdAt: "asc" } },
  };
}

/**
 * Resolve a vendor + location + handler triple, checking that each exists and
 * that the location and handler actually belong to the vendor above them.
 * Returns { error } with a ready-to-send message when anything does not line up.
 */
async function resolveVendorSelection({
  vendorId,
  vendorLocationId,
  vendorHandlerId,
}) {
  const vendor = await db.vendor.findFirst({
    where: { id: parseInt(vendorId), isDeleted: false },
  });

  if (!vendor) {
    return { error: "Vendor not found" };
  }

  let location = null;
  if (
    vendorLocationId !== undefined &&
    vendorLocationId !== null &&
    vendorLocationId !== ""
  ) {
    location = await db.vendorLocation.findFirst({
      where: { id: parseInt(vendorLocationId), isDeleted: false },
    });

    if (!location) {
      return { error: "Vendor location not found" };
    }

    if (location.vendorId !== vendor.id) {
      return { error: "Vendor location does not belong to this vendor" };
    }
  }

  let handler = null;
  if (
    vendorHandlerId !== undefined &&
    vendorHandlerId !== null &&
    vendorHandlerId !== ""
  ) {
    handler = await db.vendorHandler.findFirst({
      where: { id: parseInt(vendorHandlerId), isDeleted: false },
    });

    if (!handler) {
      return { error: "Vendor handler not found" };
    }

    if (!location || handler.vendorLocationId !== location.id) {
      return {
        error: "Vendor handler does not belong to this vendor location",
      };
    }
  }

  return { vendor, location, handler };
}

/**
 * Notify every field technician currently assigned to an order.
 */
async function notifyOrderTechnicians(order, { title, message, type }) {
  const technicians = await db.orderTechnician.findMany({
    where: { orderId: order.id, isDeleted: false },
    select: { userId: true },
  });

  await Promise.all(
    technicians.map((t) =>
      db.notification.create({
        data: {
          targetType: "FIELD_TECH",
          targetId: String(t.userId),
          title,
          message,
          type,
          relatedId: order.id,
          orderId: order.id,
        },
      }),
    ),
  );
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
      ...(status ? { status } : { status: { not: "COMPLETED" } }),
      ...(assignedToId && {
        technicians: {
          some: { userId: parseInt(assignedToId), isDeleted: false },
        },
      }),
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
          vendors: buildVendorInclude(),
          technicians: buildTechnicianInclude(),
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
      vendors = [],
      technicians = [],
      productName,
      productGrade,
      quantity,
      deliveryAddress,
      date,
      time,
    } = req.body;

    console.log("createOrder req.body:", req.body);

    if (!projectId || !clientId || !productName || !productGrade || !quantity) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "projectId, clientId, productName, productGrade and quantity are required",
        });
    }

    if (!Array.isArray(vendors) || !Array.isArray(technicians)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "vendors and technicians must be arrays",
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
    if (!client)
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });

    // Validate every vendor and technician before creating anything, so a bad
    // entry cannot leave a half-populated order behind.
    const vendorRows = [];
    for (const v of vendors) {
      if (!v?.vendorId) {
        return res
          .status(400)
          .json({ success: false, message: "Each vendor requires a vendorId" });
      }

      const { error, vendor, location, handler } =
        await resolveVendorSelection(v);
      if (error)
        return res.status(404).json({ success: false, message: error });

      vendorRows.push({
        vendorId: vendor.id,
        vendorLocationId: location?.id ?? null,
        vendorHandlerId: handler?.id ?? null,
      });
    }

    const technicianIds = [
      ...new Set(technicians.map((t) => parseInt(t?.userId ?? t))),
    ];
    if (technicianIds.some((id) => Number.isNaN(id))) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Each technician requires a numeric userId",
        });
    }

    if (technicianIds.length) {
      const found = await db.user.findMany({
        where: {
          id: { in: technicianIds },
          role: "FIELD_TECHNICIAN",
          isDeleted: false,
        },
        select: { id: true },
      });

      if (found.length !== technicianIds.length) {
        return res
          .status(404)
          .json({
            success: false,
            message: "One or more field technicians not found",
          });
      }
    }

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

    const order = await db.order.create({
      data: {
        orderId,
        projectId: project.id,
        clientId: client.id,
        productName,
        productGrade,
        quantity,
        deliveryAddress: deliveryAddress || null,
        date: date || null,
        time: time || null,
        status: "NEW",
        deliveryStatus: "ASSIGNED",
        ...(vendorRows.length && { vendors: { create: vendorRows } }),
        ...(technicianIds.length && {
          technicians: { create: technicianIds.map((userId) => ({ userId })) },
        }),
      },
      include: buildInclude(),
    });

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

    // Notify every assigned field tech
    await notifyOrderTechnicians(order, {
      title: "New Order Assigned",
      message: `You have been assigned to order ${orderId} — ${productName} ${productGrade} (${quantity})`,
      type: "ORDER_CREATED",
    });

    await createActivityLog({
      title: "Order created",
      description: `Order ${orderId} created for project ${projectId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    return res
      .status(201)
      .json({ success: true, message: "Order created", data: order });
  } catch (error) {
    console.log("createOrder error:", error);
    logger.error("admin createOrder error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}

// ─── Update order ─────────────────────────────────────────────────────────────

/**
 * Update an order's summary. Project, client, vendors and technicians are
 * deliberately not editable here — vendors and technicians have their own
 * add/update/delete endpoints below.
 */
export async function updateOrder(req, res) {
  try {
    const { orderId } = req.params;
    const { err, status: validationStatus } = await validatorFunction(
      { ...req.body, orderId },
      updateOrderValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { productName, productGrade, quantity, deliveryAddress, date, time } =
      req.body;

    logger.info(`Updating order summary: ${orderId}`);

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
        ...(productName && { productName }),
        ...(productGrade && { productGrade }),
        ...(quantity && { quantity }),
        ...(deliveryAddress !== undefined && { deliveryAddress }),
        ...(date !== undefined && { date }),
        ...(time !== undefined && { time }),
      },
      include: buildInclude(),
    });

    await notifyOrderTechnicians(order, {
      title: "Order Updated",
      message: `Order ${orderId} has been updated`,
      type: "STATUS_UPDATED",
    });

    await createActivityLog({
      title: "Order updated",
      description: `Order ${orderId} summary was updated`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Order summary updated successfully: ${orderId}`);

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

/**
 * Update an order's status / delivery status.
 */
export async function updateOrderStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { err, status: validationStatus } = await validatorFunction(
      { ...req.body, orderId },
      updateOrderStatusValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { status, deliveryStatus } = req.body;

    if (!status && !deliveryStatus) {
      return res
        .status(400)
        .json({
          success: false,
          message: "status or deliveryStatus is required",
        });
    }

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
        ...(status && { status }),
        ...(deliveryStatus && { deliveryStatus }),
      },
      include: buildInclude(),
    });

    await notifyOrderTechnicians(order, {
      title: "Order Status Updated",
      message: `Order ${orderId} is now ${status || deliveryStatus}`,
      type: "STATUS_UPDATED",
    });

    await createActivityLog({
      title: "Order status updated",
      description: `Order ${orderId} status changed to ${status || deliveryStatus}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "STATUS_CHANGED",
      createdById: Number(req.user?.data?.id) || null,
    });

    return res
      .status(200)
      .json({ success: true, message: "Order status updated", data: updated });
  } catch (error) {
    logger.error("admin updateOrderStatus error:", error);
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

    // Notify client and every assigned field tech
    await db.notification.create({
      data: {
        targetType: "CLIENT",
        targetId: order.clientId,
        title: "New Comment from Admin",
        message: `Admin commented on order ${orderId}`,
        type: "COMMENT_ADDED",
        relatedId: order.id,
        orderId: order.id,
      },
    });

    await notifyOrderTechnicians(order, {
      title: "New Comment from Admin",
      message: `Admin commented on order ${orderId}`,
      type: "COMMENT_ADDED",
    });

    return res.status(201).json({ success: true, data: comment });
  } catch (error) {
    logger.error("admin addComment error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}

// ─── Order vendors ────────────────────────────────────────────────────────────

/**
 * Add a vendor to an order
 */
export const createOrderVendor = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(
      req.body,
      createOrderVendorValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { orderId, vendorId, vendorLocationId, vendorHandlerId } = req.body;

    logger.info(`Adding vendor: ${vendorId} to order: ${orderId}`);

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const { error, vendor, location, handler } = await resolveVendorSelection({
      vendorId,
      vendorLocationId,
      vendorHandlerId,
    });

    if (error) {
      return res.status(404).json({ success: false, message: error });
    }

    // The same vendor may supply an order from two different plants, so only a
    // repeat of the exact vendor+location pairing is a duplicate.
    const duplicate = await db.orderVendor.findFirst({
      where: {
        orderId: order.id,
        vendorId: vendor.id,
        vendorLocationId: location?.id ?? null,
        isDeleted: false,
      },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "This vendor is already added to the order for that location",
      });
    }

    const orderVendor = await db.orderVendor.create({
      data: {
        orderId: order.id,
        vendorId: vendor.id,
        vendorLocationId: location?.id ?? null,
        vendorHandlerId: handler?.id ?? null,
      },
      include: buildVendorInclude().include,
    });

    await createActivityLog({
      title: "Vendor added to order",
      description: `Vendor ${vendor.companyName} added to order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Vendor added to order successfully: ${orderVendor.id}`);

    return res.status(201).json({
      success: true,
      message: "Vendor added successfully",
      data: orderVendor,
    });
  } catch (error) {
    logger.error("Error adding vendor to order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add vendor",
      error: error.message,
    });
  }
};

/**
 * Get all vendors on an order
 */
export const getOrderVendors = async (req, res) => {
  try {
    const { orderId } = req.params;

    logger.info(`Fetching vendors for order: ${orderId}`);

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const vendors = await db.orderVendor.findMany({
      where: { orderId: order.id, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: buildVendorInclude().include,
    });

    return res.status(200).json({ success: true, data: vendors });
  } catch (error) {
    logger.error("Error fetching order vendors:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendors",
      error: error.message,
    });
  }
};

/**
 * Update a vendor on an order
 */
export const updateOrderVendor = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(
      req.body,
      updateOrderVendorValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const {
      orderVendorId,
      orderId,
      vendorId,
      vendorLocationId,
      vendorHandlerId,
    } = req.body;

    logger.info(`Updating vendor: ${orderVendorId} on order: ${orderId}`);

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const existing = await db.orderVendor.findFirst({
      where: { id: orderVendorId, orderId: order.id, isDeleted: false },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Order vendor not found" });
    }

    // Re-validate the whole triple: changing the vendor without changing the
    // location would otherwise leave a location pointing at the wrong vendor.
    const { error, vendor, location, handler } = await resolveVendorSelection({
      vendorId: vendorId ?? existing.vendorId,
      vendorLocationId:
        vendorLocationId !== undefined
          ? vendorLocationId
          : existing.vendorLocationId,
      vendorHandlerId:
        vendorHandlerId !== undefined
          ? vendorHandlerId
          : existing.vendorHandlerId,
    });

    if (error) {
      return res.status(404).json({ success: false, message: error });
    }

    const updated = await db.orderVendor.update({
      where: { id: orderVendorId },
      data: {
        vendorId: vendor.id,
        vendorLocationId: location?.id ?? null,
        vendorHandlerId: handler?.id ?? null,
      },
      include: buildVendorInclude().include,
    });

    await createActivityLog({
      title: "Order vendor updated",
      description: `Vendor ${vendor.companyName} updated on order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Order vendor updated successfully: ${orderVendorId}`);

    return res.status(200).json({
      success: true,
      message: "Vendor updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating order vendor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update vendor",
      error: error.message,
    });
  }
};

/**
 * Remove a vendor from an order (soft)
 */
export const deleteOrderVendor = async (req, res) => {
  try {
    const { orderId, orderVendorId } = req.params;

    logger.info(`Deleting vendor: ${orderVendorId} from order: ${orderId}`);

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const orderVendor = await db.orderVendor.findFirst({
      where: { id: orderVendorId, orderId: order.id, isDeleted: false },
      include: { vendor: { select: { companyName: true } } },
    });

    if (!orderVendor) {
      return res
        .status(404)
        .json({ success: false, message: "Order vendor not found" });
    }

    await db.orderVendor.update({
      where: { id: orderVendorId },
      data: { isDeleted: true },
    });

    await createActivityLog({
      title: "Vendor removed from order",
      description: `Vendor ${orderVendor.vendor.companyName} removed from order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Order vendor deleted successfully: ${orderVendorId}`);

    return res
      .status(200)
      .json({ success: true, message: "Vendor removed successfully" });
  } catch (error) {
    logger.error("Error deleting order vendor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove vendor",
      error: error.message,
    });
  }
};

// ─── Order technicians ────────────────────────────────────────────────────────

/**
 * Assign a field technician to an order
 */
export const createOrderTechnician = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(
      req.body,
      createOrderTechnicianValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { orderId, userId } = req.body;

    logger.info(`Assigning technician: ${userId} to order: ${orderId}`);

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const technician = await db.user.findFirst({
      where: {
        id: parseInt(userId),
        role: "FIELD_TECHNICIAN",
        isDeleted: false,
      },
    });

    if (!technician) {
      return res
        .status(404)
        .json({ success: false, message: "Field technician not found" });
    }

    const duplicate = await db.orderTechnician.findFirst({
      where: { orderId: order.id, userId: technician.id, isDeleted: false },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "This technician is already assigned to the order",
      });
    }

    const orderTechnician = await db.orderTechnician.create({
      data: { orderId: order.id, userId: technician.id },
      include: buildTechnicianInclude().include,
    });

    await db.notification.create({
      data: {
        targetType: "FIELD_TECH",
        targetId: String(technician.id),
        title: "Order Assigned",
        message: `You have been assigned to order ${orderId}`,
        type: "ORDER_CREATED",
        relatedId: order.id,
        orderId: order.id,
      },
    });

    await createActivityLog({
      title: "Technician assigned to order",
      description: `Technician ${technician.name} assigned to order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "ASSIGNED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Technician assigned successfully: ${orderTechnician.id}`);

    return res.status(201).json({
      success: true,
      message: "Technician assigned successfully",
      data: orderTechnician,
    });
  } catch (error) {
    logger.error("Error assigning technician:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to assign technician",
      error: error.message,
    });
  }
};

/**
 * Get all field technicians assigned to an order
 */
export const getOrderTechnicians = async (req, res) => {
  try {
    const { orderId } = req.params;

    logger.info(`Fetching technicians for order: ${orderId}`);

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const technicians = await db.orderTechnician.findMany({
      where: { orderId: order.id, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: buildTechnicianInclude().include,
    });

    return res.status(200).json({ success: true, data: technicians });
  } catch (error) {
    logger.error("Error fetching order technicians:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch technicians",
      error: error.message,
    });
  }
};

/**
 * Swap the field technician on an existing assignment
 */
export const updateOrderTechnician = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(
      req.body,
      updateOrderTechnicianValidation,
    );

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err,
      });
    }

    const { orderTechnicianId, orderId, userId } = req.body;

    logger.info(
      `Updating technician assignment: ${orderTechnicianId} on order: ${orderId}`,
    );

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const existing = await db.orderTechnician.findFirst({
      where: { id: orderTechnicianId, orderId: order.id, isDeleted: false },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Order technician not found" });
    }

    const technician = await db.user.findFirst({
      where: {
        id: parseInt(userId),
        role: "FIELD_TECHNICIAN",
        isDeleted: false,
      },
    });

    if (!technician) {
      return res
        .status(404)
        .json({ success: false, message: "Field technician not found" });
    }

    const duplicate = await db.orderTechnician.findFirst({
      where: {
        orderId: order.id,
        userId: technician.id,
        isDeleted: false,
        id: { not: orderTechnicianId },
      },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "This technician is already assigned to the order",
      });
    }

    const updated = await db.orderTechnician.update({
      where: { id: orderTechnicianId },
      data: { userId: technician.id },
      include: buildTechnicianInclude().include,
    });

    // Only tell the newcomer if the assignment actually changed hands.
    if (existing.userId !== technician.id) {
      await db.notification.create({
        data: {
          targetType: "FIELD_TECH",
          targetId: String(technician.id),
          title: "Order Assigned",
          message: `You have been assigned to order ${orderId}`,
          type: "ORDER_CREATED",
          relatedId: order.id,
          orderId: order.id,
        },
      });
    }

    await createActivityLog({
      title: "Order technician updated",
      description: `Technician on order ${orderId} changed to ${technician.name}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "ASSIGNED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Order technician updated successfully: ${orderTechnicianId}`);

    return res.status(200).json({
      success: true,
      message: "Technician updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating order technician:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update technician",
      error: error.message,
    });
  }
};

/**
 * Unassign a field technician from an order (soft)
 */
export const deleteOrderTechnician = async (req, res) => {
  try {
    const { orderId, orderTechnicianId } = req.params;

    logger.info(
      `Removing technician: ${orderTechnicianId} from order: ${orderId}`,
    );

    const order = await db.order.findFirst({
      where: { orderId, isDeleted: false },
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const orderTechnician = await db.orderTechnician.findFirst({
      where: { id: orderTechnicianId, orderId: order.id, isDeleted: false },
      include: { user: { select: { name: true } } },
    });

    if (!orderTechnician) {
      return res
        .status(404)
        .json({ success: false, message: "Order technician not found" });
    }

    await db.orderTechnician.update({
      where: { id: orderTechnicianId },
      data: { isDeleted: true },
    });

    await createActivityLog({
      title: "Technician removed from order",
      description: `Technician ${orderTechnician.user.name} removed from order ${orderId}`,
      entityType: "ORDER",
      entityId: order.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.id) || null,
    });

    logger.info(`Order technician removed successfully: ${orderTechnicianId}`);

    return res
      .status(200)
      .json({ success: true, message: "Technician removed successfully" });
  } catch (error) {
    logger.error("Error removing order technician:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove technician",
      error: error.message,
    });
  }
};

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
