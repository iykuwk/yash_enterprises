// GET /api/products
// Returns the full product list for autocomplete
const { PRODUCTS } = require('./_data');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();
  res.json({ products: PRODUCTS });
};
