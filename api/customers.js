const { loadCustomersFromFile } = require('./googleSheets');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const customers = await loadCustomersFromFile();
    return res.json({ customers });
  } catch (error) {
    console.error('Customer list load failed:', error);
    return res.status(500).json({ error: 'Failed to load customer list' });
  }
};
