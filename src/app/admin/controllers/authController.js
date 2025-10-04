import { validatorFunction } from "../../../helper/validate.js";
import { loginValidation } from "../validations/authValidation.js";
import db from "../../../config/database.js";
import { decrypt } from "../../../helper/security.js";
import { generateToken } from "../../../config/jwtConfig.js";
import { getEmailVerificationMessage, sendMail } from "../../../helper/mailService.js";
import { $Enums } from "@prisma/client";
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




/**
 * Sends a one-time password (OTP) to the user's email address for password reset.
 * @param {Object} req - Express request object containing email address in body
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status and message
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
        console.log(error);
        return res.status(500).json({ success: false, message: "Something went wrong", data: null, error: error.message });
    }
}