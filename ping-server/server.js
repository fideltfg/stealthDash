const express = require('express');
const cors = require('cors');
const ping = require('ping');

const app = express();
const PORT = process.env.PING_SERVER_PORT || 3001;

// Enable CORS for all origins (adjust in production)
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ping-server' });
});

// Ping endpoint
app.get('/ping/:target', async (req, res) => {
  const { target } = req.params;
  const timeout = parseInt(req.query.timeout) || 5; // seconds
  
  try {
    // Validate target (basic validation)
    if (!target || target.length === 0) {
      return res.status(400).json({ 
        error: 'Target is required',
        success: false 
      });
    }
    
    // Perform ping
    const startTime = Date.now();
    const result = await ping.promise.probe(target, {
      timeout: timeout,
      min_reply: 1
    });
    const responseTime = Date.now() - startTime;
    
    res.json({
      target: target,
      success: result.alive,
      responseTime: result.alive ? parseFloat(result.time) : null,
      totalTime: responseTime,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Ping error:', error);
    res.status(500).json({
      error: error.message,
      success: false,
      target: target,
      timestamp: Date.now()
    });
  }
});

// POST endpoint for batch pings (optional, for future use)
app.post('/ping-batch', async (req, res) => {
  const { targets, timeout = 5 } = req.body;
  
  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: 'Targets array is required' });
  }
  
  try {
    const results = await Promise.all(
      targets.map(async (target) => {
        try {
          const result = await ping.promise.probe(target, {
            timeout: timeout,
            min_reply: 1
          });
          
          return {
            target: target,
            success: result.alive,
            responseTime: result.alive ? parseFloat(result.time) : null,
            timestamp: Date.now()
          };
        } catch (error) {
          return {
            target: target,
            success: false,
            error: error.message,
            timestamp: Date.now()
          };
        }
      })
    );
    
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Ping server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Ping endpoint: http://localhost:${PORT}/ping/<target>`);
});
