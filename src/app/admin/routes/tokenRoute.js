import { Router } from 'express'
import jsonwebtoken from "jsonwebtoken";
import { encrypt } from '../../../helper/security.js';
import { generateToken } from '../../../config/jwtConfig.js';

const { sign } = jsonwebtoken;


const tokenRoute = Router();

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