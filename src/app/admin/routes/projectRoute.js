import express from "express";
import {
  getProjectList,
  createProjectStep1,
  createProjectStep2,
  createProjectStep3,
  createProjectStep4,
  getProjectDetails,
  updateProject,
  deleteProject,
} from "../controllers/projectController.js";
import { verifyToken } from "../../../config/jwtConfig.js";

const router = express.Router();

/**
 * @swagger
 * /api/admin/project/list:
 *   get:
 *     summary: Get list of projects
 *     tags: [Project]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by project name, site name, location, or client name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, COMPLETED, ON_HOLD]
 *         description: Filter by project status
 *     responses:
 *       200:
 *         description: Projects fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Projects fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     projects:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get(
  "/list",
  verifyToken,
  getProjectList
);

/**
 * @swagger
 * /api/admin/project/create-step1:
 *   post:
 *     summary: Create project - Step 1 (Basic Information)
 *     tags: [Project]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectName
 *               - clientId
 *               - siteName
 *               - projectLocation
 *             properties:
 *               projectName:
 *                 type: string
 *                 example: Green Valley Construction
 *               clientId:
 *                 type: string
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *               siteName:
 *                 type: string
 *                 example: Site A
 *               projectLocation:
 *                 type: string
 *                 example: Mumbai, Maharashtra
 *     responses:
 *       200:
 *         description: Project step 1 completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Project step 1 completed
 *                 data:
 *                   type: object
 *                   properties:
 *                     tempProjectId:
 *                       type: string
 *                     currentStep:
 *                       type: integer
 *                       example: 1
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  "/create-step1",
  verifyToken,
  createProjectStep1
);

/**
 * @swagger
 * /api/admin/project/create-step2:
 *   post:
 *     summary: Create project - Step 2 (Commission Details)
 *     tags: [Project]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tempProjectId
 *             properties:
 *               tempProjectId:
 *                 type: string
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *               commission:
 *                 type: object
 *                 properties:
 *                   personName:
 *                     type: string
 *                     example: John Doe
 *                   amountPerM3:
 *                     type: number
 *                     example: 50.00
 *                   includeInProjectCost:
 *                     type: boolean
 *                     example: true
 *     responses:
 *       200:
 *         description: Project step 2 completed
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  "/create-step2",
  verifyToken,
  createProjectStep2
);

/**
 * @swagger
 * /api/admin/project/create-step3:
 *   post:
 *     summary: Create project - Step 3 (Credit Details)
 *     tags: [Project]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tempProjectId
 *               - credit
 *             properties:
 *               tempProjectId:
 *                 type: string
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *               credit:
 *                 type: object
 *                 required:
 *                   - amount
 *                   - resetPeriodDays
 *                 properties:
 *                   amount:
 *                     type: number
 *                     example: 100000.00
 *                   resetPeriodDays:
 *                     type: integer
 *                     example: 30
 *     responses:
 *       200:
 *         description: Project step 3 completed
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  "/create-step3",
  verifyToken,
  createProjectStep3
);

/**
 * @swagger
 * /api/admin/project/create-step4:
 *   post:
 *     summary: Create project - Step 4 (Products & Vendors)
 *     tags: [Project]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tempProjectId
 *               - products
 *             properties:
 *               tempProjectId:
 *                 type: string
 *                 example: 550e8400-e29b-41d4-a716-446655440000
 *               products:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - productName
 *                     - productGrade
 *                     - costPrice
 *                     - vendors
 *                   properties:
 *                     productName:
 *                       type: string
 *                       example: Cement
 *                     productGrade:
 *                       type: string
 *                       example: Grade A
 *                     costPrice:
 *                       type: number
 *                       example: 350.00
 *                     vendors:
 *                       type: array
 *                       minItems: 1
 *                       items:
 *                         type: object
 *                         required:
 *                           - vendorId
 *                           - vendorName
 *                           - customPrice
 *                           - priority
 *                         properties:
 *                           vendorId:
 *                             type: string
 *                             example: 550e8400-e29b-41d4-a716-446655440000
 *                           vendorName:
 *                             type: string
 *                             example: ABC Suppliers
 *                           customPrice:
 *                             type: number
 *                             example: 340.00
 *                           priority:
 *                             type: string
 *                             enum: [HIGH, MEDIUM, LOW]
 *                             example: HIGH
 *     responses:
 *       200:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Project created successfully
 *                 data:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  "/create-step4",
  verifyToken,
  createProjectStep4
);

/**
 * @swagger
 * /api/admin/project/{projectId}:
 *   get:
 *     summary: Get project details
 *     tags: [Project]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project details fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Project details fetched successfully
 *                 data:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get("/:projectId", verifyToken, getProjectDetails);

/**
 * @swagger
 * /api/admin/project/{projectId}:
 *   put:
 *     summary: Update project
 *     tags: [Project]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectName:
 *                 type: string
 *               siteName:
 *                 type: string
 *               projectLocation:
 *                 type: string
 *               projectManager:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, COMPLETED, ON_HOLD]
 *               commission:
 *                 type: object
 *                 properties:
 *                   personName:
 *                     type: string
 *                   amountPerM3:
 *                     type: number
 *                   includeInProjectCost:
 *                     type: boolean
 *               credit:
 *                 type: object
 *                 properties:
 *                   amount:
 *                     type: number
 *                   resetPeriodDays:
 *                     type: integer
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Project updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.put(
  "/:projectId",
  verifyToken,
  updateProject
);

/**
 * @swagger
 * /api/admin/project/{projectId}:
 *   delete:
 *     summary: Delete project
 *     tags: [Project]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Project deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.delete("/:projectId", verifyToken, deleteProject);

export default router;
