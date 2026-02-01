const express = require('express');
const router = express.Router();
const ping = require('ping');
const ModbusRTU = require('modbus-serial');
const snmp = require('net-snmp');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../auth');
const { decryptCredentials } = require('../crypto-utils');
const { widgetMetadata } = require('../src/widgetMetadata');

// Session caches to avoid rate limiting
const piholeSessionCache = new Map();
const unifiSessionCache = new Map();

// ==================== WIDGET METADATA ROUTE ====================

/**
 * GET /widgets/metadata
 * Returns metadata for all available widget types
 * This allows the client to display the widget picker without loading all widget code
 */
router.get('/widgets/metadata', (req, res) => {
  res.json({
    success: true,
    widgets: widgetMetadata,
    timestamp: Date.now()
  });
});

// ==================== CREDENTIALS HELPER ====================

/**
 * Helper function to fetch and decrypt credentials
 * @param {number} credentialId - The credential ID
 * @param {number} userId - The user ID (for security check)
 * @returns {Promise<object>} - Decrypted credential data
 */
async function getCredentials(credentialId, userId) {
  const result = await db.query(
    'SELECT credential_data FROM credentials WHERE id = $1 AND user_id = $2',
    [credentialId, userId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Credential not found or access denied');
  }
  
  return decryptCredentials(result.rows[0].credential_data);
}

// ==================== MODBUS ROUTES ====================

// Modbus TCP Read Endpoint
router.get('/modbus/read', async (req, res) => {
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

// ==================== SNMP ROUTES ====================

// SNMP Read Endpoint
router.get('/snmp/get', async (req, res) => {
  const { host, community = 'public', credentialId, oids } = req.query;
  
  if (!host || !oids) {
    return res.status(400).json({ 
      error: 'host and oids parameters are required',
      success: false 
    });
  }
  
  let snmpCommunity = community;
  
  // If credentialId is provided, fetch credentials from database
  if (credentialId) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required when using credentialId' });
    }
    
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      const credentials = await getCredentials(credentialId, decoded.userId);
      
      if (!credentials.community) {
        return res.status(400).json({ error: 'Credential does not contain community field' });
      }
      
      snmpCommunity = credentials.community;
    } catch (err) {
      return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
    }
  }
  
  try {
    // Parse OIDs (can be comma-separated)
    const oidArray = oids.split(',').map(oid => oid.trim());
    
    console.log(`SNMP GET request: host=${host}, community=${snmpCommunity}, oids=${oidArray.join(',')}`);
    
    // Create SNMP session with default options (they work better!)
    const session = snmp.createSession(host, snmpCommunity);
    
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

// ==================== PING ROUTES ====================

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ping-server' });
});

// Ping endpoint
router.get('/ping/:target', async (req, res) => {
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

// POST endpoint for batch pings
router.post('/ping-batch', async (req, res) => {
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

// ==================== HOME ASSISTANT ROUTES ====================

// Home Assistant proxy endpoints
router.post('/home-assistant/states', async (req, res) => {
  const { url, token, credentialId } = req.body;
  
  if (!url) {
    return res.status(400).json({ 
      error: 'url is required',
      success: false 
    });
  }
  
  let haToken = token;
  
  // If credentialId is provided, fetch credentials from database
  if (credentialId) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required when using credentialId' });
    }
    
    const authToken = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(authToken, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      const credentials = await getCredentials(credentialId, decoded.userId);
      
      if (!credentials.token) {
        return res.status(400).json({ error: 'Credential does not contain token field' });
      }
      
      haToken = credentials.token;
    } catch (err) {
      return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
    }
  }
  
  if (!haToken) {
    return res.status(400).json({ 
      error: 'token or credentialId is required',
      success: false 
    });
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haToken}`,
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

router.post('/home-assistant/service', async (req, res) => {
  const { url, token, credentialId, domain, service, entity_id } = req.body;
  
  if (!url || !domain || !service || !entity_id) {
    return res.status(400).json({ 
      error: 'url, domain, service, and entity_id are required',
      success: false 
    });
  }
  
  let haToken = token;
  
  // If credentialId is provided, fetch credentials from database
  if (credentialId) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required when using credentialId' });
    }
    
    const authToken = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(authToken, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      const credentials = await getCredentials(credentialId, decoded.userId);
      
      if (!credentials.token) {
        return res.status(400).json({ error: 'Credential does not contain token field' });
      }
      
      haToken = credentials.token;
    } catch (err) {
      return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
    }
  }
  
  if (!haToken) {
    return res.status(400).json({ 
      error: 'token or credentialId is required',
      success: false 
    });
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${url}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${haToken}`,
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

// ==================== PROXY ROUTES ====================

// CORS proxy endpoint for fetching external XML/data
router.get('/proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    console.log(`Proxying request to: ${targetUrl}`);
    
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');
    
    const parsedUrl = urlModule.parse(targetUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    protocol.get(targetUrl, (proxyRes) => {
      // Forward the content-type header
      res.set('Content-Type', proxyRes.headers['content-type'] || 'text/xml');
      res.set('Access-Control-Allow-Origin', '*');
      
      // Pipe the response
      proxyRes.pipe(res);
    }).on('error', (error) => {
      console.error('Proxy error:', error);
      res.status(500).send(`Proxy error: ${error.message}`);
    });
    
  } catch (error) {
    console.error('Proxy endpoint error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// ==================== PI-HOLE ROUTES ====================

// Pi-hole API proxy endpoint
router.get('/api/pihole', async (req, res) => {
  try {
    const { host, password, credentialId } = req.query;
    
    if (!host) {
      return res.status(400).json({ error: 'Missing host parameter' });
    }
    
    let piholePassword = password;
    
    // If credentialId is provided, fetch credentials from database
    if (credentialId) {
      // Extract userId from auth token if available
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required when using credentialId' });
      }
      
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
        const credentials = await getCredentials(credentialId, decoded.userId);
        
        if (!credentials.password) {
          return res.status(400).json({ error: 'Credential does not contain password field' });
        }
        
        piholePassword = credentials.password;
      } catch (err) {
        return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
      }
    }
    
    if (!piholePassword) {
      return res.status(400).json({ error: 'Missing password parameter or credentialId. Pi-hole v6+ requires authentication.' });
    }

    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    
    // Create cache key from host+password
    const cacheKey = `${host}:${piholePassword}`;
    
    let sid;
    const cachedSession = piholeSessionCache.get(cacheKey);
    
    // Check if we have a valid cached session
    if (cachedSession && cachedSession.expires > Date.now()) {
      console.log('Using cached Pi-hole session');
      sid = cachedSession.sid;
    } else {
      // Step 1: Authenticate and get session ID
      const authUrl = `${host}/api/auth`;
      console.log(`Authenticating with Pi-hole at: ${authUrl}`);
      
      const authResponse = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ password: piholePassword }),
        timeout: 5000
      });
      
      if (!authResponse.ok) {
        console.error(`Pi-hole auth error: ${authResponse.status} ${authResponse.statusText}`);
        return res.status(authResponse.status).json({ 
          error: `Pi-hole authentication failed: ${authResponse.status}` 
        });
      }
      
      const authData = await authResponse.json();
      
      if (!authData.session || !authData.session.valid) {
        console.error('Pi-hole authentication failed:', authData.session?.message || 'Unknown error');
        return res.status(401).json({ 
          error: 'Authentication failed',
          details: authData.session?.message || 'Invalid credentials'
        });
      }
      
      sid = authData.session.sid;
      
      // Cache the session for 5 minutes (Pi-hole sessions typically last longer)
      piholeSessionCache.set(cacheKey, {
        sid: sid,
        expires: Date.now() + (5 * 60 * 1000) // 5 minutes
      });
      
      console.log('Authentication successful, session cached');
    }
    
    // Step 2: Fetch stats with the session ID
    const statsUrl = `${host}/api/stats/summary?sid=${encodeURIComponent(sid)}`;
    
    const statsResponse = await fetch(statsUrl, { 
      headers: {
        'Accept': 'application/json'
      },
      timeout: 5000 
    });
    
    if (!statsResponse.ok) {
      console.error(`Pi-hole API error: ${statsResponse.status} ${statsResponse.statusText}`);
      const errorText = await statsResponse.text();
      console.error(`Response body: ${errorText}`);
      return res.status(statsResponse.status).json({ 
        error: `Pi-hole API returned ${statsResponse.status}: ${statsResponse.statusText}`,
        details: errorText
      });
    }
    
    const data = await statsResponse.json();
    
    console.log('Pi-hole stats data:', JSON.stringify(data).substring(0, 500));
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    
    res.json(data);
    
  } catch (error) {
    console.error('Pi-hole proxy error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch Pi-hole data. Check if Pi-hole is accessible and credentials are correct.'
    });
  }
});

// ==================== UNIFI ROUTES ====================

// UniFi Controller API proxy endpoint
router.get('/api/unifi/stats', async (req, res) => {
  try {
    const { host, username, password, credentialId, site = 'default' } = req.query;
    
    if (!host) {
      return res.status(400).json({ error: 'Missing host parameter' });
    }
    
    let unifiUsername = username;
    let unifiPassword = password;
    
    // If credentialId is provided, fetch credentials from database
    if (credentialId) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required when using credentialId' });
      }
      
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
        const credentials = await getCredentials(credentialId, decoded.userId);
        
        if (!credentials.username || !credentials.password) {
          return res.status(400).json({ error: 'Credential does not contain username and password fields' });
        }
        
        unifiUsername = credentials.username;
        unifiPassword = credentials.password;
      } catch (err) {
        return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
      }
    }
    
    if (!unifiUsername || !unifiPassword) {
      return res.status(400).json({ error: 'Missing username/password or credentialId parameter' });
    }

    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    const https = require('https');
    
    // Create an HTTPS agent that ignores self-signed certificates
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    // Create cache key from host+username+password
    const cacheKey = `${host}:${unifiUsername}:${unifiPassword}`;
    
    let cookies;
    const cachedSession = unifiSessionCache.get(cacheKey);
    
    // Check if we have a valid cached session
    if (cachedSession && cachedSession.expires > Date.now()) {
      console.log('Using cached UniFi session');
      cookies = cachedSession.cookies;
    } else {
      // Step 1: Authenticate and get session cookies
      const loginUrl = `${host}/api/login`;
      console.log(`Authenticating with UniFi Controller at: ${loginUrl}`);
      
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          username: unifiUsername,
          password: unifiPassword,
          remember: false
        }),
        agent: httpsAgent,
        timeout: 10000
      });
      
      if (!loginResponse.ok) {
        console.error(`UniFi login error: ${loginResponse.status} ${loginResponse.statusText}`);
        const errorText = await loginResponse.text();
        return res.status(loginResponse.status).json({ 
          error: `UniFi authentication failed: ${loginResponse.status}`,
          details: errorText
        });
      }
      
      // Extract cookies from response
      const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
      if (!setCookieHeaders || setCookieHeaders.length === 0) {
        return res.status(401).json({ 
          error: 'Authentication failed',
          details: 'No session cookies received from UniFi Controller'
        });
      }
      
      // Join all cookies
      cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
      
      // Cache the session for 30 minutes
      unifiSessionCache.set(cacheKey, {
        cookies: cookies,
        expires: Date.now() + (30 * 60 * 1000) // 30 minutes
      });
      
      console.log('UniFi authentication successful, session cached');
    }
    
    // Step 2: Fetch multiple endpoints in parallel for comprehensive data
    const [healthResponse, devicesResponse, clientsResponse, alarmsResponse] = await Promise.all([
      // Health/stats
      fetch(`${host}/api/s/${site}/stat/health`, { 
        headers: { 'Accept': 'application/json', 'Cookie': cookies },
        agent: httpsAgent,
        timeout: 10000 
      }),
      // Device list (APs, switches, gateways)
      fetch(`${host}/api/s/${site}/stat/device`, { 
        headers: { 'Accept': 'application/json', 'Cookie': cookies },
        agent: httpsAgent,
        timeout: 10000 
      }).catch(err => {
        console.log('Device fetch failed (non-critical):', err.message);
        return null;
      }),
      // Active clients
      fetch(`${host}/api/s/${site}/stat/sta`, { 
        headers: { 'Accept': 'application/json', 'Cookie': cookies },
        agent: httpsAgent,
        timeout: 10000 
      }).catch(err => {
        console.log('Clients fetch failed (non-critical):', err.message);
        return null;
      }),
      // Recent alarms
      fetch(`${host}/api/s/${site}/stat/alarm`, { 
        headers: { 'Accept': 'application/json', 'Cookie': cookies },
        agent: httpsAgent,
        timeout: 10000 
      }).catch(err => {
        console.log('Alarms fetch failed (non-critical):', err.message);
        return null;
      })
    ]);
    
    if (!healthResponse.ok) {
      console.error(`UniFi API error: ${healthResponse.status} ${healthResponse.statusText}`);
      const errorText = await healthResponse.text();
      console.error(`Response body: ${errorText}`);
      
      // Clear cache on auth errors
      if (healthResponse.status === 401) {
        unifiSessionCache.delete(cacheKey);
      }
      
      return res.status(healthResponse.status).json({ 
        error: `UniFi API returned ${healthResponse.status}: ${healthResponse.statusText}`,
        details: errorText
      });
    }
    
    const healthData = await healthResponse.json();
    const devicesData = devicesResponse && devicesResponse.ok ? await devicesResponse.json() : { data: [] };
    const clientsData = clientsResponse && clientsResponse.ok ? await clientsResponse.json() : { data: [] };
    const alarmsData = alarmsResponse && alarmsResponse.ok ? await alarmsResponse.json() : { data: [] };
    
    // Aggregate stats from all subsystems
    const stats = {
      site_name: site,
      num_user: 0,
      num_guest: 0,
      num_iot: 0,
      gateways: 0,
      switches: 0,
      access_points: 0,
      devices: [],
      clients: [],
      alarms: [],
      traffic: {
        tx_bytes: 0,
        rx_bytes: 0,
        tx_packets: 0,
        rx_packets: 0
      }
    };
    
    // Process health data
    if (healthData.data && Array.isArray(healthData.data)) {
      healthData.data.forEach(item => {
        if (item.subsystem === 'wlan') {
          stats.num_user = item.num_user || 0;
          stats.num_guest = item.num_guest || 0;
          stats.num_iot = item.num_iot || 0;
          stats.access_points = item.num_ap || 0;
          if (item.tx_bytes) stats.traffic.tx_bytes += item.tx_bytes;
          if (item.rx_bytes) stats.traffic.rx_bytes += item.rx_bytes;
        } else if (item.subsystem === 'wan') {
          stats.wan_ip = item.wan_ip;
          stats.uptime = item.uptime;
          stats.wan_uptime = item.uptime;
          stats.latency = item.latency;
          stats.speedtest_ping = item.speedtest_ping;
          stats.xput_up = item.xput_up;
          stats.xput_down = item.xput_down;
        } else if (item.subsystem === 'www') {
          stats.gateways = (item.num_gw || 0);
          stats.gateway_status = item.status;
        } else if (item.subsystem === 'sw') {
          stats.switches = (item.num_sw || 0);
        } else if (item.subsystem === 'lan') {
          stats.num_lan = item.num_user || 0;
        }
      });
    }
    
    // Process devices data (detailed device info)
    if (devicesData.data && Array.isArray(devicesData.data)) {
      devicesData.data.forEach(device => {
        stats.devices.push({
          name: device.name || device.hostname || 'Unknown',
          model: device.model,
          type: device.type,
          ip: device.ip,
          mac: device.mac,
          state: device.state,
          adopted: device.adopted,
          uptime: device.uptime,
          version: device.version,
          upgradable: device.upgradable,
          num_sta: device.num_sta || 0,
          user_num_sta: device['user-num_sta'] || 0,
          guest_num_sta: device['guest-num_sta'] || 0,
          bytes: device.bytes || 0,
          tx_bytes: device['tx_bytes'] || 0,
          rx_bytes: device['rx_bytes'] || 0,
          satisfaction: device.satisfaction,
          cpu: device['system-stats']?.cpu,
          mem: device['system-stats']?.mem,
          uplink: device.uplink
        });
      });
    }
    
    // Process clients data (active connections)
    if (clientsData.data && Array.isArray(clientsData.data)) {
      clientsData.data.forEach(client => {
        stats.clients.push({
          name: client.hostname || client.name || 'Unknown',
          mac: client.mac,
          ip: client.ip,
          network: client.network,
          essid: client.essid,
          is_guest: client.is_guest,
          is_wired: client.is_wired,
          signal: client.signal,
          rssi: client.rssi,
          tx_bytes: client.tx_bytes || 0,
          rx_bytes: client.rx_bytes || 0,
          tx_rate: client.tx_rate,
          rx_rate: client.rx_rate,
          uptime: client.uptime,
          last_seen: client.last_seen,
          ap_mac: client.ap_mac,
          channel: client.channel,
          radio: client.radio
        });
      });
    }
    
    // Process alarms/events
    if (alarmsData.data && Array.isArray(alarmsData.data)) {
      stats.alarms = alarmsData.data.slice(0, 10).map(alarm => ({
        datetime: alarm.datetime,
        msg: alarm.msg,
        key: alarm.key,
        subsystem: alarm.subsystem,
        archived: alarm.archived
      }));
    }
    
    console.log('UniFi comprehensive stats:', {
      clients: stats.clients.length,
      devices: stats.devices.length,
      alarms: stats.alarms.length
    });
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    
    res.json(stats);
    
  } catch (error) {
    console.error('UniFi proxy error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch UniFi data. Check if controller is accessible and credentials are correct.'
    });
  }
});

// ==================== UNIFI PROTECT ROUTES ====================

// UniFi Protect session cache to avoid rate limiting
// Key: host+credentialId hash, Value: { cookies, token, expires }
const unifiProtectSessionCache = new Map();

// UniFi Protect Bootstrap Endpoint (cameras + recent events)
router.get('/api/unifi-protect/bootstrap', async (req, res) => {
  try {
    const { host, credentialId } = req.query;
    
    if (!host) {
      return res.status(400).json({ error: 'Missing host parameter' });
    }
    
    if (!credentialId) {
      return res.status(400).json({ error: 'Missing credentialId parameter' });
    }
    
    // Extract userId from auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    let credentials;
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      credentials = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
    }
    
    const username = credentials.username;
    const password = credentials.password;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Credentials missing username or password' });
    }
    
    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    const https = require('https');
    
    // Create an agent that accepts self-signed certificates
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    // Create cache key
    const cacheKey = crypto.createHash('md5').update(`${host}:${credentialId}`).digest('hex');
    const now = Date.now();
    
    let authToken = null;
    let cookies = [];
    
    // Check if we have a valid cached session
    const cached = unifiProtectSessionCache.get(cacheKey);
    if (cached && cached.expires > now) {
      console.log('Using cached UniFi Protect session');
      authToken = cached.token;
      cookies = cached.cookies;
    } else {
      console.log('Logging into UniFi Protect...');
      
      // Login to UniFi Protect
      const loginUrl = `${host}/api/auth/login`;
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, rememberMe: true }),
        agent: httpsAgent,
        timeout: 10000
      });
      
      if (!loginResponse.ok) {
        console.error(`UniFi Protect login failed: ${loginResponse.status}`);
        return res.status(loginResponse.status).json({ 
          error: 'Authentication failed. Check credentials.',
          details: loginResponse.statusText
        });
      }
      
      // Extract cookies and auth token
      const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
      if (setCookieHeaders) {
        cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]);
      }
      
      // Get the auth token from response headers or body
      authToken = loginResponse.headers.get('authorization') || 
                  loginResponse.headers.get('x-csrf-token');
      
      // Cache the session (30 minutes)
      unifiProtectSessionCache.set(cacheKey, {
        token: authToken,
        cookies: cookies,
        expires: now + (30 * 60 * 1000)
      });
      
      console.log('UniFi Protect login successful');
    }
    
    // Prepare request headers
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }
    
    if (authToken) {
      headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }
    
    // Fetch bootstrap data (contains cameras and recent events)
    const bootstrapUrl = `${host}/proxy/protect/api/bootstrap`;
    console.log('Fetching UniFi Protect bootstrap data...');
    
    const bootstrapResponse = await fetch(bootstrapUrl, {
      headers: headers,
      agent: httpsAgent,
      timeout: 15000
    });
    
    if (!bootstrapResponse.ok) {
      console.error(`UniFi Protect bootstrap failed: ${bootstrapResponse.status}`);
      // Clear cache on auth failure
      if (bootstrapResponse.status === 401) {
        unifiProtectSessionCache.delete(cacheKey);
      }
      return res.status(bootstrapResponse.status).json({ 
        error: 'Failed to fetch UniFi Protect data',
        details: bootstrapResponse.statusText
      });
    }
    
    const bootstrapData = await bootstrapResponse.json();
    
    // Process cameras
    const cameras = (bootstrapData.cameras || []).map(camera => ({
      id: camera.id,
      name: camera.name,
      type: camera.type,
      model: camera.model,
      mac: camera.mac,
      host: camera.host,
      state: camera.state,
      isConnected: camera.isConnected || camera.state === 'CONNECTED',
      isMotionDetected: camera.isMotionDetected || false,
      isRecording: camera.isRecording || false,
      lastSeen: camera.lastSeen,
      channels: (camera.channels || []).map(ch => ({
        id: ch.id,
        name: ch.name,
        enabled: ch.enabled,
        isRtspEnabled: ch.isRtspEnabled,
        rtspAlias: ch.rtspAlias
      }))
    }));
    
    // Fetch recent events
    const eventsUrl = `${host}/proxy/protect/api/events`;
    const eventsParams = new URLSearchParams({
      start: (now - (24 * 60 * 60 * 1000)).toString(), // Last 24 hours
      end: now.toString(),
      limit: '50',
      orderDirection: 'DESC'
    });
    
    console.log('Fetching UniFi Protect events...');
    
    const eventsResponse = await fetch(`${eventsUrl}?${eventsParams}`, {
      headers: headers,
      agent: httpsAgent,
      timeout: 10000
    });
    
    let events = [];
    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      events = (eventsData || []).map(event => ({
        id: event.id,
        type: event.type,
        score: event.score,
        smartDetectTypes: event.smartDetectTypes || [],
        camera: event.camera,
        start: event.start,
        end: event.end,
        thumbnail: event.thumbnail ? `${host}/proxy/protect/api/events/${event.id}/thumbnail` : null,
        heatmap: event.heatmap,
        modelKey: event.modelKey
      }));
      
      // Add camera names to events
      events = events.map(event => {
        const camera = cameras.find(c => c.id === event.camera);
        return {
          ...event,
          cameraName: camera?.name || 'Unknown'
        };
      });
    }
    
    // Process sensors (environmental devices)
    const sensors = (bootstrapData.sensors || []).map(sensor => ({
      id: sensor.id,
      name: sensor.name,
      type: sensor.type,
      model: sensor.model,
      mac: sensor.mac,
      state: sensor.state,
      isConnected: sensor.isConnected || sensor.state === 'CONNECTED',
      lastSeen: sensor.lastSeen,
      stats: {
        temperature: sensor.stats?.temperature ? {
          value: sensor.stats.temperature.value,
          unit: sensor.stats.temperature.unit || 'celsius'
        } : null,
        humidity: sensor.stats?.humidity ? {
          value: sensor.stats.humidity.value,
          unit: sensor.stats.humidity.unit || 'percent'
        } : null,
        light: sensor.stats?.light ? {
          value: sensor.stats.light.value,
          unit: sensor.stats.light.unit || 'lux'
        } : null
      }
    }));
    
    console.log(`UniFi Protect data: ${cameras.length} cameras, ${events.length} events, ${sensors.length} sensors`);
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    
    res.json({
      cameras,
      events,
      sensors
    });
    
  } catch (error) {
    console.error('UniFi Protect proxy error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch UniFi Protect data. Check if console is accessible and credentials are correct.'
    });
  }
});

// UniFi Protect Sensors Only Endpoint - Public API for external applications
router.get('/api/unifi-protect/sensors', async (req, res) => {
  try {
    const { host } = req.query;
    
    // Query database for UniFi Protect credentials
    // Prioritize custom and unifi-protect over unifi and basic
    const result = await db.query(`
      SELECT id, user_id, credential_data 
      FROM credentials 
      WHERE service_type IN ('unifi-protect', 'unifi', 'basic', 'custom')
      ORDER BY 
        CASE service_type 
          WHEN 'unifi-protect' THEN 1 
          WHEN 'custom' THEN 2 
          WHEN 'unifi' THEN 3 
          ELSE 4 
        END,
        id DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No UniFi Protect credentials found',
        details: 'Please configure credentials in the Dashboard first'
      });
    }
    
    const credentialRecord = result.rows[0];
    
    // Decrypt the credential data using the imported function
    const credentialData = decryptCredentials(credentialRecord.credential_data);
    const username = credentialData.username;
    const password = credentialData.password;
    const protectHost = host || credentialData.host || credentialData.url;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Credentials missing username or password' });
    }
    
    if (!protectHost) {
      return res.status(400).json({ 
        error: 'Missing host parameter',
        details: 'Provide host in query parameter or configure it in credentials'
      });
    }
    
    console.log(`[Sensors API] Using host: ${protectHost}, credential ID: ${credentialRecord.id}`);
    
    const fetch = (await import('node-fetch')).default;
    const https = require('https');
    
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    const cacheKey = crypto.createHash('md5').update(`${protectHost}:${credentialRecord.id}`).digest('hex');
    const now = Date.now();
    
    let authToken = null;
    let cookies = [];
    
    // Check if we have a valid cached session
    const cached = unifiProtectSessionCache.get(cacheKey);
    if (cached && cached.expires > now) {
      console.log('[Sensors API] Using cached UniFi Protect session');
      authToken = cached.token;
      cookies = cached.cookies;
    } else {
      // Login to UniFi Protect
      console.log(`[Sensors API] Logging into UniFi Protect at ${protectHost}...`);
      const loginUrl = `${protectHost}/api/auth/login`;
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, rememberMe: true }),
        agent: httpsAgent,
        timeout: 10000
      });
      
      if (!loginResponse.ok) {
        console.error(`[Sensors API] UniFi Protect login failed: ${loginResponse.status} ${loginResponse.statusText}`);
        return res.status(loginResponse.status).json({ 
          error: 'Authentication failed. Check credentials.',
          details: loginResponse.statusText
        });
      }
      
      console.log('[Sensors API] Login successful, extracting session data...');
      const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
      if (setCookieHeaders) {
        cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]);
      }
      
      authToken = loginResponse.headers.get('authorization') || 
                  loginResponse.headers.get('x-csrf-token');
      
      unifiProtectSessionCache.set(cacheKey, {
        token: authToken,
        cookies: cookies,
        expires: now + (30 * 60 * 1000)
      });
    }
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }
    
    if (authToken) {
      headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }
    
    // Fetch bootstrap data
    const bootstrapUrl = `${protectHost}/proxy/protect/api/bootstrap`;
    console.log(`[Sensors API] Fetching bootstrap from ${bootstrapUrl}...`);
    const bootstrapResponse = await fetch(bootstrapUrl, {
      headers: headers,
      agent: httpsAgent,
      timeout: 15000
    });
    
    console.log(`[Sensors API] Bootstrap response status: ${bootstrapResponse.status}`);
    if (!bootstrapResponse.ok) {
      if (bootstrapResponse.status === 401) {
        unifiProtectSessionCache.delete(cacheKey);
      }
      console.error(`[Sensors API] Bootstrap fetch failed: ${bootstrapResponse.status} ${bootstrapResponse.statusText}`);
      return res.status(bootstrapResponse.status).json({ 
        error: 'Failed to fetch UniFi Protect data',
        details: bootstrapResponse.statusText
      });
    }
    
    const bootstrapData = await bootstrapResponse.json();
    
    // Process sensors only
    const sensors = (bootstrapData.sensors || []).map(sensor => ({
      id: sensor.id,
      name: sensor.name,
      type: sensor.type,
      model: sensor.model,
      mac: sensor.mac,
      state: sensor.state,
      isConnected: sensor.isConnected || sensor.state === 'CONNECTED',
      lastSeen: sensor.lastSeen,
      lastSeenReadable: sensor.lastSeen ? new Date(sensor.lastSeen).toISOString() : null,
      temperature: sensor.stats?.temperature ? {
        value: sensor.stats.temperature.value,
        celsius: sensor.stats.temperature.value,
        fahrenheit: (sensor.stats.temperature.value * 9/5) + 32,
        unit: sensor.stats.temperature.unit || 'celsius'
      } : null,
      humidity: sensor.stats?.humidity ? {
        value: sensor.stats.humidity.value,
        unit: sensor.stats.humidity.unit || 'percent'
      } : null,
      light: sensor.stats?.light ? {
        value: sensor.stats.light.value,
        unit: sensor.stats.light.unit || 'lux'
      } : null
    }));
    
    // Set CORS headers for external access
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      host: protectHost,
      sensorCount: sensors.length,
      sensors: sensors
    });
    
  } catch (error) {
    console.error('UniFi Protect sensors API error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: 'Failed to fetch sensor data. Check if console is accessible and credentials are correct.'
    });
  }
});

// UniFi Protect Camera Snapshot Endpoint
router.get('/api/unifi-protect/camera/:cameraId/snapshot', async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { host, credentialId } = req.query;
    
    if (!host || !credentialId || !cameraId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Extract userId from auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    let credentials;
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      credentials = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
    }
    
    const username = credentials.username;
    const password = credentials.password;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Credentials missing username or password' });
    }
    
    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    const https = require('https');
    
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    // Create cache key
    const cacheKey = crypto.createHash('md5').update(`${host}:${credentialId}`).digest('hex');
    const now = Date.now();
    
    let authToken = null;
    let cookies = [];
    
    // Check if we have a valid cached session
    const cached = unifiProtectSessionCache.get(cacheKey);
    if (cached && cached.expires > now) {
      authToken = cached.token;
      cookies = cached.cookies;
    } else {
      // Need to login
      const loginUrl = `${host}/api/auth/login`;
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, rememberMe: true }),
        agent: httpsAgent,
        timeout: 10000
      });
      
      if (!loginResponse.ok) {
        return res.status(loginResponse.status).json({ 
          error: 'Authentication failed',
          details: loginResponse.statusText
        });
      }
      
      const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
      if (setCookieHeaders) {
        cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]);
      }
      
      authToken = loginResponse.headers.get('authorization') || 
                  loginResponse.headers.get('x-csrf-token');
      
      unifiProtectSessionCache.set(cacheKey, {
        token: authToken,
        cookies: cookies,
        expires: now + (30 * 60 * 1000)
      });
    }
    
    // Prepare request headers
    const headers = {};
    
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }
    
    if (authToken) {
      headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }
    
    // Fetch camera snapshot
    const snapshotUrl = `${host}/proxy/protect/api/cameras/${cameraId}/snapshot`;
    const snapshotResponse = await fetch(snapshotUrl, {
      headers: headers,
      agent: httpsAgent,
      timeout: 10000
    });
    
    if (!snapshotResponse.ok) {
      return res.status(snapshotResponse.status).json({ 
        error: 'Failed to fetch camera snapshot',
        details: snapshotResponse.statusText
      });
    }
    
    // Stream the image back to client
    res.set('Content-Type', snapshotResponse.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    snapshotResponse.body.pipe(res);
    
  } catch (error) {
    console.error('UniFi Protect snapshot error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch camera snapshot'
    });
  }
});

// ==================== GOOGLE CALENDAR ROUTES ====================

// Google Calendar Events Endpoint
router.get('/api/google-calendar/events', async (req, res) => {
  try {
    const { credentialId, timeMin, timeMax, maxResults = '10' } = req.query;
    
    if (!credentialId) {
      return res.status(400).json({ error: 'Missing credentialId parameter' });
    }
    
    // Extract userId from auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    let credentials;
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      credentials = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
    }
    
    // Validate credential fields
    if (!credentials.calendar_id || !credentials.api_key) {
      return res.status(400).json({ 
        error: 'Credential must contain calendar_id and api_key fields' 
      });
    }
    
    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    
    // Construct Google Calendar API URL
    const calendarUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(credentials.calendar_id)}/events`
    );
    
    calendarUrl.searchParams.set('key', credentials.api_key);
    if (timeMin) calendarUrl.searchParams.set('timeMin', timeMin);
    if (timeMax) calendarUrl.searchParams.set('timeMax', timeMax);
    calendarUrl.searchParams.set('maxResults', maxResults);
    calendarUrl.searchParams.set('orderBy', 'startTime');
    calendarUrl.searchParams.set('singleEvents', 'true');
    
    console.log(`Fetching Google Calendar events for calendar: ${credentials.calendar_id}`);
    
    const response = await fetch(calendarUrl.toString(), {
      headers: {
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: { message: response.statusText } 
      }));
      console.error(`Google Calendar API error: ${response.status}`, errorData);
      
      return res.status(response.status).json({ 
        error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
      });
    }
    
    const data = await response.json();
    
    console.log(`Google Calendar events retrieved: ${data.items?.length || 0} events`);
    
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', 'application/json');
    
    res.json(data);
    
  } catch (error) {
    console.error('Google Calendar proxy error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch Google Calendar data. Check credentials and API key.'
    });
  }
});

// ==================== DOCKER ROUTES ====================

/**
 * POST /api/docker/containers
 * List Docker containers
 */
module.exports = router;

