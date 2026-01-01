import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { validatorFunction } from "../../../helper/validate.js";
import {
  createProjectValidation,
  updateProjectValidation,
  updateProjectCreditValidation,
  updateProjectCommissionValidation,
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
      createdById: req.user?.data?.id || null,
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
      createdById: req.user?.data?.id || null,
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
      createdById: req.user?.data?.id || null,
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
      createdById: req.user?.data?.id || null,
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
      createdById: req.user?.data?.id || null,
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
