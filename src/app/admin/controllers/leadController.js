import { validatorFunction } from "../../../helper/validate.js";
import { leadValidation } from "../validations/leadValidation.js";
import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { createActivityLog } from "../../../helper/activityLogger.js";
import { leadFileUrl } from "../../../config/leadUploadConfig.js";

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
            include: { assignedTo: { select: { id: true, name: true } } },
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

        // Only what was sent: an absent date used to become an Invalid Date.
        const updatedLead = await db.lead.update({
            where: { id: leadId },
            data: {
                ...(date !== undefined && { date: date ? new Date(date) : null }),
                ...(time !== undefined && { time }),
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(status !== undefined && { status }),
                ...(assignedToId !== undefined && { assignedToId: assignedToId ? Number(assignedToId) : null }),
            },
        });

        // Status and owner changes land in the lead's chat as event lines (2026-09-28).
        const events = [];
        if (status && status !== lead.status) events.push(`Status changed to ${status.replace("_", " ").toLowerCase()}`);
        if (assignedToId !== undefined && Number(assignedToId) !== lead.assignedToId) {
            const who = assignedToId ? (await db.user.findUnique({ where: { id: Number(assignedToId) }, select: { name: true } }))?.name : null;
            events.push(who ? `Assigned to ${who}` : "Unassigned");
        }
        for (const text of events) {
            await db.leadMessage.create({ data: { leadId, authorId: Number(req.user.data.id), kind: "EVENT", text } });
        }

        return res.status(200).json({ success: true, data: updatedLead });
    } catch (error) {
        logger.error("Error updating lead:", error);
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

// ─── Lead chat (2026-09-28): notes, voice notes and site photos ───────────────

const messageSelect = {
  id: true, kind: true, text: true, fileUrl: true, mimeType: true, durationSec: true, createdAt: true,
  author: { select: { id: true, name: true } },
};

/** GET /leads/:leadId/messages — the whole thread, oldest first. */
export const listLeadMessages = async (req, res) => {
    try {
        const lead = await db.lead.findUnique({ where: { id: req.params.leadId }, select: { id: true } });
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
        const data = await db.leadMessage.findMany({
            where: { leadId: lead.id }, orderBy: { createdAt: "asc" }, select: messageSelect,
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error("listLeadMessages error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * POST /leads/:leadId/messages — multipart: `text`, and optionally one `file`
 * (a photo or a voice note, with `durationSec` for voice).
 */
export const postLeadMessage = async (req, res) => {
    try {
        const lead = await db.lead.findUnique({ where: { id: req.params.leadId }, select: { id: true } });
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
        const text = String(req.body.text ?? "").trim() || null;
        const file = req.file;
        if (!text && !file) return res.status(400).json({ success: false, message: "Write something or attach a photo / voice note" });
        const kind = !file ? "TEXT" : file.mimetype.startsWith("audio/") ? "VOICE" : "PHOTO";
        const data = await db.leadMessage.create({
            data: {
                leadId: lead.id,
                authorId: Number(req.user.data.id),
                kind,
                text,
                ...(file && {
                    fileUrl: leadFileUrl(lead.id, file.filename),
                    mimeType: file.mimetype,
                    durationSec: Number.parseInt(req.body.durationSec, 10) || null,
                }),
            },
            select: messageSelect,
        });
        return res.status(201).json({ success: true, data });
    } catch (error) {
        logger.error("postLeadMessage error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
