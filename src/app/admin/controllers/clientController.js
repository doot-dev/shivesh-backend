import { validatorFunction } from "../../../helper/validate.js";
import {
  createClientValidation,
  updateClientValidation,
  clientListValidation,
} from "../validations/clientValidation.js";
import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { createActivityLog } from "../../../helper/activityLogger.js";
import { getPublicUrl, deleteUploadedFile } from "../../../config/multerConfig.js";

/**
 * Retrieves a list of clients with pagination and optional filters.
 *
 * @param {Request} req - Express request object containing page, length, search, and status query parameters
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - data {Array}: Array of clients on success, null on failure
 *   - total {number}: Total number of clients
 *   - page {number}: Page number
 */
export const getClientList = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", status } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {
      isDeleted: false,
      ...(status && { status }),
      ...(search && {
        OR: [
          { companyName: { contains: search } },
          { ownerName: { contains: search } },
          { contactNumber: { contains: search } },
          { email: { contains: search } },
        ],
      }),
    };

    // Get clients with pagination
    const [clients, total] = await Promise.all([
      db.client.findMany({
        where,
        skip,
        take: limitNum,
        select: {
          clientId: true,
          companyName: true,
          ownerName: true,
          contactNumber: true,
          email: true,
          status: true,
          kycStatus: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      db.client.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: clients,
      total,
      page: pageNum,
    });
  } catch (error) {
    logger.error("Error fetching client list:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * Create a new client
 * @param {Object} req.body - Client data to create
 * @returns {Promise<Object>} - Created client data
 */
export const createClient = async (req, res) => {
  const { err, status } = await validatorFunction(req.body, createClientValidation);
  if (!status) {
    return res.status(400).json({ success: false, message: "Validation Error", errors: err });
  }

  try {
    const {
      companyName,
      ownerName,
      contactNumber,
      email,
      hasGST,
      gstNumber,
      ownerPan,
      ownerAadhaar,
      address,
      kycDocuments = [],
    } = req.body;

    // Check if email already exists
    const existingClient = await db.client.findFirst({
      where: { email, isDeleted: false },
    });

    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: "Client with this email already exists",
      });
    }

    // Check if GST number already exists (if provided)
    if (hasGST && gstNumber) {
      const existingGST = await db.client.findFirst({
        where: { gstNumber, isDeleted: false },
      });
      if (existingGST) {
        return res.status(400).json({
          success: false,
          message: "Client with this GST number already exists",
        });
      }
    }

    // Generate client ID
    const currentYear = new Date().getFullYear();
    const lastClient = await db.client.findFirst({
      where: { id: { startsWith: `CL-${currentYear}-` } },
      orderBy: { createdAt: "desc" },
    });

    let clientIdNumber = 1;
    if (lastClient) {
      const lastNumber = parseInt(lastClient.clientId.split("-")[2]);
      clientIdNumber = lastNumber + 1;
    }
    const clientId = `CL-${currentYear}-${String(clientIdNumber).padStart(4, "0")}`;

    // Create client with KYC documents
    const client = await db.client.create({
      data: {
        clientId,
        companyName,
        ownerName,
        contactNumber,
        email,
        hasGST,
        gstNumber: hasGST ? gstNumber : null,
        ownerPan: ownerPan || null,
        ownerAadhaar: ownerAadhaar || null,
        address,
        kycDocuments: {
          create: kycDocuments.map((doc, index) => ({
            docId: `DOC-${Date.now()}-${index + 1}`,
            fileName: doc.fileName,
            fileUrl: doc.fileUrl,
            type: doc.type,
          })),
        },
      },
    });

    // Log activity
    await createActivityLog({
      title: "Client created",
      description: `New client ${companyName} created with ID ${clientId}`,
      entityType: "CLIENT",
      entityId: client.id,
      action: "CREATED",
      createdById: req.user?.data?.id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Client created successfully",
      clientId: client.clientId,
    });
  } catch (error) {
    logger.error("Error creating client:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔵 3. GET CLIENT DETAILS
export const getClientDetails = async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await db.client.findFirst({
      where: {
        clientId,
        isDeleted: false,
      },
      include: {
        kycDocuments: {
          select: {
            docId: true,
            fileName: true,
            fileUrl: true,
            type: true,
            uploadedAt: true,
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // Remove internal fields from response
    const { id, isDeleted, ...clientData } = client;

    return res.status(200).json({
      success: true,
      data: clientData,
    });
  } catch (error) {
    logger.error("Error fetching client details:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔵 4. UPDATE CLIENT
export const updateClient = async (req, res) => {
  const { err, status } = await validatorFunction(req.body, updateClientValidation);
  if (!status) {
    return res.status(400).json({ success: false, message: "Validation Error", errors: err });
  }

  try {
    const {
      clientId,
      companyName,
      ownerName,
      contactNumber,
      email,
      hasGST,
      gstNumber,
      ownerPan,
      ownerAadhaar,
      address,
      kycDocuments = [],
    } = req.body;

    // Check if client exists
    const existingClient = await db.client.findFirst({
      where: { id: clientId, isDeleted: false },
    });

    if (!existingClient) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // Check if email is being changed and if it already exists
    if (email !== existingClient.email) {
      const emailExists = await db.client.findFirst({
        where: { email, isDeleted: false, NOT: { clientId } },
      });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already in use by another client",
        });
      }
    }

    // Check if GST number is being changed and if it already exists
    if (hasGST && gstNumber && gstNumber !== existingClient.gstNumber) {
      const gstExists = await db.client.findFirst({
        where: { gstNumber, isDeleted: false, NOT: { clientId } },
      });
      if (gstExists) {
        return res.status(400).json({
          success: false,
          message: "GST number already in use by another client",
        });
      }
    }

    // Update client
    const updatedClient = await db.client.update({
      where: { id: existingClient.id },
      data: {
        companyName,
        ownerName,
        contactNumber,
        email,
        hasGST,
        gstNumber: hasGST ? gstNumber : null,
        ownerPan: ownerPan || null,
        ownerAadhaar: ownerAadhaar || null,
        address,
      },
    });

    // If new KYC documents are provided, delete old ones and create new
    if (kycDocuments.length > 0) {
      await db.kYCDocument.deleteMany({
        where: { clientId: existingClient.id },
      });

      await db.kYCDocument.createMany({
        data: kycDocuments.map((doc, index) => ({
          docId: `DOC-${Date.now()}-${index + 1}`,
          fileName: doc.fileName,
          fileUrl: doc.fileUrl,
          type: doc.type,
          clientId: existingClient.id,
        })),
      });
    }

    // Log activity
    await createActivityLog({
      title: "Client updated",
      description: `Client ${companyName} (${clientId}) was updated`,
      entityType: "CLIENT",
      entityId: existingClient.id,
      action: "UPDATED",
      createdById: req.user?.data?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Client updated successfully",
    });
  } catch (error) {
    logger.error("Error updating client:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔵 5. DELETE CLIENT
export const deleteClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    // Find client
    const client = await db.client.findFirst({
      where: { id: clientId, isDeleted: false },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // TODO: Add checks for active orders and unpaid invoices when those modules are implemented
    // Example:
    // const hasActiveOrders = await db.order.count({
    //     where: { clientId: client.id, status: { in: ['ACTIVE', 'PENDING'] } }
    // });
    // if (hasActiveOrders > 0) {
    //     return res.status(400).json({
    //         success: false,
    //         message: "Cannot delete client with active orders"
    //     });
    // }

    // Soft delete client
    await db.client.update({
      where: { id: client.id },
      data: { isDeleted: true },
    });

    // Log activity
    await createActivityLog({
      title: "Client deleted",
      description: `Client ${client.companyName} (${clientId}) was deleted`,
      entityType: "CLIENT",
      entityId: client.id,
      action: "UPDATED",
      createdById: req.user?.data?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Client removed successfully",
    });
  } catch (error) {
    logger.error("Error deleting client:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔵 6. GET KYC DOCUMENTS LIST
export const getKYCList = async (req, res) => {
  try {
    const { clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: "clientId is required as query parameter",
      });
    }

    // Find client
    const client = await db.client.findFirst({
      where: { id: clientId, isDeleted: false },
    });
    logger.info("Client fetched for KYC list:", client);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // Get all KYC documents for the client
    const kycDocuments = await db.kYCDocument.findMany({
      where: { clientId: client.id },
      select: {
        docId: true,
        fileName: true,
        fileUrl: true,
        type: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: kycDocuments,
      total: kycDocuments.length,
    });
  } catch (error) {
    logger.error("Error fetching KYC documents:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔵 7. UPLOAD MULTIPLE KYC DOCUMENTS
export const uploadKYCDocuments = async (req, res) => {
  try {
    const { clientId } = req.body;
    const uploadedFiles = req.files; // Multer provides files in req.files

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: "clientId is required",
      });
    }

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded. Please upload at least one KYC document",
      });
    }

    // Find client
    const client = await db.client.findFirst({
      where: { id: clientId, isDeleted: false },
    });

    if (!client) {
      // If client not found, delete uploaded files
      for (const file of uploadedFiles) {
        await deleteUploadedFile(file.filename);
      }
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // Get document types from request body (if provided)
    const types = req.body.types ? JSON.parse(req.body.types) : [];

    // Create KYC documents in database
    const documents = await Promise.all(
      uploadedFiles.map(async (file, index) => {
        const fileUrl = getPublicUrl(file.filename);
        return await db.kYCDocument.create({
          data: {
            docId: `DOC-${Date.now()}-${index + 1}`,
            fileName: file.originalname,
            fileUrl: fileUrl,
            type: types[index] || 'other',
            clientId: client.id,
          },
        });
      })
    );

    // Log activity
    await createActivityLog({
      title: "KYC documents uploaded",
      description: `${documents.length} KYC document(s) uploaded for client ${client.companyName}`,
      entityType: "CLIENT",
      entityId: client.id,
      action: "UPDATED",
      createdById: req.user?.data?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: `${documents.length} document(s) uploaded successfully`,
      uploaded: documents.map((doc) => ({
        docId: doc.docId,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        type: doc.type,
      })),
    });
  } catch (error) {
    logger.error("Error uploading KYC documents:", error);

    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteUploadedFile(file.filename).catch(err =>
          logger.error(`Failed to delete file ${file.filename}:`, err)
        );
      }
    }

    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// 🔵 8. DELETE ONE KYC DOCUMENT
export const deleteKYCDocument = async (req, res) => {
  try {
    const { clientId, docId } = req.params;

    // Find client
    const client = await db.client.findFirst({
      where: { id: clientId, isDeleted: false },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // Find document
    const document = await db.kYCDocument.findFirst({
      where: { docId, clientId: client.id },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Extract filename from fileUrl and delete physical file
    const filename = document.fileUrl.split('/').pop();
    await deleteUploadedFile(filename).catch(err =>
      logger.warn(`Could not delete physical file ${filename}:`, err)
    );

    // Delete document from database
    await db.kYCDocument.delete({
      where: { id: document.id },
    });

    // Log activity
    await createActivityLog({
      title: "KYC document deleted",
      description: `KYC document ${document.fileName} deleted for client ${client.companyName}`,
      entityType: "CLIENT",
      entityId: client.id,
      action: "UPDATED",
      createdById: req.user?.data?.id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting KYC document:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
