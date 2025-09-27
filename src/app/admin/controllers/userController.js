import { validatorFunction } from "../../../helper/validate.js";
import { userUpdateValidation, userValidation } from "../validations/userValidation.js";
import db from "../../../config/database.js";
import { encrypt } from "../../../helper/security.js";

/**
 * Creates a new user in the system
 * @param {Object} req - Express request object containing user data in body
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status and user data
 */
export async function createUser(req, res) {
    try {
        const { err, status } = await validatorFunction(req.body, userValidation);
        if (!status) {
            return res.status(422).json({ message: "Validation Error", errors: err });
        }
        const { name, employeeId, userName, password, role, menuAccess } = req.body;
        const existingUser = await db.user.findFirst({
            where: {
                OR: [
                    { userName: userName },
                    { employeeId: employeeId }
                ]
            }
        });

        if (existingUser) {
            const duplicateField = existingUser.userName === userName ? "Username" : "Employee ID";
            return res.status(409).json({ 
                success: false, 
                message: `${duplicateField} already exists`, 
                data: null 
            });
        }
        const hashedPassword = encrypt(password);
        const userData = await db.user.create({
            data: {
                name: name,
                employeeId: employeeId,
                userName: userName,
                password: hashedPassword,
                role: role,
                menuAccess: menuAccess,
                status: true
            }
        });

        return res.status(200).json({ success: true, message: "User created successfully", data: userData });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Updates an existing user in the system
 * @param {Object} req - Express request object containing user data in body
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status and updated user data
 */
export async function updateUser(req, res) {
    try {
        const { err, status } = await validatorFunction(req.body, userUpdateValidation);
        if (!status) {
            return res.status(422).json({ message: "Validation Error", errors: err });
        }

        const { id, name, employeeId, userName, password, role, menuAccess } = req.body;

        const existingUser = await db.user.findUnique({
            where: { id: parseInt(id) }
        });

        if (!existingUser) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }

        const updateData = {
            name,
            employeeId,
            userName,
            role,
            menuAccess
        };

        if (password) {
            updateData.password = encrypt(password);
        }

        const updatedUser = await db.user.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        return res.status(200).json({ success: true, message: "User updated successfully", data: updatedUser });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Retrieves a single user by ID
 * @param {Object} req - Express request object containing user ID in params
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status and user data
 */
export async function getUser(req, res) {
    try {
        const { userId:id } = req.user;

        const user = await db.user.findUnique({
            where: { id: parseInt(id) },
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }

        return res.status(200).json({ success: true, message: "User retrieved successfully", data: user });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Retrieves all users from the system
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status and array of users
 */
export async function getAllUsers(req, res) {
    try {
        const users = await db.user.findMany({
            select: {
                id: true,
                name: true,
                employeeId: true,
                userName: true,
                role: true,
                menuAccess: true,
                status: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return res.status(200).json({ success: true, message: "Users retrieved successfully", data: users });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Deletes a user from the system
 * @param {Object} req - Express request object containing user ID in query
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success status
 */
export async function deleteUser(req, res) {
    try {
        const { id } = req.query;

        const existingUser = await db.user.findUnique({
            where: { id: parseInt(id) }
        });

        if (!existingUser) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }

        await db.user.delete({
            where: { id: parseInt(id) }
        });

        return res.status(200).json({ success: true, message: "User deleted successfully", data: null });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}