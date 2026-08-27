import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { validatorFunction } from "../../../helper/validate.js";
import {
  createProjectValidation,
  updateProjectValidation,
  updateProjectCreditValidation,
  updateProjectCommissionValidation,
  createProjectProductValidation,
  updateProjectProductValidation,
  createProjectProductVendorValidation,
  updateProjectProductVendorValidation,
} from "../validations/projectValidation.js";
import { createActivityLog } from "../../../helper/activityLogger.js";

/**
 * Get list of all projects with pagination and filters
 */
export const getProjectList = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const where = {
      isDeleted: false,
      ...(search && {
        OR: [
          { projectName: { contains: search, mode: 'insensitive' } },
          { siteName: { contains: search, mode: 'insensitive' } },
          { projectLocation: { contains: search, mode: 'insensitive' } },
          { client: { companyName: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(status && { status }),
    };

    const [projects, total] = await Promise.all([
      db.project.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          client: {
            select: {
              id: true,
              clientId: true,
              companyName: true,
              ownerName: true,
            },
          },
          _count: {
            select: {
              projectProducts: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.project.count({ where }),
    ]);

    logger.info(`Retrieved ${projects.length} projects`);

    return res.json({
      success: true,
      message: "Projects fetched successfully",
      data: projects,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error("Error fetching projects:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch projects",
      error: error.message,
    });
  }
};

/**
 * Create a new project with all details in one API call
 */
export const createProject = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, createProjectValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err
      });
    }

    const {
      projectName,
      clientId,
      siteName,
      address,
      projectLocation,
      latitude,
      longitude,
    } = req.body;

    logger.info(`Creating project: ${projectName} for client ID: ${clientId}`);

    // Check if client exists
    const client = await db.client.findFirst({
      where: { clientId, isDeleted: false },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found"
      });
    }

    // Generate unique projectId
    const projectCount = await db.project.count();
    const projectId = `PRJ-${new Date().getFullYear()}-${String(projectCount + 1).padStart(4, '0')}`;

    // Create project
    const project = await db.project.create({
      data: {
        projectId,
        projectName,
        clientId: client.id,
        siteName,
        address: address || null,
        projectLocation,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        status: "ACTIVE",
      },
      include: {
        client: {
          select: {
            id: true,
            clientId: true,
            companyName: true,
            ownerName: true,
          },
        },
        projectProducts: {
          include: {
            vendors: {
              orderBy: { priority: 'asc' },
            },
          },
        },
      },
    });

    // Log activity
    await createActivityLog({
      title: "Project created",
      description: `Project ${projectName} (${projectId}) was created`,
      entityType: "PROJECT",
      entityId: project.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Project created successfully: ${projectId}`);

    return res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: project,
    });
  } catch (error) {
    logger.error("Error creating project:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create project",
      error: error.message,
    });
  }
};

/**
 * Get project details by ID
 */
export const getProjectDetails = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
      include: {
        client: {
          select: {
            id: true,
            clientId: true,
            companyName: true,
            ownerName: true,
            contactNumber: true,
            email: true,
          },
        },
        projectProducts: {
          include: {
            vendors: {
              orderBy: {
                priority: "asc",
              },
            },
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    logger.info(`Retrieved project details: ${projectId}`);

    return res.json({
      success: true,
      message: "Project details fetched successfully",
      data: project,
    });
  } catch (error) {
    logger.error("Error fetching project details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch project details",
      error: error.message,
    });
  }
};

/**
 * Update project with all details in one API call
 */
export const updateProject = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, updateProjectValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err
      });
    }

    const {
      projectId,
      projectName,
      siteName,
      address,
      projectLocation,
      latitude,
      longitude,
      status,
    } = req.body;

    logger.info(`Updating project: ${projectId}`);

    // Check if project exists
    const existingProject = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!existingProject) {
      return res.status(404).json({
        success: false,
        message: "Project not found"
      });
    }

    // Update project
    const updatedProject = await db.project.update({
      where: { id: existingProject.id },
      data: {
        ...(projectName && { projectName }),
        ...(siteName && { siteName }),
        ...(address !== undefined && { address }),
        ...(projectLocation && { projectLocation }),
        ...(latitude !== undefined && { latitude: latitude ? parseFloat(latitude) : null }),
        ...(longitude !== undefined && { longitude: longitude ? parseFloat(longitude) : null }),
        ...(status && { status }),
      },
      include: {
        client: {
          select: {
            id: true,
            clientId: true,
            companyName: true,
            ownerName: true,
          },
        },
        projectProducts: {
          include: {
            vendors: {
              orderBy: { priority: 'asc' },
            },
          },
        },
      },
    });
    // Log activity
    await createActivityLog({
      title: "Project updated",
      description: `Project ${existingProject.projectName} (${projectId}) was updated`,
      entityType: "PROJECT",
      entityId: existingProject.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Project updated successfully: ${projectId}`);

    return res.json({
      success: true,
      message: "Project updated successfully",
      data: updatedProject,
    });
  } catch (error) {
    logger.error("Error updating project:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update project",
      error: error.message,
    });
  }
};

/**
 * Delete project (soft delete)
 */
export const deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Soft delete project
    await db.project.update({
      where: { id: project.id },
      data: {
        isDeleted: true,
      },
    });

    // Log activity
    await createActivityLog({
      title: "Project deleted",
      description: `Project ${project.projectName} (${projectId}) was deleted`,
      entityType: "PROJECT",
      entityId: project.id,
      action: "DELETED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Project deleted successfully: ${projectId}`);

    return res.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting project:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete project",
      error: error.message,
    });
  }
};

/**
 * Update project credit details
 */
export const updateProjectCredit = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, updateProjectCreditValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err
      });
    }

    const { creditAmount, creditResetPeriodDays, projectId } = req.body;

    logger.info(`Updating credit for project: ${projectId}`);

    // Check if project exists
    const existingProject = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!existingProject) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }
    // Update project credit
    const updatedProject = await db.project.update({
      where: { id: existingProject.id },
      data: {
        creditAmount: creditAmount !== undefined ? (creditAmount ? parseFloat(creditAmount) : null) : existingProject.creditAmount,
        creditResetPeriodDays: creditResetPeriodDays !== undefined ? (creditResetPeriodDays ? parseInt(creditResetPeriodDays) : null) : existingProject.creditResetPeriodDays,
      },
      include: {
        client: {
          select: {
            id: true,
            clientId: true,
            companyName: true,
            ownerName: true,
          },
        },
      },
    });

    // Log activity
    await createActivityLog({
      title: "Project credit updated",
      description: `Credit details updated for project ${existingProject.projectName} (${projectId})`,
      entityType: "PROJECT",
      entityId: existingProject.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Project credit updated successfully: ${projectId}`);

    return res.json({
      success: true,
      message: "Project credit updated successfully",
      data: updatedProject,
    });
  } catch (error) {
    logger.error("Error updating project credit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update project credit",
      error: error.message,
    });
  }
};

/**
 * Update project commission details
 * @param {Object} req.body - Request body containing updated commission details
 * @param {Response} res - Response object
 * @returns {Promise<Response>} - Promise resolving to a Response object
 */
export const updateProjectCommission = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, updateProjectCommissionValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err
      });
    }

    const { commissionPersonName, commissionAmountPerM3, commissionPersonMobile, projectId } = req.body;

    logger.info(`Updating commission for project: ${projectId}`);

    // Check if project exists
    const existingProject = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!existingProject) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Update project commission
    const updatedProject = await db.project.update({
      where: { id: existingProject.id },
      data: {
        /**
         * Commission person name
         * @type {string|null}
         */
        commissionPersonName: commissionPersonName !== undefined ? (commissionPersonName || null) : existingProject.commissionPersonName,
        /**
         * Commission amount per cubic meter
         * @type {number|null}
         */
        commissionAmountPerM3: commissionAmountPerM3 !== undefined ? (commissionAmountPerM3 ? parseFloat(commissionAmountPerM3) : null) : existingProject.commissionAmountPerM3,
        /**
         * Commission person mobile number
         * @type {string|null}
         */
        commissionPersonMobile: commissionPersonMobile !== undefined ? (commissionPersonMobile || null) : existingProject.commissionPersonMobile,
      },
      include: {
        client: {
          select: {
            id: true,
            clientId: true,
            companyName: true,
            ownerName: true,
          },
        },
      },
    });

    logger.info(`token user ${JSON.stringify(req.user)}`);

    // Log activity
    await createActivityLog({
      title: "Project commission updated",
      description: `Commission details updated for project ${existingProject.projectName} (${projectId})`,
      entityType: "PROJECT",
      entityId: existingProject.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Project commission updated successfully: ${projectId}`);

    return res.json({
      success: true,
      message: "Project commission updated successfully",
      data: updatedProject,
    });
  } catch (error) {
    logger.error("Error updating project commission:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update project commission",
      error: error.message,
    });
  }
};

/**
 * =====================================================
 * PROJECT PRODUCT CRUD OPERATIONS
 * =====================================================
 */

/**
 * Create a new product for a project
 */
export const createProjectProduct = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, createProjectProductValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err
      });
    }

    const { projectId, productName, productGrade, costPrice, subcategory } = req.body;

    logger.info(`Creating product for project: ${projectId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Create project product
    const projectProduct = await db.projectProduct.create({
      data: {
        projectId: project.id,
        productName,
        productGrade,
        // Copied by value from the Subcategory master — see the schema comment.
        subcategory: subcategory ? String(subcategory).trim() : "",
        costPrice: parseFloat(costPrice),
      },
    });

    // Log activity
    await createActivityLog({
      title: "Project product created",
      description: `Product ${productName} (${productGrade}) added to project ${project.projectName}`,
      entityType: "PROJECT",
      entityId: projectProduct.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Project product created successfully: ${projectProduct.id}`);

    return res.status(201).json({
      success: true,
      message: "Project product created successfully",
      data: projectProduct,
    });
  } catch (error) {
    logger.error("Error creating project product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create project product",
      error: error.message,
    });
  }
};

/**
 * Get all products for a project
 */
export const getProjectProducts = async (req, res) => {
  try {
    const { projectId } = req.params;

    logger.info(`Fetching products for project: ${projectId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Get all products for the project
    const products = await db.projectProduct.findMany({
      where: {
        projectId: project.id,
      },
      include: {
        vendors: {
          orderBy: {
            priority: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    logger.info(`Retrieved ${products.length} products for project: ${projectId}`);

    return res.json({
      success: true,
      message: "Project products fetched successfully",
      data: products,
    });
  } catch (error) {
    logger.error("Error fetching project products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch project products",
      error: error.message,
    });
  }
};

/**
 * Get a single project product with details
 */
export const getProjectProductDetails = async (req, res) => {
  try {
    const { projectId, productId } = req.params;

    logger.info(`Fetching product details: ${productId} for project: ${projectId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Get product details
    const product = await db.projectProduct.findFirst({
      where: {
        id: productId,
        projectId: project.id,
      },
      include: {
        vendors: {
          orderBy: {
            priority: "asc",
          },
        },
        project: {
          select: {
            id: true,
            projectId: true,
            projectName: true,
            siteName: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    logger.info(`Product details retrieved: ${productId}`);

    return res.json({
      success: true,
      message: "Product details fetched successfully",
      data: product,
    });
  } catch (error) {
    logger.error("Error fetching product details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product details",
      error: error.message,
    });
  }
};

/**
 * Update a project product
 */
export const updateProjectProduct = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, updateProjectProductValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err
      });
    }

    const { productName, productGrade, costPrice, projectId, productId, subcategory } = req.body;

    logger.info(`Updating product: ${productId} for project: ${projectId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if product exists
    const existingProduct = await db.projectProduct.findFirst({
      where: {
        id: productId,
        projectId: project.id,
      },
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Update product
    const updatedProduct = await db.projectProduct.update({
      where: { id: productId },
      data: {
        ...(productName && { productName }),
        ...(productGrade && { productGrade }),
        ...(subcategory !== undefined && { subcategory: String(subcategory).trim() }),
        ...(costPrice && { costPrice: parseFloat(costPrice) }),
      },
      include: {
        vendors: true,
      },
    });

    // Log activity
    await createActivityLog({
      title: "Project product updated",
      description: `Product ${updatedProduct.productName} updated in project ${project.projectName}`,
      entityType: "PROJECT",
      entityId: updatedProduct.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Product updated successfully: ${productId}`);

    return res.json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    logger.error("Error updating product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product",
      error: error.message,
    });
  }
};

/**
 * Delete a project product
 */
export const deleteProjectProduct = async (req, res) => {
  try {
    const { projectId, productId } = req.params;

    logger.info(`Deleting product: ${productId} from project: ${projectId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if product exists
    const product = await db.projectProduct.findFirst({
      where: {
        id: productId,
        projectId: project.id,
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Delete product (cascade will delete vendors)
    await db.projectProduct.delete({
      where: { id: productId },
    });

    // Log activity
    await createActivityLog({
      title: "Project product deleted",
      description: `Product ${product.productName} deleted from project ${project.projectName}`,
      entityType: "PROJECT",
      entityId: product.id,
      action: "DELETED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Product deleted successfully: ${productId}`);

    return res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
      error: error.message,
    });
  }
};

/**
 * =====================================================
 * PROJECT PRODUCT VENDOR CRUD OPERATIONS
 * =====================================================
 */

/**
 * Add a vendor to a project product
 */
export const createProjectProductVendor = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, createProjectProductVendorValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err
      });
    }

    const { vendorId, customPrice, priority, projectId, productId } = req.body;

    logger.info(`Adding vendor to product: ${productId} in project: ${projectId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if product exists
    const product = await db.projectProduct.findFirst({
      where: {
        id: productId,
        projectId: project.id,
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if vendor exists
    const vendorExists = await db.vendor.findUnique({
      where: { id: parseInt(vendorId) },
    });

    if (!vendorExists) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Create vendor
    const projectVendor = await db.projectProductVendor.create({
      data: {
        projectProductId: productId,
        vendorId: parseInt(vendorId),
        customPrice: parseFloat(customPrice),
        priority,
      },
      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            ownerName: true,
            phone: true,
          },
        },
      },
    });

    // Log activity
    await createActivityLog({
      title: "Vendor added to product",
      description: `Vendor ${projectVendor.vendor.companyName} added to product ${product.productName} in project ${project.projectName}`,
      entityType: "PROJECT",
      entityId: projectVendor.id,
      action: "CREATED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Vendor added successfully: ${projectVendor.id}`);

    return res.status(201).json({
      success: true,
      message: "Vendor added successfully",
      data: projectVendor,
    });
  } catch (error) {
    logger.error("Error adding vendor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add vendor",
      error: error.message,
    });
  }
};

/**
 * Get all vendors for a project product
 */
export const getProjectProductVendors = async (req, res) => {
  try {
    const { projectId, productId } = req.params;

    logger.info(`Fetching vendors for product: ${productId} in project: ${projectId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if product exists
    const product = await db.projectProduct.findFirst({
      where: {
        id: productId,
        projectId: project.id,
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Get all vendors
    const vendors = await db.projectProductVendor.findMany({
      where: {
        projectProductId: productId,
      },

      include: {
        vendor: true
      },
      orderBy: {
        priority: "asc",
      },
    });

    let venderRenameMap = await Promise.all(vendors.map(async (vendor) => {
      const tempData = {
        productVendorId: vendor.id,
        ...vendor,
      }
      delete tempData.id;
      return tempData;
    }));
    logger.info(`Retrieved ${venderRenameMap.length} vendors for product: ${productId}`);

    return res.json({
      success: true,
      message: "Vendors fetched successfully",
      data: venderRenameMap,
    });
  } catch (error) {
    logger.error("Error fetching vendors:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendors",
      error: error.message,
    });
  }
};

/**
 * Update a vendor for a project product
 */
export const updateProjectProductVendor = async (req, res) => {
  try {
    const { err, status: validationStatus } = await validatorFunction(req.body, updateProjectProductVendorValidation);

    if (!validationStatus) {
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: err
      });
    }

    const { customPrice, priority, projectId, productId, vendorId, productVendorId } = req.body;

    logger.info(`Updating vendor: ${vendorId} for product: ${productId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if product exists
    const product = await db.projectProduct.findFirst({
      where: {
        id: productId,
        projectId: project.id,
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if vendor exists
    const existingVendor = await db.projectProductVendor.findFirst({
      where: {
        id: productVendorId,
        projectProductId: productId,
      },
    });

    if (!existingVendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Update vendor
    const updatedVendor = await db.projectProductVendor.update({
      where: { id: productVendorId },
      data: {
        ...(customPrice && { customPrice: parseFloat(customPrice) }),
        ...(priority && { priority }),
        vendorId: vendorId ? parseInt(vendorId) : existingVendor.vendorId,
      },
      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
            ownerName: true,
            phone: true,
          },
        },
      },
    });

    // Log activity
    await createActivityLog({
      title: "Vendor updated",
      description: `Vendor ${updatedVendor.vendor.companyName} updated for product ${product.productName}`,
      entityType: "PROJECT",
      entityId: updatedVendor.id,
      action: "UPDATED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Vendor updated successfully: ${vendorId}`);

    return res.json({
      success: true,
      message: "Vendor updated successfully",
      data: updatedVendor,
    });
  } catch (error) {
    logger.error("Error updating vendor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update vendor",
      error: error.message,
    });
  }
};

/**
 * Delete a vendor from a project product
 */
export const deleteProjectProductVendor = async (req, res) => {
  try {
    const { projectId, productId, productVendorId } = req.params;

    logger.info(`Deleting vendor: ${productVendorId} from product: ${productId}`);

    // Check if project exists
    const project = await db.project.findFirst({
      where: {
        projectId,
        isDeleted: false,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if product exists
    const product = await db.projectProduct.findFirst({
      where: {
        id: productId,
        projectId: project.id,
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if vendor exists
    const projectVendor = await db.projectProductVendor.findFirst({
      where: {
        id: productVendorId,
        projectProductId: productId,
      },
      include: {
        vendor: {
          select: {
            companyName: true,
          },
        },
      },
    });

    if (!projectVendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Delete vendor
    await db.projectProductVendor.delete({
      where: { id: productVendorId },
    });

    // Log activity
    await createActivityLog({
      title: "Vendor deleted",
      description: `Vendor ${projectVendor.vendor.companyName} deleted from product ${product.productName}`,
      entityType: "PROJECT",
      entityId: projectVendor.id,
      action: "DELETED",
      createdById: Number(req.user?.data?.userId) || null,
    });

    logger.info(`Vendor deleted successfully: ${productVendorId}`);

    return res.json({
      success: true,
      message: "Vendor deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting vendor:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete vendor",
      error: error.message,
    });
  }
};
