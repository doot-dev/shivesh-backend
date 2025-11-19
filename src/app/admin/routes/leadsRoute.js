import { Router } from 'express'
import * as leadController from "../controllers/leadController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const leadsRoute = Router();

/**
 * @swagger
 * /api/v1/admin/leads:
 *   post:
 *     summary: Create or update a lead
 *     description: Upsert a lead (create if not exists, update if exists) - requires authentication
 *     tags: [Leads]
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
 *             properties:
 *               id:
 *                 type: string
 *                 description: Lead ID (for update)
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Lead created/updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
leadsRoute.post('/', verifyToken, leadController.upsertLead);

/**
 * @swagger
 * /api/v1/admin/leads/by-id:
 *   get:
 *     summary: Get lead by ID
 *     description: Retrieve a specific lead by ID - requires authentication
 *     tags: [Leads]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Lead ID
 *     responses:
 *       200:
 *         description: Lead retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: Lead not found
 */
leadsRoute.get('/by-id', verifyToken, leadController.getLead);

/**
 * @swagger
 * /api/v1/admin/leads:
 *   get:
 *     summary: Get all leads
 *     description: Retrieve a list of all leads with pagination - requires authentication
 *     tags: [Leads]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Leads retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
leadsRoute.get('/', verifyToken, leadController.getLeads);

/**
 * @swagger
 * /api/v1/admin/leads/log:
 *   get:
 *     summary: Get activity logs
 *     description: Retrieve activity logs for leads - requires authentication
 *     tags: [Leads]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: leadId
 *         schema:
 *           type: string
 *         description: Lead ID to filter logs
 *     responses:
 *       200:
 *         description: Activity logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
leadsRoute.get('/log', verifyToken, leadController.getActivityLogs);

/**
 * @swagger
 * /api/v1/admin/leads/log:
 *   put:
 *     summary: Update lead
 *     description: Update an existing lead - requires authentication
 *     tags: [Leads]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Lead updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
leadsRoute.put('/log', verifyToken, leadController.updateLead);

/**
 * @swagger
 * /api/v1/admin/leads:
 *   delete:
 *     summary: Delete lead
 *     description: Delete a lead - requires authentication
 *     tags: [Leads]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Lead ID to delete
 *     responses:
 *       200:
 *         description: Lead deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
leadsRoute.delete('/', verifyToken, leadController.deleteLead);

export default leadsRoute;