// Self-check for the invoice PDF: attachments are appended, missing files and
// rejected TMs are skipped, and paths outside public/uploads are refused.
// Uses synthetic data only — touches no database.
//
//   node scripts/verify_invoice_pdf.mjs [out.pdf]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { buildInvoicePdf, uploadPath } from '../src/helper/invoicePdf.js';

const dir = path.resolve('public/uploads/_verify_invoice');
fs.mkdirSync(dir, { recursive: true });
try {
  const att = await PDFDocument.create();
  att.addPage(); att.addPage();
  fs.writeFileSync(path.join(dir, 'bill.pdf'), await att.save());
  // 1x1 PNG
  fs.writeFileSync(path.join(dir, 'challan.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

  const bill = { billNo: 'BILL-2026-0001', quantity: 30, rate: 5200, amount: 156000, status: 'PENDING', issueDate: new Date(), dueDate: null, documentUrl: '/uploads/_verify_invoice/bill.pdf' };
  const order = {
    orderId: 'ORD-2026-0001', date: new Date(), productName: 'RMC', productGrade: 'M25',
    client: { companyName: 'Acme Builders', gstNumber: '27ABCDE1234F1Z5', contactNumber: '9999999999', email: 'a@b.c' },
    project: { projectName: 'Tower A', siteName: 'Site 1', projectLocation: 'Pune' },
    vendors: [{ vendor: { companyName: 'V1' }, vendorLocation: { plantName: 'Plant 1' } }],
    tmDetails: [
      { tmNumber: 'TM 01', truckNo: 'MH12AB1234', qty: '6', challanNo: 'C1', challanUrl: '/uploads/_verify_invoice/challan.png', approvalStatus: 'ACCEPTED' },
      { tmNumber: 'TM 02', truckNo: 'MH12AB9999', qty: '6', challanNo: 'C2', challanUrl: '/uploads/_verify_invoice/challan.png', approvalStatus: 'REJECTED' },
      { tmNumber: 'TM 03', truckNo: 'MH12AB5555', qty: '6', challanNo: 'C3', challanUrl: '/uploads/_verify_invoice/missing.jpg', approvalStatus: 'PENDING' },
    ],
  };

  const bytes = await buildInvoicePdf(bill, order);
  const out = await PDFDocument.load(bytes);
  // 1 invoice page + 2-page bill PDF + 1 page for TM 01's PNG. TM 02 is
  // rejected, TM 03's file is missing.
  assert.equal(out.getPageCount(), 4);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], bytes);

  assert.equal(uploadPath('/uploads/../src/app.js'), null);
  assert.equal(uploadPath('/etc/passwd'), null);
  assert.ok(uploadPath('/uploads/bills/x.pdf'));

  console.log('Invoice PDF OK');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
