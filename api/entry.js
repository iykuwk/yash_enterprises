const { updateInventoryInSheet } = require('./googleSheets');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { type, date, challan, customerName, items, editedAt, entryMode } = req.body || {};

  if (!type || !date || !challan || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: type, date, challan, items' });
  }
  if (type === 'sales' && !String(customerName || '').trim()) {
    return res.status(400).json({ error: 'Customer name is required for sales entries' });
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

    return res.json({
      success: true,
      message: 'Entry saved to Google Sheet.',
      ...result,
    });
  } catch (err) {
    console.error('[POST /api/entry] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};