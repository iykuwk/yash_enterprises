// POST /api/entry
// Body: { type: "purchases"|"sales", date, challan, items: [{product, qty}] }
// Reads the base Excel template, appends a new challan column, updates stock, returns file.

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Template is bundled with the deployment under /api/template/inventory.xlsx
// The server writes output to the OS temp directory.
const TEMPLATE_PATH = path.join(__dirname, 'template', 'inventory.xlsx');
const OUTPUT_PATH   = path.join(os.tmpdir(), 'inventory_out.xlsx');

// Sheet names
const SHEET = {
  PURCHASES: 'Purchases',
  SALES: 'Sales',
  STOCK: 'JUBILANT STOCK APRIL 26',
};

// In the Purchases / Sales sheets:
//   Row 1 (idx 1): title
//   Row 2 (idx 2): Date row
//   Row 3 (idx 3): Bill/Challan No row
//   Row 4 (idx 4): Column headers (Sr.No | Jubifix | Qty Qty Qty...)
//   Row 5+ (idx 5+): Product rows, product name in col B (col 2)
// Each challan gets ONE new column appended after the last Qty column.

// Stock sheet:
//   Row 3 (idx 3): headers (Sr.No | Jubifix | Opening | Purchases | Sales | Balance)
//   Row 4+ (idx 4+): product rows, name in col B, purchases col D, sales col E, balance col F

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { type, date, challan, items } = req.body;
  if (!type || !date || !challan || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Load workbook — use /tmp copy if exists (persists edits within same instance)
    const srcPath = fs.existsSync(OUTPUT_PATH) ? OUTPUT_PATH : TEMPLATE_PATH;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(srcPath);

    const txSheet   = wb.getWorksheet(type === 'purchases' ? SHEET.PURCHASES : SHEET.SALES);
    const stockSheet = wb.getWorksheet(SHEET.STOCK);

    // ── Find last used column in the transaction sheet (row 4 = header row) ──
    const headerRow = txSheet.getRow(4);
    let lastCol = 2; // col B minimum
    headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
      if (colNum > lastCol) lastCol = colNum;
    });
    const newCol = lastCol + 1; // next free column

    // ── Write date into row 2 cell of new column ──
    txSheet.getRow(2).getCell(newCol).value = date;

    // ── Write challan number into row 3 cell of new column ──
    txSheet.getRow(3).getCell(newCol).value = challan;

    // ── Write header "Qty" in row 4 ──
    txSheet.getRow(4).getCell(newCol).value = 'Qty';

    // Build a lookup: productName → row number in transaction sheet
    const txProductRows = {};
    txSheet.eachRow((row, rowNum) => {
      if (rowNum < 5) return;
      const name = row.getCell(2).value; // col B
      if (name && typeof name === 'string') {
        txProductRows[name.trim().toUpperCase()] = rowNum;
      }
    });

    // Build a lookup: productName → row number in stock sheet
    const stockProductRows = {};
    stockSheet.eachRow((row, rowNum) => {
      if (rowNum < 4) return;
      const name = row.getCell(2).value; // col B
      if (name && typeof name === 'string') {
        stockProductRows[name.trim().toUpperCase()] = rowNum;
      }
    });

    // ── Write quantities and update stock ──
    for (const { product, qty } of items) {
      const key = product.trim().toUpperCase();
      const qtyNum = parseInt(qty, 10) || 0;

      // Write into transaction sheet
      const txRow = txProductRows[key];
      if (txRow) {
        txSheet.getRow(txRow).getCell(newCol).value = qtyNum;
      }

      // Update stock sheet
      const sRow = stockProductRows[key];
      if (sRow) {
        const row = stockSheet.getRow(sRow);
        // Col D = Purchases (index 4), Col E = Sales (index 5), Col F = Balance (index 6)
        if (type === 'purchases') {
          const prev = Number(row.getCell(4).value) || 0;
          row.getCell(4).value = prev + qtyNum;
        } else {
          const prev = Number(row.getCell(5).value) || 0;
          row.getCell(5).value = prev + qtyNum;
        }
        // Recalculate balance = Opening + Purchases - Sales
        const opening  = Number(row.getCell(3).value) || 0;
        const purchases = Number(row.getCell(4).value) || 0;
        const sales    = Number(row.getCell(5).value) || 0;
        row.getCell(6).value = opening + purchases - sales;
        row.commit();
      }
    }

    // Commit rows
    txSheet.getRow(2).commit();
    txSheet.getRow(3).commit();
    txSheet.getRow(4).commit();

    // Save to /tmp
    await wb.xlsx.writeFile(OUTPUT_PATH);

    // Return updated file as download
    const fileBuffer = fs.readFileSync(OUTPUT_PATH);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inventory_updated.xlsx"`);
    res.send(fileBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
