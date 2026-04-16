const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1NxMK1jb6DBw45ttqAplRSq2IJcQzUFIEMPKdfN2tHb4';
const STOCK_SHEET_NAME = process.env.GOOGLE_STOCK_SHEET_NAME || 'JUBILANT STOCK APRIL 26';
const STOCK_TEMPLATE_SHEET_NAME = process.env.GOOGLE_STOCK_TEMPLATE_SHEET_NAME || STOCK_SHEET_NAME;
const STOCK_SHEET_PREFIX = process.env.GOOGLE_STOCK_SHEET_PREFIX || 'JUBLIANT STOCK';
const PURCHASE_TEMPLATE_SHEET_NAME = process.env.GOOGLE_PURCHASE_TEMPLATE_SHEET_NAME || 'Purchases';
const SALES_TEMPLATE_SHEET_NAME = process.env.GOOGLE_SALES_TEMPLATE_SHEET_NAME || 'Sales';
const LOG_SHEET_NAME = process.env.GOOGLE_LOG_SHEET_NAME || 'Entry Log';
const CUSTOMER_LABEL_CELL = process.env.GOOGLE_CUSTOMER_LABEL_CELL || 'B95';
const CUSTOMER_VALUE_CELL = process.env.GOOGLE_CUSTOMER_VALUE_CELL || 'C95';
const DELIVERY_CHALLAN_ANCHOR_TEXT = (process.env.GOOGLE_DELIVERY_CHALLAN_ANCHOR_TEXT || 'DELIVERY CHALLAN NO').toUpperCase();

function getMonthYearFromDate(dateText) {
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date provided: ${dateText}`);
  }
  const month = d.toLocaleString('en-US', { month: 'long' }).toUpperCase();
  const year = d.getFullYear();
  return { month, year };
}

function getMonthlyStockSheetName(dateText) {
  const { month, year } = getMonthYearFromDate(dateText);
  return `${STOCK_SHEET_PREFIX} ${month} ${year}`;
}

function getMonthlyTransactionSheetName(type, dateText) {
  const { month, year } = getMonthYearFromDate(dateText);
  const base = type === 'purchases' ? 'Purchases' : 'Sales';
  return `${base} ${month} ${year}`;
}

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

function findDeliveryChallanAnchor(values) {
  for (let r = 0; r < values.length; r += 1) {
    const row = values[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      const cellText = String(row[c] || '').trim().toUpperCase();
      if (cellText.includes(DELIVERY_CHALLAN_ANCHOR_TEXT)) {
        return { row: r + 1, col: c + 1 };
      }
    }
  }
  return null;
}

function getCustomerPlacement(values) {
  const anchor = findDeliveryChallanAnchor(values);
  if (anchor) {
    return {
      labelCell: `${toColumnLetter(anchor.col)}${anchor.row + 1}`,
      valueCell: `${toColumnLetter(anchor.col + 1)}${anchor.row + 1}`,
    };
  }

  return {
    labelCell: CUSTOMER_LABEL_CELL,
    valueCell: CUSTOMER_VALUE_CELL,
  };
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

async function getSpreadsheetMetadata(sheets) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return metadata.data.sheets || [];
}

async function ensureSheetFromTemplate({ sheets, templateTitle, targetTitle }) {
  const sheetList = await getSpreadsheetMetadata(sheets);
  const existing = sheetList.find((s) => s.properties && s.properties.title === targetTitle);
  if (existing) {
    return existing.properties.sheetId;
  }

  const templateSheet = sheetList.find((s) => s.properties && s.properties.title === templateTitle);
  if (!templateSheet) {
    throw new Error(`Template sheet "${templateTitle}" not found. Please create it first.`);
  }

  const copied = await sheets.spreadsheets.sheets.copyTo({
    spreadsheetId: SHEET_ID,
    sheetId: templateSheet.properties.sheetId,
    requestBody: { destinationSpreadsheetId: SHEET_ID },
  });
  const copiedSheetId = copied.data.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: copiedSheetId,
              title: targetTitle,
            },
            fields: 'title',
          },
        },
      ],
    },
  });

  return copiedSheetId;
}

async function ensureLogSheet(sheets) {
  const allSheets = await getSpreadsheetMetadata(sheets);
  const exists = allSheets.some((s) => s.properties && s.properties.title === LOG_SHEET_NAME);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: LOG_SHEET_NAME } } }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${LOG_SHEET_NAME}'!A1:G1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['Timestamp', 'Date', 'Type', 'Challan', 'Customer Name', 'Product', 'Quantity']],
    },
  });
}

async function writeTransactionSheet({ sheets, type, date, challan, customerName, mergedQtyByProduct }) {
  const txSheetName = getMonthlyTransactionSheetName(type, date);
  const txTemplateSheetName = type === 'purchases' ? PURCHASE_TEMPLATE_SHEET_NAME : SALES_TEMPLATE_SHEET_NAME;
  await ensureSheetFromTemplate({
    sheets,
    templateTitle: txTemplateSheetName,
    targetTitle: txSheetName,
  });

  const txRange = `'${txSheetName}'!A1:ZZ300`;
  const txRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: txRange,
  });
  const values = txRes.data.values || [];
  const { labelCell, valueCell } = getCustomerPlacement(values);

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
    {
      range: `'${txSheetName}'!${labelCell}:${valueCell}`,
      values: [['Customer Name', customerName || '']],
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

async function updateInventoryInSheet({ type, date, challan, customerName, items }) {
  const sheets = getSheetsClient();
  const stockSheetName = getMonthlyStockSheetName(date);
  await ensureSheetFromTemplate({
    sheets,
    templateTitle: STOCK_TEMPLATE_SHEET_NAME,
    targetTitle: stockSheetName,
  });
  const range = `'${stockSheetName}'!B4:F200`;

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
      range: `'${stockSheetName}'!D${target.rowIndex}:F${target.rowIndex}`,
      values: [[asUnit(nextPurchases), asUnit(nextSales), asUnit(nextBalance)]],
    });
  });

  await writeTransactionSheet({ sheets, type, date, challan, customerName, mergedQtyByProduct });

  const customerAreaRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${stockSheetName}'!A1:ZZ220`,
  });
  const customerAreaValues = customerAreaRes.data.values || [];
  const { labelCell, valueCell } = getCustomerPlacement(customerAreaValues);

  updates.push({
    range: `'${stockSheetName}'!${labelCell}:${valueCell}`,
    values: [['Customer Name', customerName || '']],
  });

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
    customerName || '',
    item.product,
    parseInt(item.qty, 10) || 0,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${LOG_SHEET_NAME}'!A:G`,
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
