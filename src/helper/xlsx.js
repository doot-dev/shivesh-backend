import ExcelJS from 'exceljs';

/**
 * Register sheets for the CA Pack (docs/04-exports-and-reports.md §1): title row,
 * frozen bold header with autofilter, real dates/numbers (never text), and a
 * totals row with SUM() formulas the CA can check.
 *
 * column: { header, key, type: 'text'|'date'|'money'|'qty'|'int', width? }
 */
const FMT = { date: 'dd-mm-yyyy', money: '#,##0.00', qty: '#,##0.000', int: '0' };

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shivesh';
  wb.created = new Date();
  return wb;
}

export function addRegisterSheet(wb, { name, title, subtitle, columns, rows, totals = [] }) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow([title]).font = { bold: true, size: 13 };
  ws.addRow([subtitle]).font = { italic: true, color: { argb: 'FF666666' } };
  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
  const headerRow = header.number;

  for (const r of rows) {
    ws.addRow(columns.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined || v === '') return null;
      if (c.type === 'date') return v instanceof Date ? v : new Date(v);
      if (['money', 'qty', 'int'].includes(c.type)) { const n = Number(v); return Number.isFinite(n) ? n : null; }
      return String(v);
    }));
  }

  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width || Math.max(10, Math.min(40, c.header.length + 4));
    if (FMT[c.type]) col.numFmt = FMT[c.type];
  });

  const last = ws.rowCount;
  if (totals.length && rows.length) {
    const t = ws.addRow(columns.map((c, i) => {
      if (i === 0) return 'Total';
      if (!totals.includes(c.key)) return null;
      const L = ws.getColumn(i + 1).letter;
      return { formula: `SUM(${L}${headerRow + 1}:${L}${last})` };
    }));
    t.font = { bold: true };
  }

  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columns.length } };
  return ws;
}
