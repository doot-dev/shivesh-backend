import { validatorFunction } from "../../../helper/validate.js";
import { leadValidation } from "../validations/leadValidation.js";
import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { createActivityLog } from "../../../helper/activityLogger.js";

export const upsertLead = async (req, res) => {
    const { err, status } = await validatorFunction(req.body, leadValidation);
    if (!status) {
        return res.status(400).json({ success: false, message: "Validation Error", errors: err });
    }

    try {
        const { companyName, contactPerson, email, phone, address, source, status, assignedToId, requirement, id } = req.body;

        const isNew = !id;

        const newLead = {
            companyName,
            contactPerson,
            email,
            phone,
            address,
            source,
            status,
            assignedToId,
            requirement,
        };

        const result = await db.lead.upsert({
            where: { id: id || "" },
            update: newLead,
            create: newLead,
        });

        // 🧠 Log activity
        await createActivityLog({
            title: isNew ? "Lead created" : "Lead updated",
            description: `${isNew ? "New lead created" : "Lead details updated"} for ${contactPerson}.`,
            entityType: "LEAD",
            entityId: result.id,
            action: isNew ? "CREATED" : "UPDATED",
            createdById: req.user.id || null,
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
export const updateLead = async (req, res) => {
    try {
        const { leadId } = req.query;
        const { date, time, title, description, status, assignedToId } = req.body;
        const lead = await db.lead.findUnique({ where: { id: leadId } });

        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        const updatedLead = await db.lead.update({
            where: { id: leadId },
            data: { date: new Date(date), time, title, description, status, assignedToId },
        });

        // 🧠 Detect and log changes
        if (status && status !== lead.status) {
            await createActivityLog({
                title: `Lead status changed to ${status}`,
                description: `Status updated from ${lead.status} → ${status}.`,
                entityType: "LEAD",
                entityId: leadId,
                action: "STATUS_CHANGED",
                createdById: req.user.data.id || null,
            });
        }

        if (assignedToId && assignedToId !== lead.assignedToId) {
            const assignedUser = await db.user.findUnique({ where: { id: assignedToId } });
            await createActivityLog({
                title: `Lead assigned to ${assignedUser?.name || "User"}`,
                description: `Lead assigned to ${assignedUser?.name || "User"}.`,
                entityType: "LEAD",
                entityId: leadId,
                action: "ASSIGNED",
                createdById: req.user.id || null,
            });
        }

        return res.status(200).json({ success: true, data: updatedLead });
    } catch (error) {
        logger.error("Error updating lead:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
export const getActivityLogs = async (req, res) => {
    try {
        
        const activityLogs = await db.activity.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { id: true, name: true, } },
            }
        });
        return res.status(200).json({ success: true, data: activityLogs });
    } catch (error) {
        logger.error("Error fetching activity logs:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
export const getLead = async (req, res) => {
    try {
        const { leadId } = req.query;
        const lead = await db.lead.findUnique({ where: { id: leadId } });
        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }
        const activityLogs = await db.activity.findMany({
            where: { entityType: "LEAD", entityId: leadId },
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { id: true, name: true, } },
            }
        });
        lead.activityLogs = activityLogs;
        return res.status(200).json({ success: true, data: lead });
    } catch (error) {
        logger.error("Error fetching lead:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
}

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
