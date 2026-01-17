const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so your Vercel app can call this API
app.use(cors());
app.use(express.json());

// In-memory storage for tokens
let tokens = [];
let wsConnection = null;
let lastUpdate = Date.now();

// Connect to PumpFun WebSocket
function connectToPumpFun() {
  console.log('🔌 Connecting to PumpFun WebSocket...');
  
  wsConnection = new WebSocket('wss://pumpportal.fun/api/data');
  
  wsConnection.on('open', () => {
    console.log('✅ Connected to PumpFun WebSocket');
    
    // Subscribe to new token events
    const subscribeMessage = {
      method: "subscribeNewToken"
    };
    
    wsConnection.send(JSON.stringify(subscribeMessage));
    console.log('📡 Subscribed to new token events');
  });
  
  wsConnection.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Check if it's a new token event
      if (message.mint && message.name && message.symbol) {
        console.log('🆕 New token:', message.symbol, '-', message.name);
        
        // Add token to our list
        const tokenData = {
          mint: message.mint,
          name: message.name,
          symbol: message.symbol,
          uri: message.uri || '',
          description: message.description || '',
          image: message.image || '',
          marketCap: message.marketCap || 0,
          creator: message.creator || message.traderPublicKey || 'unknown',
          createdAt: Date.now(),
          twitter: message.twitter || '',
          telegram: message.telegram || '',
          website: message.website || '',
          initialBuy: message.initialBuy || 0,
        };
        
        // Add to beginning of array
        tokens.unshift(tokenData);
        
        // Keep only last 200 tokens
        if (tokens.length > 200) {
          tokens = tokens.slice(0, 200);
        }
        
        lastUpdate = Date.now();
        
        console.log('💾 Stored token. Total:', tokens.length);
      }
      
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  });
  
  wsConnection.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
  
  wsConnection.on('close', () => {
    console.log('🔌 WebSocket disconnected. Reconnecting in 5 seconds...');
    wsConnection = null;
    
    // Reconnect after 5 seconds
    setTimeout(() => {
      connectToPumpFun();
    }, 5000);
  });
}

// Start WebSocket connection
connectToPumpFun();

// API endpoint to get tokens
app.get('/api/tokens', (req, res) => {
  console.log('📡 API request received');
  
  // Get query parameters
  const limit = parseInt(req.query.limit) || 50;
  const minMarketCap = parseInt(req.query.minMarketCap) || 0;
  const minAge = parseInt(req.query.minAge) || 0; // in milliseconds
  
  const now = Date.now();
  
  // Filter tokens
  let filteredTokens = tokens.filter(token => {
    const meetsMarketCap = token.marketCap >= minMarketCap;
    const meetsAge = (now - token.createdAt) >= minAge;
    return meetsMarketCap && meetsAge;
  });
  
  // Limit results
  filteredTokens = filteredTokens.slice(0, limit);
  
  console.log(`📤 Returning ${filteredTokens.length} tokens`);
  
  res.json({
    success: true,
    count: filteredTokens.length,
    totalStored: tokens.length,
    lastUpdate: lastUpdate,
    tokens: filteredTokens,
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tokensStored: tokens.length,
    wsConnected: wsConnection !== null && wsConnection.readyState === WebSocket.OPEN,
    lastUpdate: lastUpdate,
    uptime: process.uptime(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'PumpFun Proxy Backend',
    endpoints: {
      '/api/tokens': 'Get stored tokens (supports ?limit=X&minMarketCap=X&minAge=X)',
      '/health': 'Health check',
    },
    tokensStored: tokens.length,
    wsConnected: wsConnection !== null && wsConnection.readyState === WebSocket.OPEN,
  });
});

// Start server - IMPORTANT: Bind to 0.0.0.0 for Railway
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Server accessible on 0.0.0.0:${PORT}`);
  console.log(`📡 Listening for PumpFun tokens...`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, closing connections...');
  if (wsConnection) {
    wsConnection.close();
  }
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});
