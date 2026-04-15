const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1NxMK1jb6DBw45ttqAplRSq2IJcQzUFIEMPKdfN2tHb4';
const STOCK_SHEET_NAME = process.env.GOOGLE_STOCK_SHEET_NAME || 'JUBILANT STOCK APRIL 26';
const LOG_SHEET_NAME = process.env.GOOGLE_LOG_SHEET_NAME || 'Entry Log';

function parseQty(value) {
  if (value === null || value === undefined) return 0;
  const text = String(value);
  const match = text.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function asUnit(value) {
  return `${Math.trunc(Number(value) || 0)} UNIT`;
}

function toColumnLetter(colNum) {
  let n = colNum;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function getSheetsClient() {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || path.join(process.cwd(), 'service-account.json');
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath, 'utf8');
      const json = JSON.parse(raw);
      email = json.client_email;
      privateKey = json.private_key;
    }
  }

  if (!email || !privateKey) {
    throw new Error(
      'Google Sheets credentials missing. Either set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env, or place service-account.json in project root.'
    );
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function ensureLogSheet(sheets) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = (metadata.data.sheets || []).some((s) => s.properties && s.properties.title === LOG_SHEET_NAME);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: LOG_SHEET_NAME } } }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${LOG_SHEET_NAME}'!A1:F1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['Timestamp', 'Date', 'Type', 'Challan', 'Product', 'Quantity']],
    },
  });
}

async function writeTransactionSheet({ sheets, type, date, challan, mergedQtyByProduct }) {
  const txSheetName = type === 'purchases' ? 'Purchases' : 'Sales';
  const txRange = `'${txSheetName}'!A1:ZZ300`;
  const txRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: txRange,
  });
  const values = txRes.data.values || [];

  const row3 = values[2] || [];
  const row4 = values[3] || [];

  let targetCol = -1;
  for (let i = 0; i < row3.length; i += 1) {
    if (String(row3[i]).trim() === String(challan)) {
      targetCol = i + 1; // 1-based
      break;
    }
  }
  if (targetCol === -1) {
    targetCol = Math.max(row4.length, 2) + 1;
  }

  const txUpdates = [
    {
      range: `'${txSheetName}'!${toColumnLetter(targetCol)}2:${toColumnLetter(targetCol)}4`,
      values: [[date], [String(challan)], ['Qty']],
    },
  ];

  const productRowMap = {};
  for (let r = 4; r < values.length; r += 1) {
    const name = (values[r][1] || '').trim().toUpperCase();
    if (name) productRowMap[name] = r + 1; // sheet row
  }

  Object.entries(mergedQtyByProduct).forEach(([productKey, qty]) => {
    const rowNum = productRowMap[productKey];
    if (!rowNum) return;
    txUpdates.push({
      range: `'${txSheetName}'!${toColumnLetter(targetCol)}${rowNum}`,
      values: [[qty]],
    });
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: txUpdates,
    },
  });
}

async function updateInventoryInSheet({ type, date, challan, items }) {
  const sheets = getSheetsClient();
  const range = `'${STOCK_SHEET_NAME}'!B4:F200`;

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });

  const rows = data.values || [];
  const rowMap = {};
  rows.forEach((row, idx) => {
    const product = (row[0] || '').trim().toUpperCase();
    if (product) rowMap[product] = { rowIndex: idx + 4, row };
  });

  const mergedQtyByProduct = {};
  for (const item of items) {
    const key = String(item.product || '').trim().toUpperCase();
    if (!key) continue;
    mergedQtyByProduct[key] = (mergedQtyByProduct[key] || 0) + (parseInt(item.qty, 10) || 0);
  }

  const updates = [];
  const notFoundProducts = [];

  Object.entries(mergedQtyByProduct).forEach(([key, qty]) => {
    const target = rowMap[key];
    if (!target) {
      notFoundProducts.push(key);
      return;
    }

    const opening = parseQty(target.row[1]);
    const purchases = parseQty(target.row[2]);
    const sales = parseQty(target.row[3]);

    const nextPurchases = type === 'purchases' ? purchases + qty : purchases;
    const nextSales = type === 'sales' ? sales + qty : sales;
    const nextBalance = opening + nextPurchases - nextSales;

    updates.push({
      range: `'${STOCK_SHEET_NAME}'!D${target.rowIndex}:F${target.rowIndex}`,
      values: [[asUnit(nextPurchases), asUnit(nextSales), asUnit(nextBalance)]],
    });
  });

  await writeTransactionSheet({ sheets, type, date, challan, mergedQtyByProduct });

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });
  }

  await ensureLogSheet(sheets);
  const nowIso = new Date().toISOString();
  const logRows = items.map((item) => [
    nowIso,
    date,
    type,
    challan,
    item.product,
    parseInt(item.qty, 10) || 0,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${LOG_SHEET_NAME}'!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: logRows },
  });

  return {
    updatedProducts: updates.length,
    notFoundProducts,
  };
}

module.exports = {
  updateInventoryInSheet,
};
