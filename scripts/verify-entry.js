require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

function getCreds() {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || path.join(process.cwd(), 'service-account.json');
    const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    email = parsed.client_email;
    key = parsed.private_key;
  }
  return { email, key: (key || '').replace(/\\n/g, '\n') };
}

async function main() {
  const { email, key } = getCreds();
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const product = (process.argv[2] || 'JUBIFIX ACRO BLACK 450 GMS').toUpperCase();
  const challan = process.argv[3] || '5';

  const purchasesRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Purchases'!A1:ZZ120",
  });
  const purchasesValues = purchasesRes.data.values || [];
  const row3 = purchasesValues[2] || [];
  let challanCol = -1;
  for (let i = 0; i < row3.length; i += 1) {
    if (String(row3[i]).trim() === challan) {
      challanCol = i;
      break;
    }
  }

  let productRow = -1;
  for (let r = 4; r < purchasesValues.length; r += 1) {
    if ((purchasesValues[r][1] || '').trim().toUpperCase() === product) {
      productRow = r;
      break;
    }
  }

  const purchaseCellValue =
    challanCol >= 0 && productRow >= 0 ? purchasesValues[productRow][challanCol] || '' : '';

  const stockRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'JUBILANT STOCK APRIL 26'!B4:F120",
  });
  const stockValues = stockRes.data.values || [];
  let stockRow = null;
  for (const row of stockValues) {
    if ((row[0] || '').trim().toUpperCase() === product) {
      stockRow = {
        opening: row[1] || '',
        purchases: row[2] || '',
        sales: row[3] || '',
        balance: row[4] || '',
      };
      break;
    }
  }

  const entryLogRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Entry Log'!A:F",
  });
  const entryLogValues = entryLogRes.data.values || [];
  const lastEntry = entryLogValues[entryLogValues.length - 1] || [];

  console.log(
    JSON.stringify(
      {
        challanColIndexZeroBased: challanCol,
        purchasesTabValueForProductAtChallan5: purchaseCellValue,
        stockRow,
        lastEntryLogRow: lastEntry,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
