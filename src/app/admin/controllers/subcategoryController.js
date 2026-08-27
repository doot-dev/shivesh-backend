import { validatorFunction } from "../../../helper/validate.js";
import {
    createSubcategoryValidation,
    updateSubcategoryValidation,
    deleteSubcategoryValidation,
    getSubcategoryByIdValidation,
} from "../validations/subcategoryValidation.js";
import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";

/**
 * Creates a sub-category master entry.
 *
 * Names are unique and stored trimmed, because consumers (project products)
 * copy this name BY VALUE onto their own row — a duplicate or untrimmed entry
 * here silently produces two "different" sub-categories downstream.
 *
 * @function createSubcategory
 * @async
 * @param {Request} req - Express request object containing sub-category name in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Created sub-category on success, null on failure
 */
export async function createSubcategory(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, createSubcategoryValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const name = String(req.body.name).trim();
        if (!name) {
            return res.status(422).json({ success: false, message: "Sub-category name is required", data: null });
        }

        const duplicate = await db.subcategory.findFirst({ where: { name } });
        if (duplicate) {
            // A soft-deleted row still occupies the unique name, so revive it
            // instead of failing on the DB constraint.
            if (duplicate.isDeleted) {
                const revived = await db.subcategory.update({
                    where: { id: duplicate.id },
                    data: { isDeleted: false, isActive: true },
                });
                return res.status(201).json({ success: true, message: "Sub-category created successfully", data: revived });
            }
            return res.status(409).json({ success: false, message: "Sub-category already exists", data: null });
        }

        const data = await db.subcategory.create({ data: { name } });

        return res.status(201).json({ success: true, message: "Sub-category created successfully", data });
    } catch (error) {
        logger.error('Error creating sub-category:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Retrieves sub-categories with pagination and optional name search.
 *
 * @function GetAllSubcategories
 * @async
 * @param {Request} req - Express request object (page, length, search in query)
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Array|null}: Array of sub-categories on success, null on failure
 *   - meta {Object}: Pagination info
 */
export async function GetAllSubcategories(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const length = parseInt(req.query.length) || 10;
        const skip = (page - 1) * length;
        const search = req.query.search || '';

        const whereClause = {
            isDeleted: false,
            ...(search && { name: { contains: search } }),
        };

        const subcategories = await db.subcategory.findMany({
            where: whereClause,
            skip: skip,
            take: length,
            orderBy: { name: 'asc' },
        });

        const subcategoryCount = await db.subcategory.count({ where: whereClause });
        const totalPages = Math.ceil(subcategoryCount / length);

        logger.info(`Retrieved ${subcategories.length} sub-categories from the database.`);

        return res.status(200).json({
            success: true,
            message: "Sub-categories fetched successfully",
            data: subcategories,
            meta: {
                count: subcategoryCount,
                totalPages: totalPages,
                currentPage: page,
                limit: length,
            },
        });
    } catch (error) {
        logger.error('Error retrieving sub-categories:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Retrieves a single sub-category by ID.
 *
 * @function GetSubcategoryById
 * @async
 * @param {Request} req - Express request object containing sub-category ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Sub-category on success, null on failure
 */
export async function GetSubcategoryById(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.params, getSubcategoryByIdValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id } = req.params;

        const subcategory = await db.subcategory.findFirst({
            where: { id: parseInt(id), isDeleted: false },
        });

        if (!subcategory) {
            return res.status(404).json({ success: false, message: "Sub-category not found", data: null });
        }

        return res.status(200).json({ success: true, message: "Sub-category fetched successfully", data: subcategory });
    } catch (error) {
        logger.error('Error retrieving sub-category:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Updates a sub-category master entry.
 *
 * Renaming here does NOT touch project products that already copied the old
 * name — that decoupling is intentional (see the Subcategory model comment).
 *
 * @function updateSubcategory
 * @async
 * @param {Request} req - Express request object containing sub-category data in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Updated sub-category on success, null on failure
 */
export async function updateSubcategory(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, updateSubcategoryValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id, isActive } = req.body;
        const name = String(req.body.name).trim();

        if (!name) {
            return res.status(422).json({ success: false, message: "Sub-category name is required", data: null });
        }

        const existing = await db.subcategory.findFirst({
            where: { id: parseInt(id), isDeleted: false },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Sub-category not found", data: null });
        }

        const duplicate = await db.subcategory.findFirst({
            where: { name, id: { not: parseInt(id) } },
        });
        if (duplicate) {
            return res.status(409).json({ success: false, message: "Sub-category already exists", data: null });
        }

        const updated = await db.subcategory.update({
            where: { id: parseInt(id) },
            data: { name, isActive },
        });

        return res.status(200).json({ success: true, message: "Sub-category updated successfully", data: updated });
    } catch (error) {
        logger.error('Error updating sub-category:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Soft-deletes a sub-category. Existing project products keep the name they
 * already copied; only future selections lose this option.
 *
 * @function deleteSubcategory
 * @async
 * @param {Request} req - Express request object containing sub-category ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {null}: Always null
 */
export async function deleteSubcategory(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.params, deleteSubcategoryValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { id } = req.params;

        const existing = await db.subcategory.findFirst({
            where: { id: parseInt(id), isDeleted: false },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Sub-category not found", data: null });
        }

        await db.subcategory.update({
            where: { id: parseInt(id) },
            data: { isDeleted: true },
        });

        return res.status(200).json({ success: true, message: "Sub-category deleted successfully", data: null });
    } catch (error) {
        logger.error('Error deleting sub-category:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}

/**
 * Flips a sub-category between active and inactive.
 *
 * @function toggleSubcategoryStatus
 * @async
 * @param {Request} req - Express request object containing sub-category ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Updated sub-category on success, null on failure
 */
export async function toggleSubcategoryStatus(req, res) {
    try {
        const { id } = req.params;

        const subcategory = await db.subcategory.findFirst({
            where: { id: parseInt(id), isDeleted: false },
        });
        if (!subcategory) {
            return res.status(404).json({ success: false, message: "Sub-category not found", data: null });
        }

        const updated = await db.subcategory.update({
            where: { id: parseInt(id) },
            data: { isActive: !subcategory.isActive },
        });

        return res.status(200).json({
            success: true,
            message: `Sub-category ${updated.isActive ? 'activated' : 'deactivated'}`,
            data: updated,
        });
    } catch (error) {
        logger.error('Error toggling sub-category status:', error);
        return res.status(500).json({ success: false, message: error.message, data: null });
    }
}
