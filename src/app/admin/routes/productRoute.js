import { Router } from 'express'
import * as productController from "../controllers/productController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const productRoute = Router();

/**
 * @swagger
 * /api/v1/admin/product:
 *   post:
 *     summary: Create a new product
 *     description: Create a new product (requires authentication)
 *     tags: [Products]
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
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.post('/', verifyToken, productController.createProduct);

/**
 * @swagger
 * /api/v1/admin/product:
 *   get:
 *     summary: Get all products
 *     description: Retrieve a list of all products (requires authentication)
 *     tags: [Products]
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
 *     responses:
 *       200:
 *         description: List of products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.get("/", verifyToken, productController.GetAllProducts);

/**
 * @swagger
 * /api/v1/admin/product/{id}:
 *   get:
 *     summary: Get product by ID
 *     description: Retrieve a specific product by ID (requires authentication)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: Product not found
 */
productRoute.get("/:id", verifyToken, productController.GetProductById);

/**
 * @swagger
 * /api/v1/admin/product:
 *   put:
 *     summary: Update product
 *     description: Update an existing product (requires authentication)
 *     tags: [Products]
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
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Product updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.put("/", verifyToken, productController.updateProduct);

/**
 * @swagger
 * /api/v1/admin/product/{id}:
 *   delete:
 *     summary: Soft delete product
 *     description: Soft delete a product (requires authentication)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID to delete
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.delete("/:id", verifyToken, productController.deleteProduct);

/**
 * @swagger
 * /api/v1/admin/product/hard/{id}:
 *   delete:
 *     summary: Hard delete product
 *     description: Permanently delete a product from database (requires authentication)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID to permanently delete
 *     responses:
 *       200:
 *         description: Product permanently deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.delete("/hard/:id", verifyToken, productController.deleteProductFromTable);

/**
 * @swagger
 * /api/v1/admin/product/size:
 *   post:
 *     summary: Create product size
 *     description: Add a new size to a product (requires authentication)
 *     tags: [Product Sizes]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - size
 *             properties:
 *               productId:
 *                 type: string
 *               size:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Size created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.post('/size', verifyToken, productController.createSize);

/**
 * @swagger
 * /api/v1/admin/product/size/{productId}:
 *   get:
 *     summary: Get sizes by product ID
 *     description: Retrieve all sizes for a specific product (requires authentication)
 *     tags: [Product Sizes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Sizes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.get("/size/:productId", verifyToken, productController.getSizesByProductId);

/**
 * @swagger
 * /api/v1/admin/product/size:
 *   put:
 *     summary: Update product size
 *     description: Update an existing size (requires authentication)
 *     tags: [Product Sizes]
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
 *               size:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Size updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.put("/size", verifyToken, productController.updateSize);

/**
 * @swagger
 * /api/v1/admin/product/size/{id}:
 *   delete:
 *     summary: Delete product size
 *     description: Delete a size from a product (requires authentication)
 *     tags: [Product Sizes]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Size ID to delete
 *     responses:
 *       200:
 *         description: Size deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
productRoute.delete("/size/:id", verifyToken, productController.deleteSize);

export default productRoute;    