import { Router } from 'express'
import jsonwebtoken from "jsonwebtoken";
import { encrypt } from '../../../helper/security.js';
import { generateToken } from '../../../config/jwtConfig.js';

const { sign } = jsonwebtoken;

const tokenRoute = Router();

/**
 * @swagger
 * /api/v1/admin/token:
 *   get:
 *     summary: Generate JWT token for testing
 *     description: Generate an encrypted JWT token for API testing (Development only)
 *     tags: [Development]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           default: '1'
 *         description: User ID to include in token
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           default: 'ADMIN'
 *         description: User role to include in token
 *     responses:
 *       200:
 *         description: Token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: Encrypted JWT token (expires in 24 hours)
 *                 message:
 *                   type: string
 *                   example: Token generated successfully will get expired in 24 hours
 *       500:
 *         description: Error generating token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET route to create and return JWT token
tokenRoute.get('/', async (req, res) => {
    try {
        // Payload for the token (customize as needed)
        const payload = {
            userId: req.query.userId || '1',
            role: req.query.role || 'ADMIN',
        };

        // Generate JWT token
        const token = generateToken(payload);

        res.json({
            success: true,
            data: {
                token: token  // Encrypt the token before sending
            },
            message: 'Token generated successfully will get expired in 24 hours, to use the token put it in req.body.token || req.headers["authorization"] || req.query.token;'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating token',
            error: error.message
        });
    }
});

export default tokenRoute;