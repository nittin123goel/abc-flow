import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const fmtINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// ===== EXCEL EXPORTS =====

export async function exportLedgerExcel(rows, res) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ABC Metals Cash Flow';
  wb.created = new Date();
  const ws = wb.addWorksheet('General Ledger');

  ws.columns = [
    { header: 'Date', key: 'txn_date', width: 14 },
    { header: 'Voucher', key: 'txn_ref', width: 22 },
    { header: 'Type', key: 'txn_type', width: 14 },
    { header: 'Particulars', key: 'description', width: 40 },
    { header: 'Account', key: 'account_label', width: 24 },
    { header: 'Debit (Dr.)', key: 'debit', width: 16 },
    { header: 'Credit (Cr.)', key: 'credit', width: 16 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };

  let totalDebit = 0, totalCredit = 0;
  rows.forEach(r => {
    ws.addRow({
      ...r,
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    });
    totalDebit += Number(r.debit) || 0;
    totalCredit += Number(r.credit) || 0;
  });

  ws.addRow({});
  const totalRow = ws.addRow({
    description: 'TOTAL',
    debit: totalDebit,
    credit: totalCredit,
  });
  totalRow.font = { bold: true };

  ws.getColumn('debit').numFmt = '#,##0.00';
  ws.getColumn('credit').numFmt = '#,##0.00';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ledger-${new Date().toISOString().slice(0,10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

export async function exportExpensesExcel(rows, res, label = 'expenses') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Expenses');

  ws.columns = [
    { header: 'Date', key: 'expense_date', width: 14 },
    { header: 'Reference', key: 'txn_ref', width: 22 },
    { header: 'Employee', key: 'employee_name', width: 22 },
    { header: 'Category', key: 'category_name', width: 20 },
    { header: 'Subcategory', key: 'subcategory_name', width: 20 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Amount', key: 'amount', width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };

  let total = 0;
  rows.forEach(r => {
    ws.addRow({ ...r, amount: Number(r.amount) || 0 });
    total += Number(r.amount) || 0;
  });

  ws.addRow({});
  const totalRow = ws.addRow({ description: 'TOTAL', amount: total });
  totalRow.font = { bold: true };
  ws.getColumn('amount').numFmt = '#,##0.00';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${label}-${new Date().toISOString().slice(0,10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

// ===== PDF EXPORT =====

export function exportLedgerPDF(rows, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 36, layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ledger-${new Date().toISOString().slice(0,10)}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(18).font('Helvetica-Bold').text('ABC Metals Company', { align: 'center' });
  doc.fontSize(10).font('Helvetica').fillColor('#666').text(`General Ledger · ${fmtDate(new Date())}`, { align: 'center' });
  doc.moveDown(1.2);

  // Table header
  const startY = doc.y;
  const cols = [
    { label: 'Date', x: 36, w: 70 },
    { label: 'Voucher', x: 106, w: 110 },
    { label: 'Particulars', x: 216, w: 220 },
    { label: 'Account', x: 436, w: 130 },
    { label: 'Debit', x: 566, w: 100, align: 'right' },
    { label: 'Credit', x: 666, w: 100, align: 'right' },
  ];
  doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
  cols.forEach(c => doc.text(c.label, c.x, startY, { width: c.w, align: c.align || 'left' }));
  doc.moveTo(36, startY + 14).lineTo(770, startY + 14).strokeColor('#000').stroke();

  // Rows
  doc.font('Helvetica').fontSize(8);
  let y = startY + 20;
  let totalDebit = 0, totalCredit = 0;

  rows.forEach(r => {
    if (y > 540) {
      doc.addPage({ size: 'A4', margin: 36, layout: 'landscape' });
      y = 50;
    }
    doc.fillColor('#000').text(fmtDate(r.txn_date), cols[0].x, y, { width: cols[0].w });
    doc.fillColor('#8B2635').text(r.txn_ref, cols[1].x, y, { width: cols[1].w });
    doc.fillColor('#333').text((r.description || '').slice(0, 60), cols[2].x, y, { width: cols[2].w });
    doc.fillColor('#666').text(r.account_label || '', cols[3].x, y, { width: cols[3].w });
    doc.fillColor(r.debit > 0 ? '#B33A3A' : '#999').text(r.debit > 0 ? fmtINR(r.debit) : '—', cols[4].x, y, { width: cols[4].w, align: 'right' });
    doc.fillColor(r.credit > 0 ? '#2D5F3F' : '#999').text(r.credit > 0 ? fmtINR(r.credit) : '—', cols[5].x, y, { width: cols[5].w, align: 'right' });
    totalDebit += Number(r.debit) || 0;
    totalCredit += Number(r.credit) || 0;
    y += 16;
  });

  // Totals
  y += 10;
  doc.moveTo(36, y).lineTo(770, y).strokeColor('#000').lineWidth(1.5).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  doc.text('TOTAL', cols[2].x, y, { width: cols[2].w });
  doc.fillColor('#B33A3A').text(fmtINR(totalDebit), cols[4].x, y, { width: cols[4].w, align: 'right' });
  doc.fillColor('#2D5F3F').text(fmtINR(totalCredit), cols[5].x, y, { width: cols[5].w, align: 'right' });

  doc.end();
}

export function exportExpensesPDF(rows, res, title = 'Expenses Report') {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).font('Helvetica-Bold').text('ABC Metals Company', { align: 'center' });
  doc.fontSize(11).font('Helvetica').fillColor('#666').text(title, { align: 'center' });
  doc.moveDown(1);

  doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
  const headerY = doc.y;
  const cols = [
    { label: 'Date', x: 40, w: 65 },
    { label: 'Ref', x: 105, w: 85 },
    { label: 'Employee', x: 190, w: 85 },
    { label: 'Category', x: 275, w: 95 },
    { label: 'Description', x: 370, w: 130 },
    { label: 'Amount', x: 500, w: 70, align: 'right' },
  ];
  cols.forEach(c => doc.text(c.label, c.x, headerY, { width: c.w, align: c.align || 'left' }));
  doc.moveTo(40, headerY + 14).lineTo(570, headerY + 14).stroke();

  doc.font('Helvetica').fontSize(8);
  let y = headerY + 20;
  let total = 0;
  rows.forEach(r => {
    if (y > 770) { doc.addPage(); y = 50; }
    doc.fillColor('#000').text(fmtDate(r.expense_date), cols[0].x, y, { width: cols[0].w });
    doc.fillColor('#8B2635').text(r.txn_ref, cols[1].x, y, { width: cols[1].w });
    doc.fillColor('#000').text(r.employee_name || '', cols[2].x, y, { width: cols[2].w });
    doc.fillColor('#333').text(r.category_name || '', cols[3].x, y, { width: cols[3].w });
    doc.fillColor('#666').text((r.description || '').slice(0, 60), cols[4].x, y, { width: cols[4].w });
    doc.fillColor('#B33A3A').text(fmtINR(r.amount), cols[5].x, y, { width: cols[5].w, align: 'right' });
    total += Number(r.amount) || 0;
    y += 16;
  });

  y += 10;
  doc.moveTo(40, y).lineTo(570, y).lineWidth(1.5).stroke();
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
  doc.text('TOTAL', cols[4].x, y + 8, { width: cols[4].w });
  doc.fillColor('#B33A3A').text(fmtINR(total), cols[5].x, y + 8, { width: cols[5].w, align: 'right' });

  doc.end();
}
