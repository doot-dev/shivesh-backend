import { Router } from 'express'
import * as vendorController from "../controllers/vendorController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const vendorRoute = Router();

/**
 * @swagger
 * /api/v1/admin/vendor/handlers:
 *   post:
 *     summary: Add a handler
 *     description: Add a new handler to a location (requires authentication)
 *     tags: [Handlers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - locationId
 *               - name
 *             properties:
 *               locationId:
 *                 type: string
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Handler added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.post('/handlers', verifyToken, vendorController.addHandler);

/**
 * @swagger
 * /api/v1/admin/vendor/handlers:
 *   put:
 *     summary: Update handler
 *     description: Update an existing handler (requires authentication)
 *     tags: [Handlers]
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
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Handler updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.put('/handlers', verifyToken, vendorController.updateHandler);

/**
 * @swagger
 * /api/v1/admin/vendor/handlers/{locationId}:
 *   get:
 *     summary: Get all handlers for a location
 *     description: Retrieve all handlers for a specific location (requires authentication)
 *     tags: [Handlers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Location ID
 *     responses:
 *       200:
 *         description: Handlers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.get('/handlers/:locationId', verifyToken, vendorController.getAllHandlers);

/**
 * @swagger
 * /api/v1/admin/vendor/handlers/{id}:
 *   delete:
 *     summary: Delete handler
 *     description: Delete a handler (requires authentication)
 *     tags: [Handlers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Handler ID to delete
 *     responses:
 *       200:
 *         description: Handler deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.delete('/handlers/:id', verifyToken, vendorController.deleteHandler);

/**
 * @swagger
 * /api/v1/admin/vendor/locations:
 *   post:
 *     summary: Add a location
 *     description: Add a new location for a vendor (requires authentication)
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vendorId
 *               - address
 *             properties:
 *               vendorId:
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
 *         description: Location added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.post('/locations', verifyToken, vendorController.addLocation);

/**
 * @swagger
 * /api/v1/admin/vendor/locations/{id}:
 *   get:
 *     summary: Get location by ID
 *     description: Retrieve a specific location (requires authentication)
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Location ID
 *     responses:
 *       200:
 *         description: Location retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: Location not found
 */
vendorRoute.get('/locations/:id', verifyToken, vendorController.getLocation);

/**
 * @swagger
 * /api/v1/admin/vendor/locations:
 *   put:
 *     summary: Update location
 *     description: Update an existing location (requires authentication)
 *     tags: [Locations]
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
 *         description: Location updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.put('/locations/', verifyToken, vendorController.updateLocation);

/**
 * @swagger
 * /api/v1/admin/vendor/locations/{id}:
 *   delete:
 *     summary: Delete location
 *     description: Delete a location (requires authentication)
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Location ID to delete
 *     responses:
 *       200:
 *         description: Location deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.delete('/locations/:id', verifyToken, vendorController.deleteLocation);

/**
 * @swagger
 * /api/v1/admin/vendor:
 *   post:
 *     summary: Create a vendor
 *     description: Create a new vendor (requires authentication)
 *     tags: [Vendors]
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
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Vendor created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.post('/', verifyToken, vendorController.createVendor);

/**
 * @swagger
 * /api/v1/admin/vendor:
 *   get:
 *     summary: Get all vendors
 *     description: Retrieve a list of all vendors (requires authentication)
 *     tags: [Vendors]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Vendors retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.get('/', verifyToken, vendorController.getAllVendors);

/**
 * @swagger
 * /api/v1/admin/vendor:
 *   put:
 *     summary: Update vendor
 *     description: Update an existing vendor (requires authentication)
 *     tags: [Vendors]
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
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.put('/', verifyToken, vendorController.updateVendor);

/**
 * @swagger
 * /api/v1/admin/vendor/{vendorId}/locations:
 *   get:
 *     summary: Get all locations for a vendor
 *     description: Retrieve all locations for a specific vendor (requires authentication)
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Locations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.get('/:vendorId/locations', verifyToken, vendorController.getAllLocations);

/**
 * @swagger
 * /api/v1/admin/vendor/{id}:
 *   get:
 *     summary: Get vendor by ID
 *     description: Retrieve a specific vendor (requires authentication)
 *     tags: [Vendors]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: Vendor not found
 */
vendorRoute.get('/:id', verifyToken, vendorController.getVendor);

/**
 * @swagger
 * /api/v1/admin/vendor/{id}:
 *   delete:
 *     summary: Delete vendor
 *     description: Delete a vendor (requires authentication)
 *     tags: [Vendors]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID to delete
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
vendorRoute.delete('/:id', verifyToken, vendorController.deleteVendor);

export default vendorRoute;