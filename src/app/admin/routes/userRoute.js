import { Router } from 'express'
import * as userController from "../controllers/userController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const userData = Router();

/**
 * @swagger
 * /api/v1/admin/user:
 *   post:
 *     summary: Create a new user
 *     description: Create a new user (requires authentication)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
userData.post('/', verifyToken, userController.createUser);

/**
 * @swagger
 * /api/v1/admin/user/all:
 *   get:
 *     summary: Get all users
 *     description: Retrieve a list of all users (requires authentication)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
userData.get('/all', verifyToken, userController.getAllUsers);

/**
 * @swagger
 * /api/v1/admin/user:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a specific user by ID (requires authentication)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 *       404:
 *         description: User not found
 */
userData.get('/', verifyToken, userController.getUser);

/**
 * @swagger
 * /api/v1/admin/user:
 *   put:
 *     summary: Update user
 *     description: Update an existing user (requires authentication)
 *     tags: [Users]
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
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
userData.put('/', verifyToken, userController.updateUser);

/**
 * @swagger
 * /api/v1/admin/user:
 *   delete:
 *     summary: Soft delete user
 *     description: Soft delete a user (requires authentication)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
userData.delete('/', verifyToken, userController.deleteUser);

/**
 * @swagger
 * /api/v1/admin/user/hard:
 *   delete:
 *     summary: Hard delete user
 *     description: Permanently delete a user from database (requires authentication)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to permanently delete
 *     responses:
 *       200:
 *         description: User permanently deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
userData.delete("/hard", verifyToken, userController.deleteUserFromTable);

/**
 * @swagger
 * /api/v1/admin/user/reset-password:
 *   put:
 *     summary: Reset user password
 *     description: Reset password for a user (requires authentication)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - newPassword
 *             properties:
 *               id:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Token required
 */
userData.put("/reset-password", verifyToken, userController.resetPassword);

export default userData;