# Yash Enterprises — Inventory Entry System

A minimal web app for entry of Purchases & Sales challan data into Excel.

## Setup & Deploy (5 minutes)

### 1. Install dependencies
```
npm install
```

### 2. Add your Excel file
Place your `inventory.xlsx` file at:
```
api/template/inventory.xlsx
```
(Already included if you're using the downloaded zip.)

### 3. Deploy to Vercel
```bash
npm install -g vercel   # if not installed
vercel                  # follow prompts
```

That's it. Vercel auto-detects the `api/` serverless functions.

---

## Local development
```bash
npm install -g vercel
vercel dev
# Open http://localhost:3000
```

---

## How it works

| Step | What happens |
|------|--------------|
| 1 | Choose Purchases or Sales, pick a date |
| 2 | Auto-generated challan number assigned |
| 3 | Search & add products with quantities (keyboard friendly) |
| 4 | Review receipt, click Confirm |
| 5 | Excel file updated + downloaded to your device |

---

## Notes
- Challan counter persists in `/tmp` on the server (resets on Vercel cold starts).  
  For permanent persistence, replace `_data.js` with Vercel KV or a simple DB.
- The Excel template (`api/template/inventory.xlsx`) is read-only; updates are written to `/tmp/inventory_out.xlsx` and served as a download.
- Product list is hardcoded from your stock sheet for fast search. To update products, edit `PRODUCTS` in `api/_data.js`.
