import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";
import { createActivityLog } from "../../../helper/activityLogger.js";
import { recordPayment, adjustFromAdvance, reversePayment, openBills, unallocatedOf, r2 } from "../../../helper/payments.js";
import { getCreditPosition } from "../../../helper/creditPosition.js";

/**
 * Payments, client account, credit settings and extra credit (Phase 2).
 * Spec: docs/workflow-crosscheck/07-payments-allocation.md, W24, W35.
 */
const fail = (res, r) => res.status(r.status || 400).json({ success: false, message: r.error, ...(r.code && { code: r.code }), ...(r.plan && { plan: r.plan }) });
const userId = (req) => Number(req.user?.data?.id);

async function clientByCode(clientId) {
  return db.client.findFirst({ where: { clientId, isDeleted: false }, select: { id: true, clientId: true, companyName: true, creditLimit: true, creditDays: true } });
}

/** POST /payments/preview — the allocation plan, nothing saved. */
export async function previewPayment(req, res) {
  try {
    const r = await recordPayment(req.body, userId(req), { dryRun: true });
    if (r.error) return fail(res, r);
    return res.json({ success: true, data: { allocations: r.plan.allocations, unallocated: r.unallocated } });
  } catch (e) {
    logger.error("previewPayment", e);
    return res.status(500).json({ success: false, message: "Preview failed" });
  }
}

/** POST /payments — record it (cheque no. / UTR, level, allocation, optional advance). */
export async function createPayment(req, res) {
  try {
    const r = await recordPayment(req.body, userId(req));
    if (r.error) return fail(res, r);
    return res.status(201).json({ success: true, message: `Payment ${r.payment.receiptNo} recorded`, data: { payment: r.payment, unallocated: r.unallocated } });
  } catch (e) {
    logger.error("createPayment", e);
    return res.status(500).json({ success: false, message: "Could not record the payment" });
  }
}

/** GET /payments?clientId=&from=&to=&mode= */
export async function listPayments(req, res) {
  try {
    const { clientId, from, to, mode } = req.query;
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const payments = await db.payment.findMany({
      where: {
        ...(clientId && { client: { clientId } }),
        ...(mode && { mode }),
        ...((iso.test(from || "") || iso.test(to || "")) && {
          receivedOn: { ...(iso.test(from || "") && { gte: new Date(`${from}T00:00:00`) }), ...(iso.test(to || "") && { lte: new Date(`${to}T23:59:59.999`) }) },
        }),
      },
      orderBy: { receivedOn: "desc" },
      take: 1000,
      include: { client: { select: { clientId: true, companyName: true } }, allocations: { include: { bill: { select: { billNo: true } } } } },
    });
    return res.json({ success: true, data: payments.map((p) => ({ ...p, unallocated: p.status === "ACTIVE" ? unallocatedOf(p) : 0 })) });
  } catch (e) {
    logger.error("listPayments", e);
    return res.status(500).json({ success: false, message: "Could not load payments" });
  }
}

/** GET /payments/:receiptNo — with allocation history. */
export async function getPayment(req, res) {
  const p = await db.payment.findFirst({
    where: { OR: [{ id: req.params.receiptNo }, { receiptNo: req.params.receiptNo }] },
    include: { client: { select: { clientId: true, companyName: true } }, allocations: { include: { bill: { select: { billNo: true, amount: true, order: { select: { orderId: true, project: { select: { projectName: true } } } } } } } } },
  });
  if (!p) return res.status(404).json({ success: false, message: "Payment not found" });
  return res.json({ success: true, data: { ...p, unallocated: p.status === "ACTIVE" ? unallocatedOf(p) : 0 } });
}

/** POST /payments/:receiptNo/adjust — "Adjust from advance". */
export async function adjustPayment(req, res) {
  try {
    const r = await adjustFromAdvance(req.params.receiptNo, req.body, userId(req));
    if (r.error) return fail(res, r);
    return res.json({ success: true, message: "Adjusted", data: r });
  } catch (e) {
    logger.error("adjustPayment", e);
    return res.status(500).json({ success: false, message: "Could not adjust" });
  }
}

/** POST /payments/:receiptNo/reverse — bounced cheque / wrong entry. */
export async function reversePaymentHandler(req, res) {
  try {
    const r = await reversePayment(req.params.receiptNo, req.body.reason, userId(req));
    if (r.error) return fail(res, r);
    return res.json({ success: true, message: "Payment reversed" });
  } catch (e) {
    logger.error("reversePayment", e);
    return res.status(500).json({ success: false, message: "Could not reverse" });
  }
}

/** GET /client/:clientId/account — credit, unpaid bills with paid/pending, payments, extra credit. */
export async function clientAccount(req, res) {
  try {
    const client = await clientByCode(req.params.clientId);
    if (!client) return res.status(404).json({ success: false, message: "Client not found" });
    const [credit, bills, payments, extras] = await Promise.all([
      getCreditPosition(client.id),
      openBills(db, client.id),
      db.payment.findMany({ where: { clientId: client.id }, orderBy: { receivedOn: "desc" }, include: { allocations: { include: { bill: { select: { billNo: true } } } } } }),
      db.clientCreditExtra.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" } }),
    ]);
    return res.json({
      success: true,
      data: {
        client, credit,
        bills: bills.sort((a, b) => new Date(a.issueDate) - new Date(b.issueDate)),
        payments: payments.map((p) => ({ ...p, unallocated: p.status === "ACTIVE" ? unallocatedOf(p) : 0 })),
        extras,
      },
    });
  } catch (e) {
    logger.error("clientAccount", e);
    return res.status(500).json({ success: false, message: "Could not load the account" });
  }
}

/** Ledger rows (Dr bills, Cr payments) with a running balance — shared with the client app. */
export async function buildLedger(clientDbId, { projectId } = {}) {
  const bills = await db.bill.findMany({
    where: { isDeleted: false, status: { not: "CANCELLED" }, order: { clientId: clientDbId, ...(projectId && { project: { projectId } }) } },
    select: { billNo: true, amount: true, issueDate: true, createdAt: true, order: { select: { orderId: true, project: { select: { projectName: true } } } } },
  });
  const payments = await db.payment.findMany({ where: { clientId: clientDbId, status: "ACTIVE", ...(projectId && { projectId }) }, select: { receiptNo: true, amount: true, receivedOn: true, mode: true, reference: true } });
  const rows = [
    ...bills.map((b) => ({ date: b.issueDate || b.createdAt, type: "BILL", ref: b.billNo, detail: `${b.order.orderId} · ${b.order.project.projectName}`, debit: b.amount, credit: 0 })),
    ...payments.map((p) => ({ date: p.receivedOn, type: "PAYMENT", ref: p.receiptNo, detail: `${p.mode}${p.reference ? ` ${p.reference}` : ""}`, debit: 0, credit: p.amount })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  let bal = 0;
  return rows.map((r) => ({ ...r, balance: (bal = r2(bal + r.debit - r.credit)) }));
}

/** GET /client/:clientId/ledger?projectId= */
export async function clientLedger(req, res) {
  const client = await clientByCode(req.params.clientId);
  if (!client) return res.status(404).json({ success: false, message: "Client not found" });
  return res.json({ success: true, data: await buildLedger(client.id, req.query) });
}

/** PUT /client/:clientId/credit — { creditLimit, creditDays } (W24). */
export async function updateClientCredit(req, res) {
  const client = await clientByCode(req.params.clientId);
  if (!client) return res.status(404).json({ success: false, message: "Client not found" });
  const creditLimit = req.body.creditLimit === "" || req.body.creditLimit == null ? null : r2(req.body.creditLimit);
  const creditDays = req.body.creditDays === "" || req.body.creditDays == null ? null : parseInt(req.body.creditDays, 10);
  if ((creditLimit !== null && !(creditLimit >= 0)) || (creditDays !== null && !(creditDays > 0))) {
    return res.status(400).json({ success: false, message: "creditLimit must be ≥ 0 and creditDays > 0" });
  }
  await db.client.update({ where: { id: client.id }, data: { creditLimit, creditDays } });
  await createActivityLog({
    title: "Credit limit changed", description: `${client.clientId}: limit ₹${client.creditLimit ?? "—"} → ₹${creditLimit ?? "—"}, days ${client.creditDays ?? "—"} → ${creditDays ?? "—"}`,
    entityType: "CLIENT", entityId: client.id, action: "UPDATED", createdById: userId(req), event: "CREDIT_LIMIT_CHANGED", clientRef: client.clientId,
    before: { creditLimit: client.creditLimit, creditDays: client.creditDays }, after: { creditLimit, creditDays },
  });
  return res.json({ success: true, message: "Credit updated" });
}

/** POST /client/:clientId/credit-extra — { amount, reason } (W35, orders.approve). */
export async function grantExtraCredit(req, res) {
  const client = await clientByCode(req.params.clientId);
  if (!client) return res.status(404).json({ success: false, message: "Client not found" });
  const amount = r2(req.body.amount);
  if (!(amount > 0) || !req.body.reason?.trim()) return res.status(400).json({ success: false, message: "amount (> 0) and reason are required" });
  const extra = await db.clientCreditExtra.create({ data: { clientId: client.id, amount, reason: req.body.reason.trim(), grantedById: userId(req) } });
  await createActivityLog({ title: "Extra credit granted", description: `${client.clientId}: ₹${amount} — ${extra.reason}`, entityType: "CLIENT", entityId: client.id, action: "CREATED", createdById: userId(req), event: "EXTRA_CREDIT_GRANTED", clientRef: client.clientId });
  return res.status(201).json({ success: true, data: extra });
}

/** POST /client/:clientId/credit-extra/:id/revoke — removes the unused part. */
export async function revokeExtraCredit(req, res) {
  const client = await clientByCode(req.params.clientId);
  const extra = client && (await db.clientCreditExtra.findFirst({ where: { id: req.params.id, clientId: client.id } }));
  if (!extra) return res.status(404).json({ success: false, message: "Extra credit not found" });
  if (extra.status === "REVOKED") return res.status(409).json({ success: false, message: "Already revoked" });
  if (!req.body.reason?.trim()) return res.status(400).json({ success: false, message: "A reason is required" });
  const before = await getCreditPosition(client.id);
  await db.clientCreditExtra.update({ where: { id: extra.id }, data: { status: "REVOKED", revokedAt: new Date(), revokedById: userId(req), revokedAmount: before.extraUnused, revokeReason: req.body.reason.trim() } });
  await createActivityLog({ title: "Extra credit revoked", description: `${client.clientId}: unused ₹${before.extraUnused} removed — ${req.body.reason.trim()}`, entityType: "CLIENT", entityId: client.id, action: "UPDATED", createdById: userId(req), event: "EXTRA_CREDIT_REVOKED", clientRef: client.clientId });
  return res.json({ success: true, message: "Unused extra credit revoked" });
}

/** GET /bills/log — the Billing → Log tab (W33). Filters: from, to, event, userId, clientId, billNo. */
export async function billingLog(req, res) {
  const { from, to, event, userId: uid, clientId, billNo } = req.query;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const bill = billNo ? await db.bill.findFirst({ where: { billNo }, select: { id: true, orderId: true } }) : null;
  const rows = await db.activity.findMany({
    where: {
      OR: [{ event: { not: null } }, { entityType: { in: ["PAYMENT", "BILL"] } }, { title: { contains: "Bill" } }, { title: { contains: "Invoice" } }, { title: { contains: "Challan" } }, { title: { contains: "TM" } }],
      ...(event && { event }),
      ...(uid && { createdById: Number(uid) }),
      ...(clientId && { clientRef: clientId }),
      ...(bill && { OR: [{ billId: bill.id }, { entityId: bill.orderId }] }),
      ...((iso.test(from || "") || iso.test(to || "")) && { createdAt: { ...(iso.test(from || "") && { gte: new Date(`${from}T00:00:00`) }), ...(iso.test(to || "") && { lte: new Date(`${to}T23:59:59.999`) }) } }),
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { createdBy: { select: { id: true, name: true } } },
  });
  return res.json({ success: true, data: rows });
}
