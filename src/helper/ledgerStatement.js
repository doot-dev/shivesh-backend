import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import db from '../config/database.js';
import { newWorkbook } from './xlsx.js';

/**
 * Client ledger account, laid out like Tally's (2026-09-29): Brought Forward,
 * then Date · Dr/Cr · Particulars · Vch Type · Vch No. · Debit · Credit, the
 * period totals and the closing balance. The client's account is debited by a
 * sale (bill) and credited by a receipt (payment) or a credit note (a bill
 * cancelled after it was issued).
 */
const SELLER = process.env.INVOICE_SELLER_NAME || 'Shivesh';
const r2 = (n) => Math.round(n * 100) / 100;
const MODE = { CASH: 'Cash', CHEQUE: 'Cheque', ONLINE: 'Online', BANK_TRANSFER: 'Bank transfer', UPI: 'UPI' };

const startOfDay = (s) => new Date(`${s}T00:00:00`);
const endOfDay = (s) => new Date(`${s}T23:59:59.999`);
/** Indian financial year start (1 Apr) for a date. */
const fyStart = (d = new Date()) => `${d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1}-04-01`;
const ymd = (d) => d.toLocaleDateString('en-CA');

export async function buildStatement(clientDbId, { from, to } = {}) {
  const fromS = /^\d{4}-\d{2}-\d{2}$/.test(from ?? '') ? from : fyStart();
  const toS = /^\d{4}-\d{2}-\d{2}$/.test(to ?? '') ? to : ymd(new Date());
  const [client, bills, payments] = await Promise.all([
    db.client.findUnique({ where: { id: clientDbId }, select: { clientId: true, companyName: true, gstNumber: true } }),
    db.bill.findMany({
      where: { isDeleted: false, order: { clientId: clientDbId } },
      select: { billNo: true, amount: true, status: true, issueDate: true, createdAt: true, updatedAt: true, order: { select: { orderId: true, project: { select: { projectName: true } } } } },
    }),
    db.payment.findMany({
      where: { clientId: clientDbId, status: 'ACTIVE' },
      select: { receiptNo: true, amount: true, receivedOn: true, mode: true, reference: true, bankName: true },
    }),
  ]);

  const entries = [];
  for (const b of bills) {
    entries.push({ date: b.issueDate || b.createdAt, drcr: 'Cr', particulars: 'Sales Account', note: `${b.order.orderId} · ${b.order.project.projectName}`, vchType: 'Sales', vchNo: b.billNo, debit: b.amount, credit: 0 });
    // A bill cancelled after it was issued is reversed by a credit note.
    if (b.status === 'CANCELLED') {
      entries.push({ date: b.updatedAt, drcr: 'Dr', particulars: 'Sales Return', note: `${b.billNo} cancelled`, vchType: 'Credit Note', vchNo: `CN-${b.billNo}`, debit: 0, credit: b.amount });
    }
  }
  for (const p of payments) {
    const how = MODE[p.mode] ?? p.mode;
    entries.push({ date: p.receivedOn, drcr: 'Dr', particulars: p.bankName || how || 'Bank', note: p.reference ? `${how} ${p.reference}` : how, vchType: 'Receipt', vchNo: p.receiptNo, debit: 0, credit: p.amount });
  }
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  const f = startOfDay(fromS); const t = endOfDay(toS);
  const before = entries.filter((e) => new Date(e.date) < f);
  const rows = entries.filter((e) => new Date(e.date) >= f && new Date(e.date) <= t);
  const opening = { debit: r2(before.reduce((s, e) => s + e.debit, 0)), credit: r2(before.reduce((s, e) => s + e.credit, 0)) };
  const totalDebit = r2(opening.debit + rows.reduce((s, e) => s + e.debit, 0));
  const totalCredit = r2(opening.credit + rows.reduce((s, e) => s + e.credit, 0));
  const net = r2(totalDebit - totalCredit);
  return {
    seller: SELLER,
    client,
    from: fromS,
    to: toS,
    opening,
    rows: rows.map((e) => ({ ...e, debit: r2(e.debit), credit: r2(e.credit) })),
    totalDebit,
    totalCredit,
    // Dr = the client owes; Cr = the client has paid in advance.
    closing: { amount: Math.abs(net), side: net >= 0 ? 'Dr' : 'Cr' },
    grandTotal: Math.max(totalDebit, totalCredit),
  };
}

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/ /g, '-');
const money = (n) => (n ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

/** A4 PDF in the Tally ledger layout; each page starts with Brought Forward. */
export async function statementPdf(s) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28; const H = 841.89; const M = 36;
  const COL = { date: M + 50, drcr: M + 58, part: M + 76, type: M + 250, no: M + 330, debit: W - M - 86, credit: W - M };
  let page; let y; let pageNo = 0; let runD = s.opening.debit; let runC = s.opening.credit;

  const text = (t, x, { f = font, size = 9, align = 'left' } = {}) => {
    const str = String(t ?? '');
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: align === 'right' ? x - w : x, y, size, font: f, color: rgb(0, 0, 0) });
  };
  const line = (yy, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: rgb(0, 0, 0) });
  const header = () => {
    page = pdf.addPage([W, H]); pageNo += 1; y = H - M;
    text(s.seller.toUpperCase(), M, { f: bold, size: 11 }); y -= 14;
    text(s.client?.companyName ?? '', M);
    text(`Ledger Account  :  ${fmtDate(s.from)} to ${fmtDate(s.to)}`, M + 200);
    text(`Page ${pageNo}`, W - M, { align: 'right' }); y -= 6; line(y); y -= 12;
    text('Date', COL.date, { f: bold, align: 'right' }); text('Particulars', COL.part, { f: bold });
    text('Vch Type', COL.type, { f: bold }); text('Vch No.', COL.no, { f: bold });
    text('Debit', COL.debit, { f: bold, align: 'right' }); text('Credit', COL.credit, { f: bold, align: 'right' });
    y -= 6; line(y); y -= 16;
    text('Brought Forward', COL.part); text(money(runD), COL.debit, { align: 'right' }); text(money(runC), COL.credit, { align: 'right' });
    y -= 18;
  };

  header();
  let lastDate = null;
  for (const r of s.rows) {
    if (y < M + 70) { header(); lastDate = null; }
    const d = fmtDate(r.date);
    if (d !== lastDate) { text(d, COL.date, { align: 'right' }); lastDate = d; }
    text(r.drcr, COL.drcr); text(r.particulars, COL.part, { f: bold });
    text(r.vchType, COL.type, { f: bold, size: 8 }); text(r.vchNo, COL.no, { size: 8 });
    text(money(r.debit), COL.debit, { align: 'right' }); text(money(r.credit), COL.credit, { align: 'right' });
    runD += r.debit; runC += r.credit;
    y -= 14;
  }
  if (y < M + 70) header();
  line(y + 8, COL.debit - 80); y -= 6;
  text(money(s.totalDebit), COL.debit, { align: 'right' }); text(money(s.totalCredit), COL.credit, { align: 'right' }); y -= 14;
  text(s.closing.side, COL.date, { align: 'right' }); text('Closing Balance', COL.part, { f: bold });
  text(money(s.closing.amount), s.closing.side === 'Dr' ? COL.credit : COL.debit, { align: 'right' });
  y -= 6; line(y, COL.debit - 80); y -= 12;
  text(money(s.grandTotal), COL.debit, { f: bold, align: 'right' }); text(money(s.grandTotal), COL.credit, { f: bold, align: 'right' });
  y -= 4; line(y, COL.debit - 80);
  return Buffer.from(await pdf.save());
}

/** The same statement as an Excel sheet with real dates and numbers. */
export async function statementXlsx(s) {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Ledger');
  ws.addRow([s.seller.toUpperCase()]).font = { bold: true, size: 13 };
  ws.addRow([`${s.client?.companyName ?? ''} — Ledger Account ${fmtDate(s.from)} to ${fmtDate(s.to)}`]).font = { italic: true };
  const head = ws.addRow(['Date', 'Dr/Cr', 'Particulars', 'Vch Type', 'Vch No.', 'Narration', 'Debit', 'Credit']);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
  ws.addRow([null, null, 'Brought Forward', null, null, null, s.opening.debit || null, s.opening.credit || null]).font = { italic: true };
  for (const r of s.rows) ws.addRow([new Date(r.date), r.drcr, r.particulars, r.vchType, r.vchNo, r.note, r.debit || null, r.credit || null]);
  ws.addRow([null, null, 'Total', null, null, null, s.totalDebit, s.totalCredit]).font = { bold: true };
  ws.addRow([null, s.closing.side, 'Closing Balance', null, null, null, s.closing.side === 'Cr' ? s.closing.amount : null, s.closing.side === 'Dr' ? s.closing.amount : null]).font = { bold: true };
  ws.addRow([null, null, null, null, null, null, s.grandTotal, s.grandTotal]).font = { bold: true };
  [12, 7, 26, 13, 20, 36, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(1).numFmt = 'dd-mmm-yy';
  ws.getColumn(7).numFmt = '#,##0.00';
  ws.getColumn(8).numFmt = '#,##0.00';
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Send JSON, PDF or XLSX by `?format=`. */
export async function sendStatement(res, clientDbId, query) {
  const s = await buildStatement(clientDbId, query);
  const name = `Ledger_${(s.client?.companyName ?? 'client').replace(/[^a-z0-9]+/gi, '-')}_${s.from}_to_${s.to}`;
  if (query.format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
    return res.send(await statementPdf(s));
  }
  if (query.format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    return res.send(await statementXlsx(s));
  }
  return res.json({ success: true, data: s });
}
