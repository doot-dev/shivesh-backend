import { Router } from "express";
import * as clientController from "../controllers/clientController.js";
import { verifyToken } from "../../../config/jwtConfig.js";
import { uploadMultipleKYC } from "../../../config/multerConfig.js";

const clientRoute = Router();

/**
 * @swagger
 * /api/v1/admin/client/list:
 *   get:
 *     summary: Get client list
 *     description: Retrieve a list of all clients with pagination - requires authentication
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *     responses:
 *       200:
 *         description: Client list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
clientRoute.get("/list", verifyToken, clientController.getClientList);

/**
 * @swagger
 * /api/v1/admin/client/create:
 *   post:
 *     summary: Create a new client
 *     description: Create a new client - requires authentication
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zipCode:
 *                 type: string
 *     responses:
 *       201:
 *         description: Client created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
clientRoute.post("/create", verifyToken, clientController.createClient);

/**
 * @swagger
 * /api/v1/admin/client/upload-kyc:
 *   post:
 *     summary: Upload KYC documents
 *     description: Upload multiple KYC documents for a client - requires authentication (multipart/form-data)
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - clientId
 *               - kycDocuments
 *             properties:
 *               clientId:
 *                 type: string
 *                 description: Client ID
 *               kycDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: KYC document files (max 10 files, 10MB each)
 *               types:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Document types (pan, aadhaar, gst, passport, etc.)
 *     responses:
 *       200:
 *         description: KYC documents uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
clientRoute.post("/upload-kyc", verifyToken, uploadMultipleKYC, clientController.uploadKYCDocuments);

/**
 * @swagger
 * /api/v1/admin/client/{clientId}:
 *   get:
 *     summary: Get client details
 *     description: Retrieve detailed information about a specific client - requires authentication
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: Client not found
 */
clientRoute.get("/:clientId", verifyToken, clientController.getClientDetails);

/**
 * @swagger
 * /api/v1/admin/client/{clientId}:
 *   put:
 *     summary: Update client
 *     description: Update an existing client - requires authentication
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zipCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Client updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: Client not found
 */
clientRoute.put("/:clientId", verifyToken, clientController.updateClient);

/**
 * @swagger
 * /api/v1/admin/client/{clientId}:
 *   delete:
 *     summary: Delete client
 *     description: Delete a client - requires authentication
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID to delete
 *     responses:
 *       200:
 *         description: Client deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: Client not found
 */
clientRoute.delete("/:clientId", verifyToken, clientController.deleteClient);

/**
 * @swagger
 * /api/v1/admin/client/{clientId}/kyc/{docId}:
 *   delete:
 *     summary: Delete KYC document
 *     description: Delete a specific KYC document for a client - requires authentication
 *     tags: [Clients]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *       - in: path
 *         name: docId
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to delete
 *     responses:
 *       200:
 *         description: KYC document deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: Document not found
 */
clientRoute.delete("/:clientId/kyc/:docId", verifyToken, clientController.deleteKYCDocument);

export default clientRoute;
