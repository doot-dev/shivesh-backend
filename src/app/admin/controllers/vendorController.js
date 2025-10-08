import logger from "../../../helper/logger.js";
import { createVendorValidation } from "../validations/vendorValidation.js";
import db from "../../../config/database.js";
import { validatorFunction } from "../../../helper/validate.js";

export async function createVendor(req, res) {
    try {

        const { err, status: validationStatus } = await validatorFunction(req.body, createVendorValidation);
        if (!validationStatus) {
            return res.status(422).json({ message: "Validation Error", errors: err });
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
        return res.status(201).json({ message: 'Vendor created successfully', data: newVendor });

    } catch (error) {
        logger.error('Error creating vendor:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getAllVendors(req, res) {
    try {
        const vendors = await db.vendor.findMany({
            where: { isDeleted: false },
            include: { locations: { 
                where: { isDeleted: false },
                include: { handlers: { where: { isDeleted: false } } }
            } }
        });
        return res.status(200).json({ message: 'Vendors retrieved successfully', data: vendors });
    } catch (error) {
        logger.error('Error retrieving vendors:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getVendor(req, res) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'Vendor ID is required' });
        }

        const vendor = await db.vendor.findFirst({
            where: { id: parseInt(id), isDeleted: false }, 
            include: {
                locations:{
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
            return res.status(404).json({ message: 'Vendor not found' });
        }

        return res.status(200).json({ message: 'Vendor retrieved successfully', data: vendor });
    } catch (error) {
        logger.error('Error retrieving vendor:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function deleteVendor(req, res) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'Vendor ID is required' });
        }
        const vendor = await db.vendor.findFirst({ where: { id: parseInt(id), isDeleted: false } });
        if (!vendor) {
            return res.status(404).json({ message: 'Vendor not found' });
        }
        
        await db.vendor.update({
            where: { id: parseInt(id) },
            data: { isDeleted: true }
        });

        return res.status(200).json({ message: 'Vendor deleted successfully' });
    } catch (error) {
        logger.error('Error deleting vendor:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
