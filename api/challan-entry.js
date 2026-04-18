const { getChallanEntry, updateInventoryInSheet } = require('./googleSheets');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { type, challan } = req.query || {};
      if (!type || !challan) {
        return res.status(400).json({ error: 'type and challan query params are required' });
      }
      const entry = await getChallanEntry({ type, challan });
      if (!entry) return res.status(404).json({ error: 'Challan not found in Entry Log' });
      return res.json({ entry });
    }

    if (req.method === 'POST') {
      const { type, date, challan, customerName, items } = req.body || {};
      if (!type || !date || !challan || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (type === 'sales' && !String(customerName || '').trim()) {
        return res.status(400).json({ error: 'Customer name is required for sales' });
      }

      const editedAt = new Date().toISOString();
      const result = await updateInventoryInSheet({
        type,
        date,
        challan,
        customerName: customerName || '',
        items,
        editedAt,
        entryMode: 'edit',
      });

      return res.json({ success: true, editedAt, ...result });
    }

    return res.status(405).end();
  } catch (error) {
    console.error('[challan-entry] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};