const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/products', require('./api/products'));
app.get('/api/challan', require('./api/challan'));
app.post('/api/entry', require('./api/entry'));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startServer(currentPort) {
  const server = app.listen(currentPort, () => {
    console.log(`Server running at http://localhost:${currentPort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${currentPort} is in use. Trying ${currentPort + 1}...`);
      startServer(currentPort + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}

startServer(port);
