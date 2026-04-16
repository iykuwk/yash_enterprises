// POST /api/entry
// Body: { type: "purchases"|"sales", date, challan, customerName, items: [{product, qty}] }
// Updates Google Sheet directly.
const { updateInventoryInSheet } = require('./googleSheets');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { type, date, challan, customerName, items, editedAt, entryMode } = req.body;
  const needsCustomer = type === 'sales';
  if (!type || !date || !challan || !Array.isArray(items) || items.length === 0 || (needsCustomer && !customerName)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await updateInventoryInSheet({
      type,
      date,
      challan,
      customerName: customerName || '',
      items,
      editedAt: editedAt || '',
      entryMode: entryMode || 'new',
    });
    res.json({
      success: true,
      message: 'Entry saved to Google Sheet.',
      ...result,
    });

  } catch (err) {
    console.error('Entry API failed:', err);
    res.status(500).json({ error: err.message });
  }
};
