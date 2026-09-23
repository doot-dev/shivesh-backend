import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import logger from './logger.js';

/**
 * Builds the invoice PDF for a bill: the invoice page (client, site, order,
 * line item, TM/challan table) followed by every supporting bill attached to
 * it — the uploaded bill document and each non-rejected TM challan — so the
 * client receives the invoice and its proof of delivery as a single file.
 *
 * Built on demand, never stored: TM approvals and uploads keep changing until
 * the bill is paid, and a stored copy would silently go stale.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '../../public/uploads');

// Seller block. Real legal name/address/GSTIN differ per deployment, so they
// come from the environment rather than being hardcoded.
const SELLER = {
  name: process.env.INVOICE_SELLER_NAME || 'Shivesh',
  address: process.env.INVOICE_SELLER_ADDRESS || '',
  gstin: process.env.INVOICE_SELLER_GSTIN || '',
};

const A4 = [595.28, 841.89];
const MARGIN = 40;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const RED = rgb(0.7, 0.1, 0.1);
const LINE = rgb(0.85, 0.85, 0.85);

// ponytail: the standard fonts only encode Latin-1, so anything else (e.g. a
// Devanagari client name) prints as '?'. Embed a TTF via @pdf-lib/fontkit if
// that ever matters.
const clean = (v) => String(v ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

const money = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const date = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

/** Map a public "/uploads/..." URL to its file on disk, refusing anything outside uploads/. */
export function uploadPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const file = path.resolve(UPLOADS_DIR, '.' + url.slice('/uploads'.length));
  return file.startsWith(UPLOADS_DIR + path.sep) ? file : null;
}

/** Append one attachment (PDF pages, or an image on its own page). Returns false if unreadable. */
async function appendAttachment(doc, url, caption, font) {
  const file = uploadPath(url);
  if (!file) return false;

  try {
    const bytes = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();

    if (ext === '.pdf') {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
      return true;
    }

    const image = ext === '.png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const page = doc.addPage(A4);
    const [w, h] = A4;
    page.drawText(clean(caption), { x: MARGIN, y: h - MARGIN, size: 11, font });
    const box = { w: w - 2 * MARGIN, h: h - 2 * MARGIN - 24 };
    const scale = Math.min(box.w / image.width, box.h / image.height, 1);
    const iw = image.width * scale;
    const ih = image.height * scale;
    page.drawImage(image, { x: (w - iw) / 2, y: MARGIN + (box.h - ih) / 2, width: iw, height: ih });
    return true;
  } catch (err) {
    logger.warn(`Invoice attachment skipped (${url}): ${err.message}`);
    return false;
  }
}

/**
 * @param {object} bill  Bill row.
 * @param {object} order Order loaded with billController's buildBillOrderInclude().
 * @returns {Promise<Uint8Array>}
 */
export async function buildInvoicePdf(bill, order) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${bill.billNo}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const [W, H] = A4;
  let page = doc.addPage(A4);
  let y = H - MARGIN;

  const text = (s, x, { size = 9, isBold = false, color = BLACK, align, max } = {}) => {
    const f = isBold ? bold : font;
    let str = clean(s);
    // Truncate to the column so a long name never runs into the next one.
    if (max) while (str.length > 3 && f.widthOfTextAtSize(str, size) > max) str = str.slice(0, -4) + '...';
    const dx = align === 'right' ? -f.widthOfTextAtSize(str, size) : 0;
    page.drawText(str, { x: x + dx, y, size, font: f, color });
  };
  const rule = () =>
    page.drawLine({ start: { x: MARGIN, y }, end: { x: W - MARGIN, y }, thickness: 0.7, color: LINE });
  const ensure = (needed) => {
    if (y - needed < MARGIN + 20) {
      page = doc.addPage(A4);
      y = H - MARGIN;
    }
  };
  const R = W - MARGIN;

  // ── Header ────────────────────────────────────────────────────────────────
  text(SELLER.name, MARGIN, { isBold: true, size: 18, max: 330 });
  text('INVOICE', R, { isBold: true, size: 18, align: 'right' });
  y -= 18;
  if (SELLER.address) text(SELLER.address, MARGIN, { color: GREY, max: 330 });
  text(`Invoice No: ${bill.billNo}`, R, { align: 'right' });
  y -= 12;
  if (SELLER.gstin) text(`GSTIN: ${SELLER.gstin}`, MARGIN, { color: GREY });
  text(`Issue Date: ${date(bill.issueDate || bill.createdAt)}`, R, { align: 'right' });
  y -= 12;
  text(`Due Date: ${date(bill.dueDate)}`, R, { align: 'right' });
  y -= 12;
  text(`Status: ${bill.status}`, R, { align: 'right' });
  y -= 12;
  rule();
  y -= 18;

  // ── Bill to / Site / Order ────────────────────────────────────────────────
  const colW = (W - 2 * MARGIN) / 3;
  const plants = (order.vendors ?? []).map((v) => v.vendorLocation?.plantName || v.vendor?.companyName).filter(Boolean);
  const blocks = [
    ['BILL TO', [order.client?.companyName, order.client?.gstNumber && `GSTIN: ${order.client.gstNumber}`, order.client?.contactNumber, order.client?.email]],
    ['DELIVERY SITE', [order.project?.projectName, order.project?.siteName, order.project?.projectLocation]],
    ['ORDER', [`Order No: ${order.orderId}`, `Order Date: ${date(order.date)}`, plants.length && `Plant: ${plants.join(', ')}`]],
  ];
  const top = y;
  let lowest = y;
  blocks.forEach(([title, lines], i) => {
    y = top;
    const x = MARGIN + i * colW;
    text(title, x, { isBold: true, color: GREY, size: 8 });
    for (const l of lines.filter(Boolean)) {
      y -= 12;
      text(l, x, { max: colW - 10 });
    }
    lowest = Math.min(lowest, y);
  });
  y = lowest - 26;

  // ── Line item ─────────────────────────────────────────────────────────────
  const QTY = 360, RATE = 450, AMT = R - 4;
  page.drawRectangle({ x: MARGIN, y: y - 5, width: W - 2 * MARGIN, height: 18, color: rgb(0.95, 0.95, 0.95) });
  text('Description', MARGIN + 4, { isBold: true });
  text('Qty (m3)', QTY, { isBold: true, align: 'right' });
  text('Rate', RATE, { isBold: true, align: 'right' });
  text('Amount', AMT, { isBold: true, align: 'right' });
  y -= 22;
  text(`${order.productName} ${order.productGrade}`, MARGIN + 4, { max: 250 });
  text(bill.quantity, QTY, { align: 'right' });
  text(money(bill.rate), RATE, { align: 'right' });
  text(money(bill.amount), AMT, { align: 'right' });
  y -= 10;
  rule();
  y -= 16;
  text('Total', RATE, { isBold: true, size: 11, align: 'right' });
  text(money(bill.amount), AMT, { isBold: true, size: 11, align: 'right' });
  y -= 32;

  // ── Delivery (TM) details ─────────────────────────────────────────────────
  const tms = order.tmDetails ?? [];
  if (tms.length) {
    ensure(40);
    text('DELIVERY DETAILS', MARGIN, { isBold: true, color: GREY, size: 8 });
    y -= 14;
    const tc = [MARGIN, 90, 185, 240, 330, 440, R];
    ['TM', 'Truck No', 'Qty', 'Challan No', 'Batch Time', 'Approval'].forEach((h, i) => text(h, tc[i], { isBold: true }));
    y -= 6;
    rule();
    for (const tm of tms) {
      ensure(14);
      y -= 13;
      const batch = [tm.batchStartTime, tm.batchEndTime].filter(Boolean).join(' - ');
      [tm.tmNumber, tm.truckNo, tm.qty, tm.challanNo || '-', batch || '-', tm.approvalStatus].forEach((v, i) =>
        text(v, tc[i], { max: tc[i + 1] - tc[i] - 6 }),
      );
    }
    y -= 26;
  }

  // ── Attachments ───────────────────────────────────────────────────────────
  // Rejected TMs are left out: their challan is exactly what the office said
  // does not belong on this bill.
  const attachments = [
    bill.documentUrl && { url: bill.documentUrl, caption: `Bill document - ${bill.billNo}` },
    ...tms
      .filter((tm) => tm.challanUrl && tm.approvalStatus !== 'REJECTED')
      .map((tm) => ({ url: tm.challanUrl, caption: `Challan ${tm.challanNo || ''} - ${tm.tmNumber} (${tm.truckNo})` })),
  ].filter(Boolean);

  // The attachment list goes on the invoice, but is written AFTER appending so
  // it states which files actually made it in. Reserve its space now.
  ensure(20 + Math.max(1, attachments.length) * 12);
  const listPage = page;
  const listY = y;
  const invoicePageCount = doc.getPageCount();

  const results = [];
  for (const a of attachments) {
    results.push({ ...a, ok: await appendAttachment(doc, a.url, a.caption, bold) });
  }

  page = listPage;
  y = listY;
  text('ATTACHED BILLS', MARGIN, { isBold: true, color: GREY, size: 8 });
  if (!results.length) {
    y -= 12;
    text('None', MARGIN, { color: GREY });
  }
  for (const r of results) {
    y -= 12;
    text(`${r.ok ? '-' : 'x'}  ${r.caption}${r.ok ? '' : '  (file missing, not attached)'}`, MARGIN, {
      color: r.ok ? BLACK : RED,
      max: W - 2 * MARGIN,
    });
  }

  doc.getPages().slice(0, invoicePageCount).forEach((p) =>
    p.drawText('This is a computer-generated invoice.', { x: MARGIN, y: MARGIN - 10, size: 7, font, color: GREY }),
  );

  return doc.save();
}
