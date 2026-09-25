import { validatorFunction } from "../../../helper/validate.js";
import { resetPasswordValidation, userUpdateValidation, userValidation } from "../validations/userValidation.js";
import db from "../../../config/database.js";
import { encrypt } from "../../../helper/security.js";
import { verifyPassword } from "../../../helper/passwordHelper.js";
import logger from "../../../helper/logger.js";
import { ungrantableRole } from "../../../helper/accessControl.js";

/** Role id from a request body: a positive integer, else null. Never 0 — `Number(null)` is 0 and breaks the FK. */
function parseRoleId(roleId) {
    const n = Number(roleId);
    return roleId !== null && roleId !== "" && Number.isInteger(n) && n > 0 ? n : null;
}

function cannotGrant(res, missing) {
    return res.status(403).json({
        success: false,
        message: "You cannot assign permissions you do not hold yourself",
        data: { missing },
    });
}

/**
 * Creates a new user in the system.
 * Validates input, checks for duplicates, and creates a new user record.
 *
 * @function createUser
 * @async
 * @param {Request} req - Express request object containing user data in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Created user data on success, null on failure
 */
export async function createUser(req, res) {
    try {
        const { err, status } = await validatorFunction(req.body, userValidation);
        if (!status) {
            return res.status(422).json({ success: false, message: "Validation Error", data: err });
        }
        const { name, employeeId, userName, password, role, roleId, isSuperAdmin } = req.body;
        const existingUser = await db.user.findFirst({
            where: {
                OR: [
                    { userName: userName },
                    { employeeId: employeeId }
                ],
                AND: { isDeleted: false }
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
        // Only an existing super admin may mint another one. Without this check
        // anyone who can create a user could hand themselves unrestricted
        // access by simply posting isSuperAdmin: true.
        const grantSuper = Boolean(isSuperAdmin) && req.access?.isSuperAdmin === true;

        const newRoleId = parseRoleId(roleId);
        const missing = await ungrantableRole(req.access, newRoleId);
        if (missing.length) return cannotGrant(res, missing);

        const hashedPassword = encrypt(password);
        const userData = await db.user.create({
            data: {
                name: name,
                employeeId: employeeId,
                userName: userName,
                password: hashedPassword,
                role: role,
                roleId: newRoleId,
                isSuperAdmin: grantSuper,
                status: true
            }
        });

        return res.status(200).json({ success: true, message: "User created successfully", data: userData });
    } catch (error) {
        logger.error('createUser error:', error);
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Updates an existing user in the system.
 * Validates input, checks for duplicates, and updates user record.
 *
 * @function updateUser
 * @async
 * @param {Request} req - Express request object containing user data in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Updated user data on success, null on failure
 */
export async function updateUser(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, userUpdateValidation);
        if (!validationStatus) {
            return res.status(422).json({ success: false, message: "Validation Error", data: err });
        }

        const { id, name, employeeId, userName, role, roleId, isSuperAdmin, status } = req.body;

        const existingUser = await db.user.findUnique({
            where: { id: parseInt(id), isDeleted: false }
        });

        if (!existingUser) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }

        // Only a super admin may touch a super admin's account — otherwise
        // users.update could disable or rename the people above you.
        if (existingUser.isSuperAdmin && req.access?.isSuperAdmin !== true) {
            return res.status(403).json({ success: false, message: "Only a super admin can edit a super admin", data: null });
        }

        const updateData = {
            name,
            employeeId,
            userName,
            role,
            status: status == "true" || status == true ? true : false
        };

        if (roleId !== undefined) {
            updateData.roleId = parseRoleId(roleId);
            if (updateData.roleId !== existingUser.roleId) {
                const missing = await ungrantableRole(req.access, updateData.roleId);
                if (missing.length) return cannotGrant(res, missing);
            }
        }

        // Same escalation guard as create, plus one extra rule: a super admin
        // cannot remove their OWN flag. Doing so would strip the last person
        // able to restore it, with no way back in from the panel.
        if (isSuperAdmin !== undefined && req.access?.isSuperAdmin === true) {
            const targetIsSelf = parseInt(id) === req.access.user.id;
            if (!(targetIsSelf && !isSuperAdmin)) {
                updateData.isSuperAdmin = Boolean(isSuperAdmin);
            }
        }

        // Check if userName or employeeId already exists for a different user
        const duplicateUser = await db.user.findFirst({
            where: {
                OR: [
                    { userName: userName },
                    { employeeId: employeeId }
                ],
                AND: [
                    { isDeleted: false },
                    { id: { not: parseInt(id) } }
                ]
            }
        });

        if (duplicateUser) {
            const duplicateField = duplicateUser.userName === userName ? "Username" : "Employee ID";
            return res.status(409).json({
                success: false,
                message: `${duplicateField} already exists`,
                data: null
            });
        }

        const updatedUser = await db.user.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        return res.status(200).json({ success: true, message: "User updated successfully", data: updatedUser });
    } catch (error) {
        logger.error('updateUser error:', error);
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Retrieves a single user by ID.
 *
 * @function getUser
 * @async
 * @param {Request} req - Express request object containing user ID in query
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: User data on success, null on failure
 */
export async function getUser(req, res) {
    try {
        const { id } = req.query;

        const user = await db.user.findUnique({
            where: { id: parseInt(id), isDeleted: false },
            include: {
                roleRef: { select: { id: true, name: true, isActive: true } },
                permissionOverrides: { select: { permission: true, effect: true } },
            },
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }
        delete user.password; // never send a password back to the panel
        return res.status(200).json({ success: true, message: "User retrieved successfully", data: user });
    } catch (error) {
        logger.error('getUser error:', error);
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Retrieves all users from the system.
 *
 * @function getAllUsers
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Array|null}: Array of users on success, null on failure
 */
export async function getAllUsers(req, res) {
    try {
        const users = await db.user.findMany({
            where: { isDeleted: false },
            select: {
                id: true,
                name: true,
                employeeId: true,
                userName: true,
                role: true,
                status: true,
                roleId: true,
                isSuperAdmin: true,
                roleRef: { select: { id: true, name: true, isActive: true } },
                createdAt: true,
                updatedAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return res.status(200).json({ success: true, message: "Users retrieved successfully", data: users });
    } catch (error) {
        logger.error('getAllUsers error:', error);
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Deletes a user from the system (soft delete).
 *
 * @function deleteUser
 * @async
 * @param {Request} req - Express request object containing user ID in query
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {null}: Always null
 */
export async function deleteUser(req, res) {
    try {
        if (!req.query?.id) {
            return res.status(400).json({ success: false, message: "User ID is required", data: null });
        }
        const { id } = req.query;

        const existingUser = await db.user.findUnique({
            where: { id: parseInt(id), isDeleted: false }
        });

        if (!existingUser) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }

        await db.user.update({
            where: { id: parseInt(id) },
            data: { isDeleted: true }
        });

        return res.status(200).json({ success: true, message: "User deleted successfully", data: null });
    } catch (error) {
        logger.error('deleteUser error:', error);
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}


/**
 * Permanently deletes a user from the system (hard delete).
 *
 * @function deleteUserFromTable
 * @async
 * @param {Request} req - Express request object containing user ID in query
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {null}: Always null
 */
export async function deleteUserFromTable(req, res) {
    try {
        if (!req.query?.id) {
            return res.status(400).json({ success: false, message: "User ID is required", data: null });
        }
        const { id } = req.query;

        const existingUser = await db.user.findUnique({
            where: { id: parseInt(id) }
        });

        if (!existingUser) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }

        await db.user.delete({
            where: { id: parseInt(id) },
        });

        return res.status(200).json({ success: true, message: "User deleted successfully", data: null });
    } catch (error) {
        logger.error('deleteUserFromTable error:', error);
        return res.status(400).json({ success: false, message: error.message, data: null });
    }
}


/**
 * Resets the password of a user.
 * Validates input, checks old password, and updates to new password.
 *
 * @function resetPassword
 * @async
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {null}: Always null
 */
export async function resetPassword(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, resetPasswordValidation);
        if (!validationStatus) {
            return res.status(422).json({ success: false, message: "Validation Error", data: err });
        }

        const { id, oldPassword, newPassword } = req.body;

        const user = await db.user.findUnique({
            where: { id: parseInt(id) }
        });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found", data: null });
        }
        // The route already requires users.update, so an admin can set a new
        // password without knowing the old one. If an old one is sent, check it.
        if (oldPassword && !verifyPassword(oldPassword, user.password)) {
            return res.status(400).json({ success: false, message: "Old password does not match", data: null });
        }
        const hashedNewPassword = encrypt(newPassword);
        await db.user.update({
            where: { id: parseInt(id) },
            data: { password: hashedNewPassword }
        });

        return res.status(200).json({ success: true, message: "Password reset successfully", data: null });

    } catch (error) {
        logger.error('resetPassword error:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}