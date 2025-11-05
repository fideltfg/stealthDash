const express = require('express');
const cors = require('cors');
const ping = require('ping');
const ModbusRTU = require('modbus-serial');
const snmp = require('net-snmp');

const app = express();
const PORT = process.env.PING_SERVER_PORT || 3001;

// Enable CORS for all origins (adjust in production)
app.use(cors());
app.use(express.json());

// Modbus TCP Read Endpoint
app.get('/modbus/read', async (req, res) => {
  const { host, port = 502, address, count = 1, type = 'holding', unitId = 1 } = req.query;
  
  if (!host || address === undefined) {
    return res.status(400).json({ 
      error: 'host and address parameters are required',
      success: false 
    });
  }
  
  const client = new ModbusRTU();
  
  try {
    // Set connection timeout
    await Promise.race([
      client.connectTCP(host, { port: parseInt(port) }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 3000)
      )
    ]);
    
    client.setID(parseInt(unitId));
    client.setTimeout(5000);
    
    const addr = parseInt(address);
    const cnt = parseInt(count);
    let data;
    
    switch(type) {
      case 'coil':
        data = await client.readCoils(addr, cnt);
        break;
      case 'discrete':
        data = await client.readDiscreteInputs(addr, cnt);
        break;
      case 'input':
        data = await client.readInputRegisters(addr, cnt);
        break;
      case 'holding':
      default:
        data = await client.readHoldingRegisters(addr, cnt);
        break;
    }
    
    await client.close();
    
    res.json({
      success: true,
      host,
      port: parseInt(port),
      unitId: parseInt(unitId),
      address: addr,
      count: cnt,
      type,
      data: data.data,
      timestamp: Date.now()
    });
    
  } catch (error) {
    try { await client.close(); } catch (e) {}
    console.error('Modbus error:', error);
    res.status(500).json({
      error: error.message,
      success: false,
      timestamp: Date.now()
    });
  }
});

// SNMP Read Endpoint
app.get('/snmp/get', (req, res) => {
  const { host, community = 'public', oids } = req.query;
  
  if (!host || !oids) {
    return res.status(400).json({ 
      error: 'host and oids parameters are required',
      success: false 
    });
  }
  
  try {
    // Parse OIDs (can be comma-separated)
    const oidArray = oids.split(',').map(oid => oid.trim());
    
    console.log(`SNMP GET request: host=${host}, community=${community}, oids=${oidArray.join(',')}`);
    
    // Create SNMP session with default options (they work better!)
    const session = snmp.createSession(host, community);
    
    console.log('SNMP session created, sending request...');
    
    let sessionClosed = false;
    
    // Handle session errors
    session.on('error', (err) => {
      console.error('SNMP session error:', err.message);
    });
    
    // Set response timeout
    const timeoutHandle = setTimeout(() => {
      console.log('SNMP request timed out (10s timeout)');
      if (!sessionClosed) {
        sessionClosed = true;
        session.close();
      }
      if (!res.headersSent) {
        res.status(500).json({
          error: 'SNMP request timeout',
          success: false,
          timestamp: Date.now()
        });
      }
    }, 10000);
    
    // Perform SNMP GET
    session.get(oidArray, (error, varbinds) => {
      console.log('SNMP callback received:', error ? `error: ${error.message}` : `success, ${varbinds.length} varbinds`);
      clearTimeout(timeoutHandle);
      if (!sessionClosed) {
        sessionClosed = true;
        session.close();
      }
      
      if (res.headersSent) return;
      
      if (error) {
        console.error('SNMP error:', error);
        return res.status(500).json({
          error: error.message,
          success: false,
          timestamp: Date.now()
        });
      }
      
      // Check for errors in varbinds
      const hasError = varbinds.some(vb => snmp.isVarbindError(vb));
      if (hasError) {
        return res.status(500).json({
          error: 'SNMP varbind error',
          success: false,
          timestamp: Date.now()
        });
      }
      
      // Format response
      const data = varbinds.map(vb => {
        let value = vb.value;
        // Convert Buffer to string for SNMP OctetString types
        if (Buffer.isBuffer(value)) {
          value = value.toString('utf8');
        }
        return {
          oid: vb.oid,
          type: vb.type,
          value: value
        };
      });
      
      res.json({
        success: true,
        host,
        community,
        data,
        timestamp: Date.now()
      });
    });
    
  } catch (error) {
    console.error('SNMP error:', error);
    res.status(500).json({
      error: error.message,
      success: false,
      timestamp: Date.now()
    });
  }
});

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

// Home Assistant proxy endpoints
app.post('/home-assistant/states', async (req, res) => {
  const { url, token } = req.body;
  
  if (!url || !token) {
    return res.status(400).json({ 
      error: 'url and token are required',
      success: false 
    });
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

app.post('/home-assistant/service', async (req, res) => {
  const { url, token, domain, service, entity_id } = req.body;
  
  if (!url || !token || !domain || !service || !entity_id) {
    return res.status(400).json({ 
      error: 'url, token, domain, service, and entity_id are required',
      success: false 
    });
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${url}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ entity_id })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

app.listen(PORT, () => {
  console.log(`Ping server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Ping endpoint: http://localhost:${PORT}/ping/<target>`);
});
