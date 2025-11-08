require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// === API ROUTES (Your existing lib folder) ===
app.use('/api/auth', require('./server/lib/auth'));
app.use('/api/artist', require('./server/lib/artist'));
app.use('/api/admin', require('./server/lib/admin'));
app.use('/api/printify', require('./server/lib/printify-services'));
app.use('/api/shopify', require('./server/lib/shopify-webhooks'));
app.use('/api/stripe', require('./server/lib/stripe-connect'));
app.use('/api/royalty', require('./server/lib/royalty-calculations'));

// === TEST ROUTE (Confirm API is live) ===
app.get('/api/test', (req, res) => {
  res.json({ 
    message: "247 Print Network API LIVE", 
    time: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// === SERVE REACT BUILD (Production) ===
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`247 PRINT NETWORK LIVE on port ${PORT}`);
  console.log(`Visit: https://247portal.replit.app`);
});