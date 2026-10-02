import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { createActivityLog } from "../../../helper/activityLogger.js";
import { projectCommissionStatement, commissionReport } from "../../../helper/commissions.js";
import { parseRange } from "./reportController.js";

/**
 * Commission people on a project and their payouts (2026-10-02).
 * View = projectCommission.view; add/edit/remove people and payouts = projectCommission.update.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const userId = (req) => Number(req.user?.data?.id) || null;

/** Optional from/to (YYYY-MM-DD, inclusive). Unlike parseRange, no default: blank = all time. */
function optionalRange(q) {
  if (!ISO.test(q.from || "") && !ISO.test(q.to || "")) return {};
  const r = parseRange(q);
  return { from: ISO.test(q.from || "") ? r.from : undefined, to: ISO.test(q.to || "") ? r.to : undefined };
}

function personInput(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "Name is required" };
    out.name = name;
  }
  if (body.mobile !== undefined) {
    const mobile = String(body.mobile ?? "").trim();
    if (mobile && !/^\d{10}$/.test(mobile)) return { error: "Mobile must be 10 digits" };
    out.mobile = mobile || null;
  }
  if (!partial || body.ratePerM3 !== undefined) {
    const rate = Number(body.ratePerM3);
    if (body.ratePerM3 === "" || body.ratePerM3 === null || !Number.isFinite(rate) || rate < 0) return { error: "Rate per m³ must be 0 or more" };
    out.ratePerM3 = rate;
  }
  return { data: out };
}

async function findProject(projectId) {
  return db.project.findFirst({ where: { projectId, isDeleted: false }, select: { id: true, projectId: true, projectName: true } });
}

async function findPerson(id) {
  return db.projectCommission.findFirst({ where: { id, isDeleted: false }, include: { project: { select: { id: true, projectId: true, projectName: true } } } });
}

function log(req, project, title, description) {
  return createActivityLog({ title, description, entityType: "PROJECT", entityId: project.id, action: "UPDATED", event: "COMMISSION", createdById: userId(req) });
}

/** GET /project/:projectId/commissions?from&to — people, figures, payouts and the bills they earn on. */
export async function getProjectCommissions(req, res) {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return fail(res, 404, "Project not found");
    const data = await projectCommissionStatement(project.id, optionalRange(req.query));
    return res.json({ success: true, data });
  } catch (error) {
    logger.error("getProjectCommissions error:", error);
    return fail(res, 500, "Failed to load commission");
  }
}

/** POST /project/:projectId/commissions { name, mobile?, ratePerM3 } */
export async function addCommissionPerson(req, res) {
  try {
    const project = await findProject(req.params.projectId);
    if (!project) return fail(res, 404, "Project not found");
    const { data, error } = personInput(req.body);
    if (error) return fail(res, 400, error);
    const person = await db.projectCommission.create({ data: { ...data, projectId: project.id } });
    await log(req, project, "Commission person added", `${person.name} at ₹${person.ratePerM3}/m³ on ${project.projectName}`);
    return res.status(201).json({ success: true, message: "Commission person added", data: person });
  } catch (error) {
    logger.error("addCommissionPerson error:", error);
    return fail(res, 500, "Failed to add commission person");
  }
}

/** PUT /project/commissions/:id { name?, mobile?, ratePerM3? } */
export async function updateCommissionPerson(req, res) {
  try {
    const existing = await findPerson(req.params.id);
    if (!existing) return fail(res, 404, "Commission person not found");
    const { data, error } = personInput(req.body, { partial: true });
    if (error) return fail(res, 400, error);
    const person = await db.projectCommission.update({ where: { id: existing.id }, data });
    const rate = existing.ratePerM3 !== person.ratePerM3 ? ` (rate ₹${existing.ratePerM3} → ₹${person.ratePerM3}/m³)` : "";
    await log(req, existing.project, "Commission person updated", `${person.name}${rate}`);
    return res.json({ success: true, message: "Commission person updated", data: person });
  } catch (error) {
    logger.error("updateCommissionPerson error:", error);
    return fail(res, 500, "Failed to update commission person");
  }
}

/** DELETE /project/commissions/:id — soft; their payouts stay on record. */
export async function removeCommissionPerson(req, res) {
  try {
    const existing = await findPerson(req.params.id);
    if (!existing) return fail(res, 404, "Commission person not found");
    await db.projectCommission.update({ where: { id: existing.id }, data: { isDeleted: true } });
    await log(req, existing.project, "Commission person removed", existing.name);
    return res.json({ success: true, message: "Commission person removed" });
  } catch (error) {
    logger.error("removeCommissionPerson error:", error);
    return fail(res, 500, "Failed to remove commission person");
  }
}

/** POST /project/commissions/:id/payouts { amount, paidOn, mode?, reference?, note? } */
export async function addCommissionPayout(req, res) {
  try {
    const person = await findPerson(req.params.id);
    if (!person) return fail(res, 404, "Commission person not found");
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, "Amount must be more than 0");
    if (!ISO.test(req.body.paidOn || "")) return fail(res, 400, "Paid on date is required (YYYY-MM-DD)");
    const payout = await db.commissionPayout.create({
      data: {
        commissionId: person.id,
        amount,
        paidOn: new Date(`${req.body.paidOn}T00:00:00Z`),
        mode: String(req.body.mode ?? "").trim().slice(0, 30) || null,
        reference: String(req.body.reference ?? "").trim() || null,
        note: String(req.body.note ?? "").trim() || null,
        createdById: userId(req),
      },
    });
    await log(req, person.project, "Commission paid", `₹${amount} to ${person.name} on ${req.body.paidOn}`);
    return res.status(201).json({ success: true, message: "Payout recorded", data: payout });
  } catch (error) {
    logger.error("addCommissionPayout error:", error);
    return fail(res, 500, "Failed to record payout");
  }
}

/** DELETE /project/commissions/payouts/:payoutId — soft. */
export async function removeCommissionPayout(req, res) {
  try {
    const payout = await db.commissionPayout.findFirst({ where: { id: req.params.payoutId, isDeleted: false }, include: { commission: { include: { project: { select: { id: true, projectName: true } } } } } });
    if (!payout) return fail(res, 404, "Payout not found");
    await db.commissionPayout.update({ where: { id: payout.id }, data: { isDeleted: true } });
    await log(req, payout.commission.project, "Commission payout removed", `₹${payout.amount} to ${payout.commission.name}`);
    return res.json({ success: true, message: "Payout removed" });
  } catch (error) {
    logger.error("removeCommissionPayout error:", error);
    return fail(res, 500, "Failed to remove payout");
  }
}

/** GET /reports/commissions?from&to — every person across projects (default: this financial year). */
export async function getCommissionReport(req, res) {
  try {
    const range = parseRange(req.query);
    const rows = await commissionReport(range);
    return res.json({ success: true, data: { from: range.from, to: range.to, rows } });
  } catch (error) {
    logger.error("getCommissionReport error:", error);
    return fail(res, 500, "Failed to load commission report");
  }
}
