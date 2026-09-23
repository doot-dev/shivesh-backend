import db from "../../../config/database.js";
import logger from "../../../helper/logger.js";

/**
 * Admin reporting — client payment behaviour and credit risk.
 *
 * "Not giving credit" in the business sense here means NOT CLEARING DUES: the
 * client has taken delivery, been billed, and the money has not arrived. Every
 * number below is derived from the Bill table (amount / status / dueDate /
 * paidAt) joined to the client's project credit limits. Nothing is stored — the
 * report is computed on read, so it can never drift out of date.
 */

// A bill is money we are still owed. CANCELLED is void, PAID is settled.
const OPEN_BILL_STATUSES = ["PENDING", "SENT", "OVERDUE"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two dates, positive when `later` is after `earlier`. */
function daysBetween(later, earlier) {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Turn a client's bills + credit limits into a risk profile.
 *
 * The score is a weighted 0-100 where HIGHER IS WORSE, built from four signals
 * that a human credit controller would actually look at:
 *
 *   - overdue exposure (45) — how much money is late, relative to what they owe
 *   - ageing (25)           — how long the oldest unpaid bill has been late
 *   - payment history (20)  — how late they historically settle
 *   - credit utilisation (10) — how much of their sanctioned limit is consumed
 *
 * Weights are deliberate: a large overdue balance is the strongest signal, and
 * utilisation is the weakest because a high limit is a commercial decision, not
 * misbehaviour. Clients with no billing history score 0 and band LOW — absence
 * of evidence is not evidence of risk.
 */
function buildClientRisk(client, now) {
  const bills = client.orders
    .map((o) => o.bill)
    .filter((b) => b && !b.isDeleted);

  const openBills = bills.filter((b) => OPEN_BILL_STATUSES.includes(b.status));
  const paidBills = bills.filter((b) => b.status === "PAID");

  // Overdue = open AND the due date has passed. Computed from the date rather
  // than trusting status === 'OVERDUE', because nothing sweeps that status
  // automatically — a bill left as SENT past its due date is still overdue.
  const overdueBills = openBills.filter(
    (b) => b.dueDate && new Date(b.dueDate) < now,
  );

  const totalBilled = bills.reduce((sum, b) => sum + (b.amount || 0), 0);
  const outstanding = openBills.reduce((sum, b) => sum + (b.amount || 0), 0);
  const overdueAmount = overdueBills.reduce((sum, b) => sum + (b.amount || 0), 0);
  const collected = paidBills.reduce((sum, b) => sum + (b.amount || 0), 0);

  // Ageing of the oldest unpaid bill — the number that tells you how long this
  // has been allowed to run.
  const oldestOverdueDays = overdueBills.reduce((max, b) => {
    const d = daysBetween(now, new Date(b.dueDate));
    return d > max ? d : max;
  }, 0);

  // How late they settle when they DO pay. Only bills with both dates count.
  const settled = paidBills.filter((b) => b.paidAt && b.dueDate);
  const avgDaysToPay = settled.length
    ? Math.round(
        settled.reduce(
          (sum, b) => sum + daysBetween(new Date(b.paidAt), new Date(b.dueDate)),
          0,
        ) / settled.length,
      )
    : null;

  const paidOnTime = settled.filter(
    (b) => new Date(b.paidAt) <= new Date(b.dueDate),
  ).length;
  const onTimeRate = settled.length
    ? Math.round((paidOnTime / settled.length) * 100)
    : null;

  // Sanctioned credit across all of this client's projects.
  const creditLimit = client.projects.reduce(
    (sum, p) => sum + (p.creditAmount || 0),
    0,
  );
  const utilisation = creditLimit > 0 ? (outstanding / creditLimit) * 100 : null;

  // ── Score ──────────────────────────────────────────────────────────────────
  let score = 0;

  // 1. Overdue exposure (45). Share of what they owe that is already late.
  if (outstanding > 0) {
    score += (overdueAmount / outstanding) * 45;
  }

  // 2. Ageing (25). 90+ days late is treated as maxed out.
  score += Math.min(oldestOverdueDays / 90, 1) * 25;

  // 3. Payment history (20). Average lateness of 30+ days is maxed out.
  if (avgDaysToPay !== null && avgDaysToPay > 0) {
    score += Math.min(avgDaysToPay / 30, 1) * 20;
  }

  // 4. Credit utilisation (10). Over the sanctioned limit is maxed out.
  if (utilisation !== null) {
    score += Math.min(utilisation / 100, 1) * 10;
  }

  score = Math.round(Math.min(score, 100));

  const riskLevel =
    score >= 70 ? "CRITICAL" : score >= 45 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW";

  // Plain-English reasons, so the panel does not have to re-derive the "why".
  const reasons = [];
  if (overdueBills.length) {
    reasons.push(
      `${overdueBills.length} overdue bill${overdueBills.length === 1 ? "" : "s"} worth ₹${round2(overdueAmount).toLocaleString("en-IN")}`,
    );
  }
  if (oldestOverdueDays > 0) {
    reasons.push(`Oldest unpaid bill is ${oldestOverdueDays} days past due`);
  }
  if (avgDaysToPay !== null && avgDaysToPay > 0) {
    reasons.push(`Pays ${avgDaysToPay} days late on average`);
  }
  if (utilisation !== null && utilisation >= 80) {
    reasons.push(`Using ${Math.round(utilisation)}% of sanctioned credit`);
  }
  if (!bills.length) {
    reasons.push("No bills raised yet");
  } else if (!reasons.length) {
    reasons.push("Paying on time");
  }

  return {
    clientId: client.clientId,
    companyName: client.companyName,
    ownerName: client.ownerName,
    contactNumber: client.contactNumber,
    email: client.email,
    status: client.status,

    totalBilled: round2(totalBilled),
    collected: round2(collected),
    outstanding: round2(outstanding),
    overdueAmount: round2(overdueAmount),

    billCount: bills.length,
    openBillCount: openBills.length,
    overdueBillCount: overdueBills.length,

    oldestOverdueDays,
    avgDaysToPay,
    onTimeRate,

    creditLimit: round2(creditLimit),
    creditUtilisation: utilisation === null ? null : Math.round(utilisation),

    riskScore: score,
    riskLevel,
    reasons,
  };
}

/**
 * Client credit-risk report: who owes money, how late they are, and how risky
 * each one is. Powers the admin panel's Reports page.
 *
 * Query: `riskLevel` (LOW|MEDIUM|HIGH|CRITICAL), `q` (company/owner/client id),
 * and `onlyOutstanding=true` to hide clients who owe nothing. Filtering happens
 * AFTER scoring so the summary totals always describe the whole book.
 */
export async function getClientCreditRisk(req, res) {
  try {
    const { riskLevel, q, onlyOutstanding } = req.query;
    const now = new Date();

    const clients = await db.client.findMany({
      where: { isDeleted: false },
      select: {
        clientId: true,
        companyName: true,
        ownerName: true,
        contactNumber: true,
        email: true,
        status: true,
        projects: {
          where: { isDeleted: false },
          select: { creditAmount: true, creditResetPeriodDays: true },
        },
        orders: {
          where: { isDeleted: false },
          select: {
            bill: {
              select: {
                amount: true,
                status: true,
                dueDate: true,
                paidAt: true,
                isDeleted: true,
              },
            },
          },
        },
      },
    });

    const all = clients.map((c) => buildClientRisk(c, now));

    // Summary describes every client, not the filtered view.
    const summary = {
      clientCount: all.length,
      totalOutstanding: round2(all.reduce((s, c) => s + c.outstanding, 0)),
      totalOverdue: round2(all.reduce((s, c) => s + c.overdueAmount, 0)),
      totalCollected: round2(all.reduce((s, c) => s + c.collected, 0)),
      clientsWithOverdue: all.filter((c) => c.overdueBillCount > 0).length,
      byRisk: {
        CRITICAL: all.filter((c) => c.riskLevel === "CRITICAL").length,
        HIGH: all.filter((c) => c.riskLevel === "HIGH").length,
        MEDIUM: all.filter((c) => c.riskLevel === "MEDIUM").length,
        LOW: all.filter((c) => c.riskLevel === "LOW").length,
      },
    };

    let rows = all;

    if (riskLevel) {
      const wanted = String(riskLevel).toUpperCase();
      rows = rows.filter((c) => c.riskLevel === wanted);
    }

    if (String(onlyOutstanding) === "true") {
      rows = rows.filter((c) => c.outstanding > 0);
    }

    const text = typeof q === "string" ? q.trim().toLowerCase() : "";
    if (text) {
      rows = rows.filter(
        (c) =>
          c.companyName?.toLowerCase().includes(text) ||
          c.ownerName?.toLowerCase().includes(text) ||
          c.clientId?.toLowerCase().includes(text),
      );
    }

    // Riskiest first, then by how much money is at stake.
    rows.sort(
      (a, b) => b.riskScore - a.riskScore || b.outstanding - a.outstanding,
    );

    return res.status(200).json({
      success: true,
      data: { summary, clients: rows },
    });
  } catch (error) {
    logger.error("getClientCreditRisk error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to build credit risk report",
      error: error.message,
    });
  }
}

/**
 * Every unpaid bill for one client, oldest first — the drill-down behind a row
 * in the credit-risk report.
 */
export async function getClientOutstandingBills(req, res) {
  try {
    const { clientId } = req.params;
    const now = new Date();

    const client = await db.client.findFirst({
      where: { clientId, isDeleted: false },
      select: { id: true, clientId: true, companyName: true },
    });

    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    const bills = await db.bill.findMany({
      where: {
        isDeleted: false,
        status: { in: OPEN_BILL_STATUSES },
        order: { clientId: client.id, isDeleted: false },
      },
      select: {
        billNo: true,
        amount: true,
        status: true,
        issueDate: true,
        dueDate: true,
        order: {
          select: {
            orderId: true,
            productName: true,
            productGrade: true,
            project: { select: { projectName: true, siteName: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const rows = bills.map((b) => ({
      billNo: b.billNo,
      amount: round2(b.amount || 0),
      status: b.status,
      issueDate: b.issueDate,
      dueDate: b.dueDate,
      daysOverdue:
        b.dueDate && new Date(b.dueDate) < now
          ? daysBetween(now, new Date(b.dueDate))
          : 0,
      orderId: b.order?.orderId ?? null,
      productName: b.order?.productName ?? null,
      productGrade: b.order?.productGrade ?? null,
      projectName: b.order?.project?.projectName ?? null,
      siteName: b.order?.project?.siteName ?? null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        client: { clientId: client.clientId, companyName: client.companyName },
        totalOutstanding: round2(rows.reduce((s, r) => s + r.amount, 0)),
        bills: rows,
      },
    });
  } catch (error) {
    logger.error("getClientOutstandingBills error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load outstanding bills",
      error: error.message,
    });
  }
}
