import logger from "../../../helper/logger.js";
import { createVendorValidation, updateVendorValidation } from "../validations/vendorValidation.js";
import db from "../../../config/database.js";
import { validatorFunction } from "../../../helper/validate.js";

/**
 * Creates a new vendor in the system.
 * Validates input and creates a new vendor record.
 *
 * @function createVendor
 * @async
 * @param {Request} req - Express request object containing vendor data in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Created vendor data on success, null on failure
 */
export async function createVendor(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.body, createVendorValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }

        const { companyName, ownerName, phone, address } = req.body;

        const newVendor = await db.vendor.create({
            data: {
                companyName: companyName,
                ownerName: ownerName,
                phone: phone,
                address: address,
                email: req.body.email || null,
                gstNumber: req.body.gstNumber || null,
                panNumber: req.body.panNumber || null,
            }
        });

        logger.info('Vendor created successfully:', newVendor);
        return res.status(201).json({ message: 'Vendor created successfully', data: newVendor, success: true });

    } catch (error) {
        logger.error('Error creating vendor:', error);
        return res.status(500).json({ message: 'Internal server error', success: false, data: null });
    }
}

/**
 * Retrieves all vendors from the system.
 * Supports pagination and optional location inclusion.
 *
 * @function getAllVendors
 * @async
 * @param {Request} req - Express request object containing page, length, and includeLocations query parameters
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Array|null}: Array of vendors on success, null on failure
 */
export async function getAllVendors(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const length = parseInt(req.query.length) || 10;
        const skip = (page - 1) * length;
        const includeLocations = req.query.includeLocations || false;

        const vendors = await db.vendor.findMany({
            where: { isDeleted: false },
            skip: skip,
            take: length,
        });

        if (includeLocations) {
            vendors.forEach(async (vendor) => {
                vendor.locations = await db.location.findMany({
                    where: { vendorId: vendor.id, isDeleted: false },
                    include: {
                        handlers: {
                            where: { isDeleted: false }
                        }
                    }
                });
            });
        }


        return res.status(200).json({ message: 'Vendors retrieved successfully', data: vendors, success: true });
    } catch (error) {
        logger.error('Error retrieving vendors:', error);
        return res.status(500).json({ message: 'Internal server error', success: false, data: null });
    }
}

/**
 * Retrieves a single vendor by ID.
 *
 * @function getVendor
 * @async
 * @param {Request} req - Express request object containing vendor ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Vendor data on success, null on failure
 */
export async function getVendor(req, res) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'Vendor ID is required', success: false, data: null });
        }

        const vendor = await db.vendor.findFirst({
            where: { id: parseInt(id), isDeleted: false },
            include: {
                locations: {
                    where: { isDeleted: false },
                    include: {
                        handlers: {
                            where: { isDeleted: false }
                        }
                    }
                }
            }
        });

        if (!vendor) {
            return res.status(404).json({ message: 'Vendor not found', success: false, data: null });
        }

        return res.status(200).json({ message: 'Vendor retrieved successfully', data: vendor, success: true });
    } catch (error) {
        logger.error('Error retrieving vendor:', error);
        return res.status(500).json({ message: 'Internal server error', success: false, data: null });
    }
}

/**
 * Deletes a vendor from the system (soft delete).
 *
 * @function deleteVendor
 * @async
 * @param {Request} req - Express request object containing vendor ID in params
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {null}: Always null
 */
/**
 * Updates an existing vendor in the system.
 * Validates input and updates vendor record.
 *
 * @function updateVendor
 * @async
 * @param {Request} req - Express request object containing vendor data in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Updated vendor data on success, null on failure
 */
export async function deleteVendor(req, res) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'Vendor ID is required', success: false, data: null });
        }
        const vendor = await db.vendor.findFirst({ where: { id: parseInt(id), isDeleted: false } });
        if (!vendor) {
            return res.status(404).json({ message: 'Vendor not found', success: false, data: null });
        }

        await db.vendor.update({
            where: { id: parseInt(id) },
            data: { isDeleted: true }
        });

        return res.status(200).json({ message: 'Vendor deleted successfully', success: true, data: null });
    } catch (error) {
        logger.error('Error deleting vendor:', error);
        return res.status(500).json({ message: 'Internal server error', success: false, data: null });
    }
}

/**
 * Updates an existing vendor in the system.
 * Validates input and updates vendor record.
 *
 * @function updateVendor
 * @async
 * @param {Request} req - Express request object containing vendor data in body
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with:
 *   - success {boolean}: Operation status
 *   - message {string}: Status message
 *   - data {Object|null}: Updated vendor data on success, null on failure
 */
export async function updateVendor(req, res) {
    try {
        const { err, status: validationStatus } = await validatorFunction(req.body, updateVendorValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", data: err, success: false });
        }
        const { id, companyName, ownerName, phone, address } = req.body;
        const vendor = await db.vendor.findFirst({ where: { id: parseInt(id), isDeleted: false } });
        if (!vendor) {
            return res.status(404).json({ message: 'Vendor not found', success: false, data: null });
        }


        const updatedVendor = await db.vendor.update({
            where: { id: parseInt(id) },
            data: {
                companyName: companyName,
                ownerName: ownerName,
                phone: phone,
                address: address,
                email: req.body.email || null,
                gstNumber: req.body.gstNumber || null,
                panNumber: req.body.panNumber || null,
            }
        });

        logger.info('Vendor updated successfully:', updatedVendor);
        return res.status(200).json({ message: 'Vendor updated successfully', data: updatedVendor, success: true });

    } catch (error) {
        logger.error('Error updating vendor:', error);
        return res.status(500).json({ message: 'Internal server error', success: false, data: null });
    }
}
