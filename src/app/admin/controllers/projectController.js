import prisma from "../../../config/database.js";
import { v4 as uuidv4 } from "uuid";
import { encrypt, decrypt } from "../../../helper/security.js";
import { validatorFunction } from "../../../helper/validate.js";
import {
  projectStep1Validation,
  projectStep2Validation,
  projectStep3Validation,
  projectStep4Validation,
  updateProjectValidation,
} from "../validations/projectValidation.js";

export const getProjectList = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      isDeleted: 0,
      ...(search && {
        OR: [
          { projectName: { contains: search } },
          { siteName: { contains: search } },
          { projectLocation: { contains: search } },
          { client: { clientName: { contains: search } } },
        ],
      }),
      ...(status && { status }),
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          client: {
            select: {
              clientId: true,
              clientName: true,
            },
          },
          _count: {
            select: {
              products: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.project.count({ where }),
    ]);

    // Decrypt sensitive data
    const decryptedProjects = projects.map((project) => ({
      ...project,
      projectId: decrypt(project.projectId),
      clientId: decrypt(project.clientId),
      client: {
        ...project.client,
        clientId: decrypt(project.client.clientId),
      },
    }));

    return res.json({
      status: true,
      message: "Projects fetched successfully",
      data: {
        projects: decryptedProjects,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch projects",
      error: error.message,
    });
  }
};

export const createProjectStep1 = async (req, res) => {
  try {
    const { projectName, clientId, siteName, projectLocation } = req.body;
    const { status, err } = await validatorFunction(req.body, projectStep1Validation);
    if (!status) {
      return res.status(422).json({ status: false, message: "Validation failed", errors: err });
    }
    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      return res.status(404).json({ status: false, message: "Client not found" });
    }
    // Create temporary project
    const tempProjectId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const tempProject = await prisma.tempProject.create({
      data: {
        tempProjectId: encrypt(tempProjectId),
        projectName,
        clientId: encrypt(clientId),
        siteName,
        projectLocation,
        currentStep: 1,
        expiresAt,
      },
    });
    return res.json({
      status: true,
      message: "Project step 1 completed",
      data: { tempProjectId, currentStep: 1, expiresAt },
    });
  } catch (error) {
    console.error("Error creating project step 1:", error);
    return res.status(500).json({ status: false, message: "Failed to create project", error: error.message });
  }
};

export const createProjectStep2 = async (req, res) => {
  try {
    const { tempProjectId, commission } = req.body;
    const { status, err } = await validatorFunction(req.body, projectStep2Validation);
    if (!status) {
      return res.status(422).json({ status: false, message: "Validation failed", errors: err });
    }
    // Find temp project
    const tempProject = await prisma.tempProject.findUnique({
      where: { tempProjectId: encrypt(tempProjectId) },
    });
    if (!tempProject) {
      return res.status(404).json({ status: false, message: "Temporary project not found or expired" });
    }
    if (tempProject.currentStep !== 1) {
      return res.status(400).json({ status: false, message: "Invalid step sequence" });
    }
    // Update temp project with commission data
    await prisma.tempProject.update({
      where: { tempProjectId: encrypt(tempProjectId) },
      data: {
        commissionPersonName: commission?.personName || null,
        commissionAmountPerM3: commission?.amountPerM3 ? parseFloat(commission.amountPerM3) : null,
        commissionIncludeInProjectCost: commission?.includeInProjectCost || false,
        currentStep: 2,
      },
    });
    return res.json({ status: true, message: "Project step 2 completed", data: { tempProjectId, currentStep: 2 } });
  } catch (error) {
    console.error("Error creating project step 2:", error);
    return res.status(500).json({ status: false, message: "Failed to update project", error: error.message });
  }
};

export const createProjectStep3 = async (req, res) => {
  try {
    const { tempProjectId, credit } = req.body;
    const { status, err } = await validatorFunction(req.body, projectStep3Validation);
    if (!status) {
      return res.status(422).json({ status: false, message: "Validation failed", errors: err });
    }
    // Find temp project
    const tempProject = await prisma.tempProject.findUnique({
      where: { tempProjectId: encrypt(tempProjectId) },
    });
    if (!tempProject) {
      return res.status(404).json({ status: false, message: "Temporary project not found or expired" });
    }
    if (tempProject.currentStep !== 2) {
      return res.status(400).json({ status: false, message: "Invalid step sequence" });
    }
    // Update temp project with credit data
    await prisma.tempProject.update({
      where: { tempProjectId: encrypt(tempProjectId) },
      data: {
        creditAmount: parseFloat(credit.amount),
        creditResetPeriodDays: parseInt(credit.resetPeriodDays),
        currentStep: 3,
      },
    });
    return res.json({ status: true, message: "Project step 3 completed", data: { tempProjectId, currentStep: 3 } });
  } catch (error) {
    console.error("Error creating project step 3:", error);
    return res.status(500).json({ status: false, message: "Failed to update project", error: error.message });
  }
};

export const createProjectStep4 = async (req, res) => {
  try {
    const { tempProjectId, products } = req.body;
    const { status, err } = await validatorFunction(req.body, projectStep4Validation);
    if (!status) {
      return res.status(422).json({ status: false, message: "Validation failed", errors: err });
    }
    // Find temp project
    const tempProject = await prisma.tempProject.findUnique({
      where: { tempProjectId: encrypt(tempProjectId) },
    });
    if (!tempProject) {
      return res.status(404).json({ status: false, message: "Temporary project not found or expired" });
    }
    if (tempProject.currentStep !== 3) {
      return res.status(400).json({ status: false, message: "Invalid step sequence" });
    }
    // Create actual project
    const projectId = uuidv4();
    const project = await prisma.project.create({
      data: {
        projectId: encrypt(projectId),
        projectName: tempProject.projectName,
        clientId: tempProject.clientId,
        siteName: tempProject.siteName,
        projectLocation: tempProject.projectLocation,
        commissionPersonName: tempProject.commissionPersonName,
        commissionAmountPerM3: tempProject.commissionAmountPerM3,
        commissionIncludeInProjectCost: tempProject.commissionIncludeInProjectCost,
        creditAmount: tempProject.creditAmount,
        creditResetPeriodDays: tempProject.creditResetPeriodDays,
        status: "ACTIVE",
        products: {
          create: products.map((product) => ({
            projectProductId: encrypt(uuidv4()),
            productName: product.productName,
            productGrade: product.productGrade,
            costPrice: parseFloat(product.costPrice),
            vendors: {
              create: product.vendors.map((vendor) => ({
                projectProductVendorId: encrypt(uuidv4()),
                vendorId: encrypt(vendor.vendorId),
                vendorName: vendor.vendorName,
                customPrice: parseFloat(vendor.customPrice),
                priority: vendor.priority,
              })),
            },
          })),
        },
      },
      include: {
        client: {
          select: {
            clientId: true,
            clientName: true,
          },
        },
        products: {
          include: {
            vendors: true,
          },
        },
      },
    });
    // Delete temp project
    await prisma.tempProject.delete({ where: { tempProjectId: encrypt(tempProjectId) } });
    // Decrypt response
    const decryptedProject = {
      ...project,
      projectId: decrypt(project.projectId),
      clientId: decrypt(project.clientId),
      client: {
        ...project.client,
        clientId: decrypt(project.client.clientId),
      },
      products: project.products.map((product) => ({
        ...product,
        projectProductId: decrypt(product.projectProductId),
        vendors: product.vendors.map((vendor) => ({
          ...vendor,
          projectProductVendorId: decrypt(vendor.projectProductVendorId),
          vendorId: decrypt(vendor.vendorId),
        })),
      })),
    };
    return res.json({ status: true, message: "Project created successfully", data: decryptedProject });
  } catch (error) {
    console.error("Error creating project step 4:", error);
    return res.status(500).json({ status: false, message: "Failed to create project", error: error.message });
  }
};

export const getProjectDetails = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: {
        projectId: encrypt(projectId),
        isDeleted: 0,
      },
      include: {
        client: {
          select: {
            clientId: true,
            clientName: true,
            email: true,
            phoneNumber: true,
          },
        },
        products: {
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
        status: false,
        message: "Project not found",
      });
    }

    // Decrypt sensitive data
    const decryptedProject = {
      ...project,
      projectId: decrypt(project.projectId),
      clientId: decrypt(project.clientId),
      client: {
        ...project.client,
        clientId: decrypt(project.client.clientId),
      },
      products: project.products.map((product) => ({
        ...product,
        projectProductId: decrypt(product.projectProductId),
        vendors: product.vendors.map((vendor) => ({
          ...vendor,
          projectProductVendorId: decrypt(vendor.projectProductVendorId),
          vendorId: decrypt(vendor.vendorId),
        })),
      })),
    };

    return res.json({
      status: true,
      message: "Project details fetched successfully",
      data: decryptedProject,
    });
  } catch (error) {
    console.error("Error fetching project details:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch project details",
      error: error.message,
    });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      projectName,
      siteName,
      projectLocation,
      projectManager,
      status,
      commission,
      credit,
      products,
    } = req.body;
    const { status: valid, err } = await validatorFunction(req.body, updateProjectValidation);
    if (!valid) {
      return res.status(422).json({ status: false, message: "Validation failed", errors: err });
    }
    // Check if project exists
    const existingProject = await prisma.project.findUnique({
      where: {
        projectId: encrypt(projectId),
        isDeleted: 0,
      },
    });
    if (!existingProject) {
      return res.status(404).json({ status: false, message: "Project not found" });
    }
    // Prepare update data
    const updateData = {
      ...(projectName && { projectName }),
      ...(siteName && { siteName }),
      ...(projectLocation && { projectLocation }),
      ...(projectManager && { projectManager }),
      ...(status && { status }),
      ...(commission && {
        commissionPersonName: commission.personName,
        commissionAmountPerM3: commission.amountPerM3 ? parseFloat(commission.amountPerM3) : null,
        commissionIncludeInProjectCost: commission.includeInProjectCost,
      }),
      ...(credit && {
        creditAmount: parseFloat(credit.amount),
        creditResetPeriodDays: parseInt(credit.resetPeriodDays),
      }),
    };
    // Update project
    const updatedProject = await prisma.project.update({
      where: { projectId: encrypt(projectId) },
      data: updateData,
    });
    // Update products if provided
    if (products && products.length > 0) {
      // Delete existing products and vendors
      await prisma.projectProduct.deleteMany({ where: { projectId: encrypt(projectId) } });
      // Create new products with vendors
      await prisma.projectProduct.createMany({
        data: products.map((product) => ({
          projectProductId: encrypt(uuidv4()),
          projectId: encrypt(projectId),
          productName: product.productName,
          productGrade: product.productGrade,
          costPrice: parseFloat(product.costPrice),
        })),
      });
      // Create vendors for each product
      for (const product of products) {
        const projectProduct = await prisma.projectProduct.findFirst({
          where: {
            projectId: encrypt(projectId),
            productName: product.productName,
            productGrade: product.productGrade,
          },
        });
        if (projectProduct && product.vendors) {
          await prisma.projectProductVendor.createMany({
            data: product.vendors.map((vendor) => ({
              projectProductVendorId: encrypt(uuidv4()),
              projectProductId: projectProduct.projectProductId,
              vendorId: encrypt(vendor.vendorId),
              vendorName: vendor.vendorName,
              customPrice: parseFloat(vendor.customPrice),
              priority: vendor.priority,
            })),
          });
        }
      }
    }
    // Fetch updated project with all relations
    const project = await prisma.project.findUnique({
      where: { projectId: encrypt(projectId) },
      include: {
        client: {
          select: { clientId: true, clientName: true },
        },
        products: { include: { vendors: true } },
      },
    });
    // Decrypt response
    const decryptedProject = {
      ...project,
      projectId: decrypt(project.projectId),
      clientId: decrypt(project.clientId),
      client: {
        ...project.client,
        clientId: decrypt(project.client.clientId),
      },
      products: project.products.map((product) => ({
        ...product,
        projectProductId: decrypt(product.projectProductId),
        vendors: product.vendors.map((vendor) => ({
          ...vendor,
          projectProductVendorId: decrypt(vendor.projectProductVendorId),
          vendorId: decrypt(vendor.vendorId),
        })),
      })),
    };
    return res.json({ status: true, message: "Project updated successfully", data: decryptedProject });
  } catch (error) {
    console.error("Error updating project:", error);
    return res.status(500).json({ status: false, message: "Failed to update project", error: error.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: {
        projectId: encrypt(projectId),
        isDeleted: 0,
      },
    });

    if (!project) {
      return res.status(404).json({
        status: false,
        message: "Project not found",
      });
    }

    // TODO: Check if project has any active orders
    // Uncomment when Order model is implemented
    // const activeOrders = await prisma.order.count({
    //   where: {
    //     projectId: encrypt(projectId),
    //     status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
    //   },
    // });
    //
    // if (activeOrders > 0) {
    //   return res.status(400).json({
    //     status: false,
    //     message: "Cannot delete project with active orders",
    //   });
    // }

    // Soft delete project
    await prisma.project.update({
      where: { projectId: encrypt(projectId) },
      data: {
        isDeleted: 1,
        deletedAt: new Date(),
      },
    });

    return res.json({
      status: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting project:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to delete project",
      error: error.message,
    });
  }
};
