# Yash Enterprises - Inventory Entry System

Web app for purchases/sales entry that writes stock updates directly to Google Sheets.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill credentials.
3. Share your Google Sheet with the service-account email as **Editor**.
4. Start dev server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## Required environment variables

- `GOOGLE_SHEET_ID` - Spreadsheet ID (already set to your provided sheet by default)
- `GOOGLE_STOCK_SHEET_NAME` - Stock tab name (default: `JUBILANT STOCK APRIL 26`)
- `GOOGLE_LOG_SHEET_NAME` - Log tab name used for entry history (default: `Entry Log`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Google Cloud service account email
- `GOOGLE_PRIVATE_KEY` - Private key for the service account (keep `\n` escaped)

## Project structure

- `server.js` - Express server, static hosting, API route wiring
- `public/index.html` - Complete frontend UI + client logic
- `api/products.js` - Returns product list for autocomplete
- `api/challan.js` - Returns next challan number
- `api/entry.js` - Validates entry and writes to Google Sheets
- `api/googleSheets.js` - Google Sheets auth + stock update logic
- `api/_data.js` - Master product list and challan counter

## How sheet update works

- Products are matched against column `B` in `JUBILANT STOCK APRIL 26`.
- For each product entry:
  - Purchases update column `D`
  - Sales update column `E`
  - Balance in column `F` is recalculated as `Opening + Purchases - Sales`
- Every submitted item is also appended to the `Entry Log` tab.
