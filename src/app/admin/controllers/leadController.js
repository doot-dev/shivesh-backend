import { validatorFunction } from "../../../helper/validate.js";
import { leadValidation } from "../validations/leadValidation.js";
import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";

export const upsertLead = async (req, res) => {
    const { err, status } = await validatorFunction(req.body, leadValidation);
    if (!status) {
        return res.status(400).json({ success: false, message: "Validation Error", errors: err });
    }
    try {
        const { companyName, contactPerson, email, phone, address, source, status, assignedToId, requirement } = req.body;

        const newLead = {
            companyName,
            contactPerson,
            email,
            phone,
            address,
            source,
            status,
            assignedToId,
            requirement

        };

        const result = await db.lead.upsert({
            where: { id: req.body.id || "" },
            update: newLead,
            create: newLead
        });
        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        logger.error("Error creating lead:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
export const getLeads = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const length = parseInt(req.query.length) || 10;
        const skip = (page - 1) * length;
        const search = req.query.search?.trim() || '';

        // Build OR filter dynamically only for searchable (string) fields
        const orFilters = [
            { companyName: { contains: search, mode: 'insensitive' } },
            { contactPerson: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { address: { contains: search, mode: 'insensitive' } },
            { source: { contains: search, mode: 'insensitive' } },
        ];

        const where = search
            ? { OR: orFilters }
            : {}; // if no search, return all

        const totalCount = await db.lead.count({ where });
        const leads = await db.lead.findMany({
            where,
            skip,
            take: length,
            orderBy: { createdAt: 'desc' },
        });

        return res.status(200).json({
            success: true,
            data: leads,
            meta: { page, length, totalCount },
        });
    } catch (error) {
        logger.error("Error fetching leads:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
export const deleteLead = async (req, res) => {
    try {
        const { leadId } = req.query;
        console.log("Deleting lead with ID:", leadId);
        const lead = await db.lead.findUnique({ where: { id: leadId } });
        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        await db.lead.delete({ where: { id: leadId } });
        return res.status(200).json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
        logger.error("Error deleting lead:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
