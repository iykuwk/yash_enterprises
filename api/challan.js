// GET /api/challan
// Returns the next auto-incremented challan number
const { getNextChallan } = require('./_data');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();
  res.json({ challan: getNextChallan() });
};
