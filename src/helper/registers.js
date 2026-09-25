import db from '../config/database.js';
import { billBlocker } from './orderCompletion.js';

/**
 * Data for the CA Pack registers (R1, R2, R3, R5, R6, R7, R13). Each builder
 * returns { name, title, columns, rows, totals } for xlsx.addRegisterSheet.
 * Date range = invoice / order date, inclusive. Cancelled and deleted records
 * are kept with their status so number sequences stay complete.
 */
const OPEN = ['PENDING', 'SENT', 'OVERDUE'];
const DAY = 864e5;
const qtyOf = (q) => { const n = parseFloat(String(q ?? '')); return Number.isFinite(n) ? n : null; };
const between = (from, to) => ({ gte: from, lte: to });

async function billsIn(from, to) {
  return db.bill.findMany({
    where: { issueDate: between(from, to) },
    orderBy: { billNo: 'asc' },
    include: {
      order: {
        select: {
          orderId: true, date: true, createdAt: true, productName: true, productGrade: true, quantity: true, status: true,
          client: { select: { clientId: true, companyName: true, gstNumber: true } },
          project: { select: { projectName: true, siteName: true } },
          tmDetails: { where: { isDeleted: false }, select: { qty: true, approvalStatus: true } },
        },
      },
    },
  });
}

export async function salesRegister(from, to, now = new Date()) {
  const bills = await billsIn(from, to);
  return {
    name: 'R1 Sales register', title: 'Sales register',
    columns: [
      { header: 'Invoice no.', key: 'billNo', type: 'text' }, { header: 'Invoice date', key: 'issueDate', type: 'date' },
      { header: 'Status', key: 'status', type: 'text' }, { header: 'Deleted', key: 'deleted', type: 'text' },
      { header: 'Order no.', key: 'orderId', type: 'text' }, { header: 'Order date', key: 'orderDate', type: 'date' },
      { header: 'Client ID', key: 'clientId', type: 'text' }, { header: 'Client', key: 'client', type: 'text', width: 30 },
      { header: 'Client GSTIN', key: 'gstin', type: 'text' }, { header: 'Project', key: 'project', type: 'text' },
      { header: 'Site', key: 'site', type: 'text' }, { header: 'Product', key: 'product', type: 'text' },
      { header: 'Grade', key: 'grade', type: 'text' }, { header: 'Qty', key: 'quantity', type: 'qty' },
      { header: 'Rate', key: 'rate', type: 'money' }, { header: 'Amount', key: 'amount', type: 'money' },
      { header: 'Due date', key: 'dueDate', type: 'date' }, { header: 'Paid date', key: 'paidAt', type: 'date' },
      { header: 'Days to pay / overdue', key: 'days', type: 'int' },
    ],
    rows: bills.map((b) => ({
      billNo: b.billNo, issueDate: b.issueDate, status: b.status, deleted: b.isDeleted ? 'Y' : 'N',
      orderId: b.order.orderId, orderDate: b.order.date || b.order.createdAt, clientId: b.order.client.clientId,
      client: b.order.client.companyName, gstin: b.order.client.gstNumber, project: b.order.project.projectName,
      site: b.order.project.siteName, product: b.order.productName, grade: b.order.productGrade,
      quantity: b.quantity, rate: b.rate, amount: b.amount, dueDate: b.dueDate, paidAt: b.paidAt,
      days: b.paidAt ? Math.round((new Date(b.paidAt) - new Date(b.issueDate)) / DAY)
        : b.dueDate && OPEN.includes(b.status) ? Math.max(0, Math.floor((now - new Date(b.dueDate)) / DAY)) : null,
    })),
    totals: ['quantity', 'amount'],
  };
}

export async function documentSummary(from, to) {
  const bills = await db.bill.findMany({ where: { issueDate: between(from, to) }, select: { billNo: true, status: true, isDeleted: true } });
  const series = {};
  for (const b of bills) {
    const m = /^(.*-)(\d+)$/.exec(b.billNo);
    if (!m) continue;
    (series[m[1]] ||= []).push({ n: Number(m[2]), cancelled: b.status === 'CANCELLED', deleted: b.isDeleted });
  }
  return {
    name: 'R2 Document summary', title: 'Document summary (sequence check)',
    columns: [
      { header: 'Series', key: 'series', type: 'text' }, { header: 'First no.', key: 'first', type: 'int' },
      { header: 'Last no.', key: 'last', type: 'int' }, { header: 'Numbers used', key: 'used', type: 'int' },
      { header: 'Cancelled', key: 'cancelled', type: 'int' }, { header: 'Deleted', key: 'deleted', type: 'int' },
      { header: 'Net issued', key: 'net', type: 'int' }, { header: 'Missing numbers', key: 'missing', type: 'text', width: 40 },
    ],
    rows: Object.entries(series).map(([s, xs]) => {
      const nums = new Set(xs.map((x) => x.n));
      const first = Math.min(...nums); const last = Math.max(...nums);
      const missing = [];
      for (let i = first; i <= last; i++) if (!nums.has(i)) missing.push(i);
      const c = xs.filter((x) => x.cancelled).length; const d = xs.filter((x) => x.deleted).length;
      return { series: s, first, last, used: xs.length, cancelled: c, deleted: d, net: xs.length - c - d, missing: missing.join(', ') || 'none' };
    }),
    totals: ['used', 'cancelled', 'deleted', 'net'],
  };
}

export async function outstandingAgeing(now = new Date()) {
  const bills = await db.bill.findMany({
    where: { isDeleted: false, status: { in: OPEN } },
    orderBy: { dueDate: 'asc' },
    include: { order: { select: { orderId: true, client: { select: { companyName: true } } } } },
  });
  const bucket = (days) => (days === null || days < 1 ? 'Not due' : days <= 30 ? '0–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '90+');
  return {
    name: 'R3 Outstanding & ageing', title: 'Outstanding and ageing (bill-wise)',
    columns: [
      { header: 'Client', key: 'client', type: 'text', width: 30 }, { header: 'Invoice no.', key: 'billNo', type: 'text' },
      { header: 'Invoice date', key: 'issueDate', type: 'date' }, { header: 'Due date', key: 'dueDate', type: 'date' },
      { header: 'Amount', key: 'amount', type: 'money' }, { header: 'Received', key: 'received', type: 'money' },
      { header: 'Balance', key: 'balance', type: 'money' }, { header: 'Days overdue', key: 'days', type: 'int' },
      { header: 'Bucket', key: 'bucket', type: 'text' },
    ],
    rows: bills.map((b) => {
      const days = b.dueDate ? Math.floor((now - new Date(b.dueDate)) / DAY) : null;
      return { client: b.order.client.companyName, billNo: b.billNo, issueDate: b.issueDate, dueDate: b.dueDate, amount: b.amount, received: 0, balance: b.amount, days: days > 0 ? days : 0, bucket: bucket(days) };
    }),
    totals: ['amount', 'received', 'balance'],
  };
}

export async function challanRegister(from, to) {
  const tms = await db.tmDetail.findMany({
    where: { isDeleted: false, order: { isDeleted: false, OR: [{ date: { gte: from.toISOString().slice(0, 10), lte: to.toISOString().slice(0, 10) } }, { date: null, createdAt: between(from, to) }] } },
    orderBy: [{ orderId: 'asc' }, { tmNumber: 'asc' }],
    include: {
      order: {
        select: {
          orderId: true, bill: { select: { billNo: true } }, client: { select: { companyName: true } }, project: { select: { siteName: true } },
          vendors: { where: { isDeleted: false }, select: { vendor: { select: { companyName: true } } } },
          technicians: { where: { isDeleted: false }, select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  return {
    name: 'R5 Challan register', title: 'Delivery and challan register',
    columns: [
      { header: 'Order no.', key: 'orderId', type: 'text' }, { header: 'Bill no.', key: 'billNo', type: 'text' },
      { header: 'Client', key: 'client', type: 'text', width: 28 }, { header: 'Site', key: 'site', type: 'text' },
      { header: 'TM no.', key: 'tmNumber', type: 'text' }, { header: 'Vehicle no.', key: 'truckNo', type: 'text' },
      { header: 'Qty', key: 'qty', type: 'qty' }, { header: 'Challan no.', key: 'challanNo', type: 'text' },
      { header: 'Challan file', key: 'file', type: 'text' }, { header: 'Status', key: 'status', type: 'text' },
      { header: 'Dispatch', key: 'dispatchTime', type: 'text' }, { header: 'Arrival', key: 'arrivalTime', type: 'text' },
      { header: 'Batch start', key: 'batchStartTime', type: 'text' }, { header: 'Batch end', key: 'batchEndTime', type: 'text' },
      { header: 'Plant', key: 'plant', type: 'text' }, { header: 'Field technician', key: 'tech', type: 'text' },
      { header: 'Approval', key: 'approvalStatus', type: 'text' }, { header: 'Rejected by', key: 'rejectedBy', type: 'text' },
      { header: 'Rejection reason', key: 'rejectionReason', type: 'text', width: 30 }, { header: 'Approved at', key: 'approvedAt', type: 'date' },
    ],
    rows: tms.map((t) => ({
      orderId: t.order.orderId, billNo: t.order.bill?.billNo, client: t.order.client.companyName, site: t.order.project.siteName,
      tmNumber: t.tmNumber, truckNo: t.truckNo, qty: qtyOf(t.qty), challanNo: t.challanNo, file: t.challanUrl ? 'Y' : 'N', status: t.status,
      dispatchTime: t.dispatchTime, arrivalTime: t.arrivalTime, batchStartTime: t.batchStartTime, batchEndTime: t.batchEndTime,
      plant: t.order.vendors.map((v) => v.vendor.companyName).join(', '), tech: t.order.technicians.map((x) => x.user.name).join(', '),
      approvalStatus: t.approvalStatus, rejectedBy: t.rejectedByType, rejectionReason: t.rejectionReason, approvedAt: t.approvedAt,
    })),
    totals: ['qty'],
  };
}

export async function exceptions() {
  const rows = [];
  const add = (check, record, detail, action) => rows.push({ check, record, detail, action });

  const completed = await db.order.findMany({ where: { isDeleted: false, status: 'COMPLETED' }, include: { bill: true, tmDetails: { where: { isDeleted: false } } } });
  for (const o of completed) {
    if (!o.bill || o.bill.isDeleted) add('Completed order with no active bill', o.orderId, billBlocker(o.tmDetails) || 'ready to bill', 'Add challans / review trucks, or bill manually');
    else {
      const accepted = o.tmDetails.filter((t) => t.approvalStatus === 'ACCEPTED').reduce((s, t) => s + (qtyOf(t.qty) || 0), 0);
      if (accepted && Math.abs(accepted - o.bill.quantity) > 0.001) add('Billed qty ≠ accepted truck qty', o.bill.billNo, `billed ${o.bill.quantity}, accepted ${accepted}`, 'Check the bill; credit note if over-billed');
      if (o.tmDetails.some((t) => t.approvalStatus === 'REJECTED')) add('Rejected truck on a billed order', o.bill.billNo, o.tmDetails.filter((t) => t.approvalStatus === 'REJECTED').map((t) => t.tmNumber).join(', '), 'Decide on a credit note');
    }
  }
  for (const t of await db.tmDetail.findMany({ where: { isDeleted: false, NOT: { challanNo: null }, challanUrl: null, approvalStatus: { not: 'REJECTED' }, order: { isDeleted: false } }, include: { order: { select: { orderId: true } } } })) {
    add('Truck with a challan no. but no challan file', `${t.order.orderId} ${t.tmNumber}`, `challan ${t.challanNo}`, 'Upload the challan photo');
  }
  for (const b of await db.bill.findMany({ where: { isDeleted: false, status: { in: OPEN }, dueDate: null } })) add('Bill with no due date', b.billNo, '', 'Set a due date');
  for (const b of await db.bill.findMany({ where: { isDeleted: false, status: { not: 'CANCELLED' }, order: { status: 'CANCELLED' } } })) add('Bill on a cancelled order', b.billNo, '', 'Cancel the bill or issue a credit note');
  const gstin = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  for (const c of await db.client.findMany({ where: { isDeleted: false, hasGST: true }, select: { clientId: true, companyName: true, gstNumber: true } })) {
    if (!c.gstNumber || !gstin.test(c.gstNumber)) add('GST client with a missing or invalid GSTIN', c.clientId, `${c.companyName}: ${c.gstNumber || 'none'}`, 'Correct the GSTIN');
  }
  return {
    name: 'R6 Exceptions', title: 'Exceptions — should be empty before the pack goes to the CA',
    columns: [{ header: 'Check', key: 'check', type: 'text', width: 40 }, { header: 'Record', key: 'record', type: 'text', width: 22 }, { header: 'Detail', key: 'detail', type: 'text', width: 50 }, { header: 'Suggested action', key: 'action', type: 'text', width: 40 }],
    rows,
  };
}

export async function auditTrail(from, to) {
  const acts = await db.activity.findMany({ where: { createdAt: between(from, to), entityType: 'ORDER' }, orderBy: { createdAt: 'asc' }, include: { createdBy: { select: { id: true, name: true } } } });
  return {
    name: 'R7 Audit trail', title: 'Audit trail (orders, trucks, bills)',
    columns: [{ header: 'Date & time', key: 'at', type: 'date' }, { header: 'User ID', key: 'userId', type: 'int' }, { header: 'User', key: 'user', type: 'text' }, { header: 'Action', key: 'action', type: 'text' }, { header: 'Title', key: 'title', type: 'text', width: 28 }, { header: 'Detail', key: 'description', type: 'text', width: 70 }],
    rows: acts.map((a) => ({ at: a.createdAt, userId: a.createdBy?.id, user: a.createdBy?.name, action: a.action, title: a.title, description: a.description })),
  };
}

export async function orderRegister(from, to) {
  const orders = await db.order.findMany({
    where: { OR: [{ date: { gte: from.toISOString().slice(0, 10), lte: to.toISOString().slice(0, 10) } }, { date: null, createdAt: between(from, to) }] },
    orderBy: { orderId: 'asc' },
    include: {
      client: { select: { companyName: true } }, project: { select: { projectName: true, siteName: true } }, bill: { select: { billNo: true, status: true } },
      vendors: { where: { isDeleted: false }, select: { vendor: { select: { companyName: true } } } },
      tmDetails: { where: { isDeleted: false }, select: { qty: true, approvalStatus: true, challanUrl: true } },
    },
  });
  return {
    name: 'R13 Order register', title: 'Order register (replaces the office Excel)',
    columns: [
      { header: 'Order no.', key: 'orderId', type: 'text' }, { header: 'Delivery date', key: 'date', type: 'date' },
      { header: 'Placed on', key: 'createdAt', type: 'date' }, { header: 'Client', key: 'client', type: 'text', width: 28 },
      { header: 'Project', key: 'project', type: 'text' }, { header: 'Site', key: 'site', type: 'text' },
      { header: 'Product', key: 'product', type: 'text' }, { header: 'Grade', key: 'grade', type: 'text' },
      { header: 'Ordered qty', key: 'ordered', type: 'qty' }, { header: 'Plant(s)', key: 'plants', type: 'text' },
      { header: 'Status', key: 'status', type: 'text' }, { header: 'Trucks', key: 'trucks', type: 'int' },
      { header: 'Rejected at site', key: 'rejected', type: 'int' }, { header: 'Delivered qty', key: 'delivered', type: 'qty' },
      { header: 'Accepted qty', key: 'accepted', type: 'qty' }, { header: 'Challans missing', key: 'missing', type: 'text' },
      { header: 'Bill no.', key: 'billNo', type: 'text' }, { header: 'Bill status', key: 'billStatus', type: 'text' },
      { header: 'Deleted', key: 'deleted', type: 'text' },
    ],
    rows: orders.map((o) => {
      const live = o.tmDetails.filter((t) => t.approvalStatus !== 'REJECTED');
      return {
        orderId: o.orderId, date: o.date, createdAt: o.createdAt, client: o.client.companyName, project: o.project.projectName, site: o.project.siteName,
        product: o.productName, grade: o.productGrade, ordered: qtyOf(o.quantity), plants: o.vendors.map((v) => v.vendor.companyName).join(', '),
        status: o.status, trucks: o.tmDetails.length, rejected: o.tmDetails.length - live.length,
        delivered: live.reduce((s, t) => s + (qtyOf(t.qty) || 0), 0),
        accepted: o.tmDetails.filter((t) => t.approvalStatus === 'ACCEPTED').reduce((s, t) => s + (qtyOf(t.qty) || 0), 0),
        missing: live.some((t) => !t.challanUrl) ? 'Y' : 'N', billNo: o.bill?.billNo, billStatus: o.bill?.status, deleted: o.isDeleted ? 'Y' : 'N',
      };
    }),
    totals: ['ordered', 'delivered', 'accepted', 'trucks'],
  };
}

export const REGISTERS = {
  sales: salesRegister,
  documents: documentSummary,
  outstanding: (from, to) => outstandingAgeing(),
  challans: challanRegister,
  exceptions: () => exceptions(),
  audit: auditTrail,
  orders: orderRegister,
};
