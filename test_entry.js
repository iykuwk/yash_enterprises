const fetch = require('node-fetch');

async function testEntry() {
  const response = await fetch('http://localhost:3001/api/entry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'sales',
      date: '2024-04-18',
      challan: 1,
      customerName: 'Test Customer',
      items: [
        { product: 'JUBIFIX', qty: 10 },
        { product: 'OTHER PRODUCT', qty: 5 },
      ],
    }),
  });
  const result = await response.json();
  console.log(result);
}

testEntry();