import { validatorFunction } from "../../../helper/validate.js";
import { loginValidation } from "../validations/authValidation.js";
import db from "../../../config/database.js";
import { decrypt, encrypt } from "../../../helper/security.js";
import { generateToken } from "../../../config/jwtConfig.js";

/**
 * Logs a user into the system
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status and user data
 */
export async function login(req, res) {
    try {
        console.log("Login request body:", req.body);
        
        const { err, status } = await validatorFunction(req.body, loginValidation);
        if (!status) {
            return res.status(422).json({ message: "Validation Error", errors: err });
        }
        const { userName, password } = req.body;

        const userData = await db.user.findFirst({
            where: {
                userName: userName,
            }
        });

        if (!userData) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }

        if (!userData.status) {
            return res.status(403).json({ success: false, message: "User is inactive", data: null });
        }

        const isPasswordValid = decrypt(userData.password) === password;
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Invalid password", data: null });
        }
        const payload = { id: userData.id, userName: userData.userName, role: userData.role, employeeId: userData.employeeId };

        // Generate JWT token
        const token = generateToken(payload);

        return res.status(200).json({
            success: true, message: "User logged in successfully", data: {
                userName: userData.userName, role: userData.role, id: userData.id, employeeId: userData.employeeId, name: userData.name
                , token: token
            }
        });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}