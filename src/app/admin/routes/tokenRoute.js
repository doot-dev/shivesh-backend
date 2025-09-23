import { Router } from 'express'
import jsonwebtoken from "jsonwebtoken";
import {  encrypt } from '../../../helper/security.js';

const { sign } = jsonwebtoken;


const tokenRoute = Router();

// GET route to create and return JWT token
tokenRoute.get('/', (req, res) => {
    try {
        // Payload for the token (customize as needed)
        const payload = {
            userId: req.query.userId || '1',
            role: req.query.role || 'ADMIN',
            iat: Date.now()
        };

        // Generate JWT token
        const token = sign(
            payload,
            process.env.JWT_TOKEN || 'fallback-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            data: { 
                token: encrypt(token)  // Encrypt the token before sending
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