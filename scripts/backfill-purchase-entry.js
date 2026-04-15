require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

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
  const product = 'JUBIFIX ACRO BLACK 450 GMS';
  const qty = 80;
  const date = '2026-04-15';
  const challan = '5';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Purchases'!A1:ZZ300",
  });
  const values = res.data.values || [];
  const row3 = values[2] || [];
  const row4 = values[3] || [];

  let col = -1;
  for (let i = 0; i < row3.length; i += 1) {
    if (String(row3[i]).trim() === challan) {
      col = i + 1;
      break;
    }
  }
  if (col === -1) col = Math.max(row4.length, 2) + 1;

  let productRow = -1;
  for (let r = 4; r < values.length; r += 1) {
    if ((values[r][1] || '').trim().toUpperCase() === product) {
      productRow = r + 1;
      break;
    }
  }
  if (productRow === -1) throw new Error('Product row not found in Purchases sheet');

  const colLetter = toColumnLetter(col);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `'Purchases'!${colLetter}2:${colLetter}4`, values: [[date], [challan], ['Qty']] },
        { range: `'Purchases'!${colLetter}${productRow}`, values: [[qty]] },
      ],
    },
  });

  console.log(`Inserted Purchases entry at column ${colLetter}, row ${productRow}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
