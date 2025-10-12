import { validatorFunction } from "../../../helper/validate.js";
import { loginValidation } from "../validations/authValidation.js";
import db from "../../../config/database.js";
import { decrypt } from "../../../helper/security.js";
import { generateToken } from "../../../config/jwtConfig.js";
import { getEmailVerificationMessage, sendMail } from "../../../helper/mailService.js";
import { $Enums } from "@prisma/client";
import logger from "../../../helper/logger.js";
/**
 * Logs a user into the system.
 * Validates credentials, checks user status, and returns a JWT token on success.
 *
 * @function login
 * @async
 * @param {Request} req - Express request object containing userName and password in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: User data and JWT token on success, null on failure
 */
export async function login(req, res) {
    try {
        const { err, status } = await validatorFunction(req.body, loginValidation);
        if (!status) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
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




/**
 * Sends a one-time password (OTP) to the user's email address for password reset.
 * Generates and stores OTP, sends it via email, and returns OTP details in response.
 *
 * @function forgetPassword
 * @async
 * @param {Request} req - Express request object containing userName in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: OTP details on success, null on failure
 */
export async function forgetPassword(req, res) {
    try {
        const { userName } = req.body;

        const user = await db.user.findFirst({
            where: { userName: userName }
        })

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }
        const otpCode = Math.floor(1000 + Math.random() * 9000);

        const otpCreated = await db.oTP.create({
            data: {
                finder: userName,
                otp: otpCode,
                mode: $Enums.MODE.EMAIL,
            }
        });

        if (!otpCreated) {
            return res.status(500).json({ success: false, message: "Failed to create OTP", data: null });
        }
        // Generate OTP and send email logic here
        const mailOptions = {
            from: process.env.EMAIL_ID,
            to: "tejas.tamkar@gmail.com",
            subject: "Email Verification",
            html: getEmailVerificationMessage(otpCode),
        };

        await sendMail(mailOptions);

        return res.status(200).json({
            success: true, message: "OTP sent successfully", data: {
                finder: email,
                otp: otpCode,
                mode: $Enums.MODE.EMAIL
            }
        });
    } catch (error) {
        logger.error('Error sending OTP:', error);
        return res.status(500).json({ success: false, message: "Something went wrong", data: null, error: error.message });
    }
}