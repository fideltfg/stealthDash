const express = require('express');
const router = express.Router();
const ping = require('ping');
const ModbusRTU = require('modbus-serial');
const snmp = require('net-snmp');
const crypto = require('crypto');
const db = require('../src/db');
const { authMiddleware } = require('../src/auth');
const { decryptCredentials } = require('../src/crypto-utils');

// Session caches to avoid rate limiting
const piholeSessionCache = new Map();
const unifiSessionCache = new Map();

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
    console.log(`Fetching Home Assistant states from: ${url}/api/states`);
    console.log(`Using ${credentialId ? 'credential ID: ' + credentialId : 'direct token'}`);
    
    const response = await fetch(`${url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`Home Assistant returned ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error in /home-assistant/states:', error);
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

// Embed proxy endpoint - strips X-Frame-Options and CSP headers so sites can be iframed
router.get('/embed-proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    // Validate URL
    const urlModule = require('url');
    const parsedUrl = urlModule.parse(targetUrl);
    if (!parsedUrl.protocol || !['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).send('Invalid URL protocol');
    }

    console.log(`Embed-proxying request to: ${targetUrl}`);

    const https = require('https');
    const http = require('http');
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    protocol.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (proxyRes) => {
      // Forward status code
      res.status(proxyRes.statusCode);

      // Forward all headers EXCEPT ones that block iframe embedding
      const skipHeaders = ['x-frame-options', 'content-security-policy', 'content-security-policy-report-only'];
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!skipHeaders.includes(key.toLowerCase())) {
          res.set(key, value);
        }
      }

      // Allow embedding from any origin
      res.set('Access-Control-Allow-Origin', '*');
      res.removeHeader('X-Frame-Options');

      proxyRes.pipe(res);
    }).on('error', (error) => {
      console.error('Embed proxy error:', error);
      res.status(500).send(`Embed proxy error: ${error.message}`);
    });

  } catch (error) {
    console.error('Embed proxy endpoint error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

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

// Helper: Fetch UniFi data using legacy cookie-based auth (self-hosted controllers)
async function fetchUnifiLegacy(fetch, httpsAgent, host, site, username, password) {
  // Create cache key from host+username
  const cacheKey = `${host}:${username}:${password}`;
  
  let cookies;
  const cachedSession = unifiSessionCache.get(cacheKey);
  
  // Check if we have a valid cached session
  if (cachedSession && cachedSession.expires > Date.now()) {
    console.log('Using cached UniFi legacy session');
    cookies = cachedSession.cookies;
  } else {
    // Authenticate and get session cookies
    const loginUrl = `${host}/api/login`;
    console.log(`Authenticating with UniFi Controller (legacy) at: ${loginUrl}`);
    
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        username: username,
        password: password,
        remember: false
      }),
      agent: httpsAgent,
      timeout: 10000
    });
    
    if (!loginResponse.ok) {
      console.error(`UniFi login error: ${loginResponse.status} ${loginResponse.statusText}`);
      const errorText = await loginResponse.text();
      throw { status: loginResponse.status, error: `UniFi authentication failed: ${loginResponse.status}`, details: errorText };
    }
    
    // Extract cookies from response
    const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
    if (!setCookieHeaders || setCookieHeaders.length === 0) {
      throw { status: 401, error: 'Authentication failed', details: 'No session cookies received from UniFi Controller' };
    }
    
    cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
    
    // Cache the session for 30 minutes
    unifiSessionCache.set(cacheKey, {
      cookies: cookies,
      expires: Date.now() + (30 * 60 * 1000)
    });
    
    console.log('UniFi legacy authentication successful, session cached');
  }
  
  // Build request headers for legacy cookie auth
  const makeHeaders = () => ({ 'Accept': 'application/json', 'Cookie': cookies });
  
  // Legacy endpoints: /api/s/{site}/stat/*
  const basePath = `/api/s/${site}/stat`;
  
  const [healthResponse, devicesResponse, clientsResponse, alarmsResponse] = await Promise.all([
    fetch(`${host}${basePath}/health`, { headers: makeHeaders(), agent: httpsAgent, timeout: 10000 }),
    fetch(`${host}${basePath}/device`, { headers: makeHeaders(), agent: httpsAgent, timeout: 10000 })
      .catch(err => { console.log('Device fetch failed (non-critical):', err.message); return null; }),
    fetch(`${host}${basePath}/sta`, { headers: makeHeaders(), agent: httpsAgent, timeout: 10000 })
      .catch(err => { console.log('Clients fetch failed (non-critical):', err.message); return null; }),
    fetch(`${host}${basePath}/alarm`, { headers: makeHeaders(), agent: httpsAgent, timeout: 10000 })
      .catch(err => { console.log('Alarms fetch failed (non-critical):', err.message); return null; })
  ]);
  
  if (!healthResponse.ok) {
    // Clear cache on auth errors
    if (healthResponse.status === 401) {
      unifiSessionCache.delete(cacheKey);
    }
    const errorText = await healthResponse.text();
    throw { status: healthResponse.status, error: `UniFi API returned ${healthResponse.status}: ${healthResponse.statusText}`, details: errorText };
  }
  
  return {
    healthData: await healthResponse.json(),
    devicesData: devicesResponse && devicesResponse.ok ? await devicesResponse.json() : { data: [] },
    clientsData: clientsResponse && clientsResponse.ok ? await clientsResponse.json() : { data: [] },
    alarmsData: alarmsResponse && alarmsResponse.ok ? await alarmsResponse.json() : { data: [] }
  };
}

// Helper: Fetch UniFi data using API key via the cloud Site Manager API (api.ui.com)
// API keys from unifi.ui.com authenticate against the cloud API, NOT local consoles.
// Endpoints: /v1/sites, /v1/devices, /v1/hosts, /v1/isp-metrics/{type}
const UNIFI_CLOUD_API = 'https://api.ui.com';

async function fetchUnifiApiKey(fetch, apiKey) {
  const makeHeaders = () => ({
    'Accept': 'application/json',
    'X-API-Key': apiKey
  });
  
  console.log('Fetching UniFi data from cloud Site Manager API (api.ui.com)...');
  
  // Fetch sites, devices, and hosts in parallel
  const [sitesResponse, devicesResponse, hostsResponse] = await Promise.all([
    fetch(`${UNIFI_CLOUD_API}/v1/sites`, { headers: makeHeaders(), timeout: 15000 }),
    fetch(`${UNIFI_CLOUD_API}/v1/devices`, { headers: makeHeaders(), timeout: 15000 })
      .catch(err => { console.log('Devices fetch failed (non-critical):', err.message); return null; }),
    fetch(`${UNIFI_CLOUD_API}/v1/hosts`, { headers: makeHeaders(), timeout: 15000 })
      .catch(err => { console.log('Hosts fetch failed (non-critical):', err.message); return null; })
  ]);
  
  if (!sitesResponse.ok) {
    const errorText = await sitesResponse.text();
    console.error(`UniFi cloud API error: ${sitesResponse.status} - ${errorText}`);
    throw {
      status: sitesResponse.status,
      error: `UniFi cloud API returned ${sitesResponse.status}. Check your API key at unifi.ui.com.`,
      details: errorText
    };
  }
  
  const sitesData = await sitesResponse.json();
  const devicesData = devicesResponse && devicesResponse.ok ? await devicesResponse.json() : { data: [] };
  const hostsData = hostsResponse && hostsResponse.ok ? await hostsResponse.json() : { data: [] };
  
  // Also try to fetch ISP metrics (last 24h at 5-minute intervals)
  let ispMetrics = { data: [] };
  try {
    const metricsResponse = await fetch(`${UNIFI_CLOUD_API}/v1/isp-metrics/5m?duration=24h`, {
      headers: makeHeaders(),
      timeout: 15000
    });
    if (metricsResponse.ok) {
      ispMetrics = await metricsResponse.json();
    }
  } catch (err) {
    console.log('ISP metrics fetch failed (non-critical):', err.message);
  }
  
  console.log('UniFi cloud API data received:', {
    sites: (sitesData.data || []).length,
    devices: (devicesData.data || []).length,
    hosts: (hostsData.data || []).length,
    metrics: (ispMetrics.data || []).length
  });
  
  return { sitesData, devicesData, hostsData, ispMetrics };
}

// Helper: Map cloud API device shortnames to legacy type codes for icon display
function mapDeviceType(shortname, model) {
  const sn = (shortname || '').toUpperCase();
  const m = (model || '').toUpperCase();
  
  // Gateways / Security Gateways
  if (sn.startsWith('UDM') || sn.startsWith('UXG') || sn.startsWith('USG') || sn.startsWith('UDR') || sn.startsWith('UDW') || sn === 'UDMPRO' || sn === 'UXGPRO') return 'ugw';
  
  // Access Points
  if (sn.startsWith('U6') || sn.startsWith('U7') || sn.startsWith('UAP') || sn.startsWith('UAC') || m.includes('AP') || m.includes('ACCESS POINT') || m.includes('MESH') || m.includes(' LR') || m.includes(' IW') || m.includes(' HD') || m.includes(' PRO')) {
    // Distinguish APs from switches that might have "Pro" in the name
    if (m.includes('SWITCH') || m.includes('USW') || m.includes('US ')) return 'usw';
    return 'uap';
  }
  
  // Switches
  if (sn.startsWith('USW') || sn.startsWith('USL') || sn.startsWith('US8') || sn.startsWith('USC') || sn.startsWith('USF') || m.includes('SWITCH') || m.includes('USW') || m.includes('US ')) return 'usw';
  
  // If model string contains AP-related keywords
  if (m.includes('AC ') || m.includes('WIFI') || m.includes('WI-FI')) return 'uap';
  
  return 'usw'; // Default to switch for unknown network devices
}

// Transform cloud Site Manager API data into the widget's UnifiStats format
function transformCloudApiData(sitesData, devicesData, hostsData, ispMetrics, targetSite) {
  const sites = sitesData.data || [];
  const deviceHosts = devicesData.data || []; // Array of {hostId, hostName, devices: [...]}
  const hosts = hostsData.data || [];
  const metricsEntries = ispMetrics.data || [];
  
  // Find the target site - try matching by siteId first, then by name/desc
  // When multiple sites have the same name (e.g. both "default"), prefer the one with isOwner: true
  let site = null;
  
  // Try exact siteId match first (if user provided a siteId)
  site = sites.find(s => s.siteId === targetSite);
  
  if (!site) {
    // Find all sites matching by name or description
    const matchingSites = sites.filter(s => 
      (s.meta?.name || '').toLowerCase() === targetSite.toLowerCase() ||
      (s.meta?.desc || '').toLowerCase() === targetSite.toLowerCase()
    );
    
    if (matchingSites.length > 1) {
      // Multiple matches - prefer the one where isOwner is true
      site = matchingSites.find(s => s.isOwner === true) || matchingSites[0];
    } else if (matchingSites.length === 1) {
      site = matchingSites[0];
    }
  }
  
  if (!site && sites.length > 0) {
    // Fall back: prefer owned site, then first site
    site = sites.find(s => s.isOwner === true) || sites[0];
  }
  
  const siteHostId = site?.hostId;
  
  const stats = {
    site_name: site?.meta?.desc || site?.meta?.name || targetSite,
    num_user: 0,
    num_guest: 0,
    num_iot: 0,
    gateways: 0,
    switches: 0,
    access_points: 0,
    wan_ip: undefined,
    uptime: undefined,
    wan_uptime: undefined,
    latency: undefined,
    speedtest_ping: undefined,
    xput_up: undefined,
    xput_down: undefined,
    gateway_status: undefined,
    gateway_model: undefined,
    isp_name: undefined,
    devices: [],
    clients: [],
    alarms: [],
    traffic: { tx_bytes: 0, rx_bytes: 0, tx_packets: 0, rx_packets: 0 },
    wan_download_kbps: undefined,
    wan_upload_kbps: undefined,
    wan_packet_loss: undefined,
    wan_downtime: undefined
  };
  
  // Extract site statistics
  if (site?.statistics) {
    const siteStats = site.statistics;
    const counts = siteStats.counts || {};
    
    // Client counts
    stats.num_user = (counts.wifiClient || 0) + (counts.wiredClient || 0);
    stats.num_guest = counts.guestClient || 0;
    stats.num_iot = counts.iotClient || 0;
    
    // Device counts from site statistics (authoritative numbers)
    stats.gateways = counts.gatewayDevice || 0;
    stats.switches = counts.wiredDevice || 0;
    stats.access_points = counts.wifiDevice || 0;
    
    // WAN info
    if (siteStats.wans) {
      const primaryWan = siteStats.wans.WAN || siteStats.wans.WAN1;
      if (primaryWan) {
        stats.wan_ip = primaryWan.externalIp;
      }
    }
    
    // WAN uptime from percentages
    if (siteStats.percentages) {
      const wanUp = siteStats.percentages.wanUptime;
      stats.gateway_status = wanUp === 100 ? 'ok' : (wanUp > 90 ? 'warning' : 'error');
      stats.wan_uptime = wanUp;
    }
    
    // ISP info
    if (siteStats.ispInfo) {
      stats.isp_name = siteStats.ispInfo.name;
    }
    
    // Gateway model
    if (siteStats.gateway) {
      stats.gateway_model = siteStats.gateway.shortname;
    }
  }
  
  // Process ISP metrics for the matching site
  // Metrics are grouped by siteId/hostId with nested periods[]
  // NOTE: download_kbps / upload_kbps represent WAN LINK SPEED (capacity), NOT actual traffic.
  const siteMetrics = metricsEntries.find(m => m.siteId === site?.siteId) || metricsEntries[0];
  if (siteMetrics?.periods?.length > 0) {
    const latest = siteMetrics.periods[siteMetrics.periods.length - 1];
    const wan = latest?.data?.wan;
    if (wan) {
      if (wan.avgLatency !== undefined) stats.latency = wan.avgLatency;
      if (wan.maxLatency !== undefined) stats.speedtest_ping = wan.maxLatency;
      // download_kbps / upload_kbps are WAN link speed in kbps, convert to bps
      if (wan.download_kbps !== undefined) {
        stats.xput_down = wan.download_kbps * 1000;
        stats.wan_download_kbps = wan.download_kbps;
      }
      if (wan.upload_kbps !== undefined) {
        stats.xput_up = wan.upload_kbps * 1000;
        stats.wan_upload_kbps = wan.upload_kbps;
      }
      if (wan.packetLoss !== undefined) stats.wan_packet_loss = wan.packetLoss;
      if (wan.downtime !== undefined) stats.wan_downtime = wan.downtime;
    }
    // traffic byte totals are NOT available from the cloud API
    // (download_kbps etc are link speed, not cumulative counters)
  }
  
  // Process devices from cloud API
  // The /v1/devices response is grouped by host: {data: [{hostId, hostName, devices: [...]}, ...]}
  // Find the host entry matching this site's hostId
  let siteDeviceList = [];
  if (siteHostId) {
    const hostEntry = deviceHosts.find(h => h.hostId === siteHostId);
    if (hostEntry) {
      siteDeviceList = hostEntry.devices || [];
    }
  }
  if (siteDeviceList.length === 0 && deviceHosts.length > 0) {
    // Fall back: flatten all devices from all hosts
    siteDeviceList = deviceHosts.flatMap(h => h.devices || []);
  }
  
  // Filter to network devices only (exclude protect cameras, access readers, etc.)
  const networkDevices = siteDeviceList.filter(d => d.productLine === 'network');
  
  networkDevices.forEach(device => {
    // Calculate uptime from startupTime
    let uptimeSeconds = 0;
    if (device.startupTime) {
      const startTime = new Date(device.startupTime).getTime();
      if (!isNaN(startTime)) {
        uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
        if (uptimeSeconds < 0) uptimeSeconds = 0;
      }
    }
    
    const deviceType = mapDeviceType(device.shortname, device.model);
    
    stats.devices.push({
      name: device.name || 'Unknown',
      model: device.model || device.shortname || '',
      type: deviceType,
      ip: device.ip || '',
      mac: device.mac || '',
      state: device.status === 'online' ? 1 : 0,
      adopted: device.isManaged || false,
      uptime: uptimeSeconds,
      version: device.version || '',
      upgradable: !!(device.updateAvailable),
      num_sta: 0,
      user_num_sta: 0,
      guest_num_sta: 0,
      bytes: 0,
      tx_bytes: 0,
      rx_bytes: 0,
      satisfaction: 0,
      cpu: 0,
      mem: 0,
      shortname: device.shortname || ''
    });
  });
  
  // Process hosts for console uptime info
  if (hosts.length > 0 && siteHostId) {
    const host = hosts.find(h => h.id === siteHostId);
    if (host) {
      // Calculate uptime from registrationTime or lastConnectionStateChange
      const rs = host.reportedState || {};
      if (rs.state === 'connected' && host.lastConnectionStateChange) {
        const connTime = new Date(host.lastConnectionStateChange).getTime();
        if (!isNaN(connTime)) {
          stats.uptime = Math.floor((Date.now() - connTime) / 1000);
        }
      }
    }
  }
  
  console.log('UniFi cloud API transform result:', {
    site: stats.site_name,
    siteId: site?.siteId,
    hostId: siteHostId?.substring(0, 30),
    clients: stats.num_user,
    guests: stats.num_guest,
    networkDevices: stats.devices.length,
    gateways: stats.gateways,
    switches: stats.switches,
    aps: stats.access_points,
    wan_ip: stats.wan_ip,
    gateway_model: stats.gateway_model,
    isp: stats.isp_name,
    latency: stats.latency,
    isOwner: site?.isOwner
  });
  
  return stats;
}

// UniFi cloud API: List available sites (for config dialog dropdown)
router.get('/api/unifi/sites', async (req, res) => {
  try {
    const { credentialId } = req.query;
    
    if (!credentialId) {
      return res.status(400).json({ error: 'Missing credentialId parameter' });
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      const credResult = await db.query(
        'SELECT service_type, credential_data FROM credentials WHERE id = $1 AND user_id = $2',
        [credentialId, decoded.userId]
      );
      
      if (credResult.rows.length === 0) {
        return res.status(404).json({ error: 'Credential not found' });
      }
      
      const serviceType = credResult.rows[0].service_type;
      const credentials = decryptCredentials(credResult.rows[0].credential_data);
      
      if (serviceType !== 'unifi_api' || !credentials.apiKey) {
        return res.json({ sites: [] }); // Only cloud API has site listing
      }
      
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${UNIFI_CLOUD_API}/v1/sites`, {
        headers: { 'Accept': 'application/json', 'X-API-Key': credentials.apiKey },
        timeout: 15000
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch sites from UniFi cloud API' });
      }
      
      const data = await response.json();
      const sites = (data.data || []).map(s => ({
        siteId: s.siteId,
        name: s.meta?.name || 'unknown',
        desc: s.meta?.desc || s.meta?.name || 'Unknown',
        isOwner: s.isOwner || false,
        gateway: s.statistics?.gateway?.shortname || '',
        totalDevices: s.statistics?.counts?.totalDevice || 0,
        totalClients: (s.statistics?.counts?.wifiClient || 0) + (s.statistics?.counts?.wiredClient || 0) + (s.statistics?.counts?.guestClient || 0)
      }));
      
      res.json({ sites });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
  } catch (error) {
    console.error('Error listing UniFi sites:', error);
    res.status(500).json({ error: 'Failed to list sites' });
  }
});

// UniFi Controller API proxy endpoint (supports both legacy username/password and API key auth)
router.get('/api/unifi/stats', async (req, res) => {
  try {
    const { credentialId, site = 'default' } = req.query;
    
    if (!credentialId) {
      return res.status(400).json({ error: 'Missing credentialId parameter' });
    }
    
    // Authenticate and fetch credentials
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required when using credentialId' });
    }
    
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    let credentials, serviceType;
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      
      // Fetch the full credential record (including service_type) to determine auth method
      const credResult = await db.query(
        'SELECT service_type, credential_data FROM credentials WHERE id = $1 AND user_id = $2',
        [credentialId, decoded.userId]
      );
      
      if (credResult.rows.length === 0) {
        return res.status(404).json({ error: 'Credential not found or access denied' });
      }
      
      serviceType = credResult.rows[0].service_type;
      credentials = decryptCredentials(credResult.rows[0].credential_data);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid authentication token or credential access denied' });
    }

    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    const https = require('https');
    
    // Create an HTTPS agent that ignores self-signed certificates
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    let rawData;
    
    if (serviceType === 'unifi_api') {
      // API Key auth via cloud Site Manager API (api.ui.com)
      if (!credentials.apiKey) {
        return res.status(400).json({ error: 'Credential does not contain an API key' });
      }
      console.log(`UniFi cloud API key auth`);
      const cloudData = await fetchUnifiApiKey(fetch, credentials.apiKey);
      
      // Transform cloud API data into the widget's expected stats format
      const stats = transformCloudApiData(
        cloudData.sitesData, 
        cloudData.devicesData, 
        cloudData.hostsData, 
        cloudData.ispMetrics, 
        site
      );
      
      console.log('UniFi cloud API stats:', {
        site: stats.site_name,
        clients: stats.num_user,
        devices: stats.devices.length
      });
      
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Content-Type', 'application/json');
      return res.json(stats);
    } else {
      // Legacy username/password auth for self-hosted controllers
      const host = credentials.host;
      if (!host) {
        return res.status(400).json({ error: 'Credential does not contain a host URL. Please edit the credential and add the Controller URL.' });
      }
      if (!credentials.username || !credentials.password) {
        return res.status(400).json({ error: 'Credential does not contain username and password fields' });
      }
      console.log(`UniFi legacy auth for host: ${host}`);
      rawData = await fetchUnifiLegacy(fetch, httpsAgent, host, site, credentials.username, credentials.password);
    }
    
    const { healthData, devicesData, clientsData, alarmsData } = rawData;
    
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

        // Accumulate traffic bytes and packets from ALL subsystems that report them
        // (wlan, lan, wan each track traffic at their own layer)
        if (item.tx_bytes) stats.traffic.tx_bytes += item.tx_bytes;
        if (item.rx_bytes) stats.traffic.rx_bytes += item.rx_bytes;
        if (item.tx_packets) stats.traffic.tx_packets += item.tx_packets;
        if (item.rx_packets) stats.traffic.rx_packets += item.rx_packets;
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
          bytes: device.bytes || (device.stat?.bytes) || 0,
          tx_bytes: device['tx_bytes'] || device.stat?.tx_bytes || 0,
          rx_bytes: device['rx_bytes'] || device.stat?.rx_bytes || 0,
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
    // Handle structured errors from auth helpers
    if (error.status && error.error) {
      return res.status(error.status).json({ error: error.error, details: error.details });
    }
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

// ==================== GLANCES (System Resources) ====================

router.get('/api/glances', async (req, res) => {
  try {
    const { host, credentialId } = req.query;
    if (!host) return res.status(400).json({ error: 'Missing host parameter' });

    const fetch = (await import('node-fetch')).default;
    const headers = {};

    // Optional auth via credential
    if (credentialId) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET || 'your-secret-key-change-in-production');
        const creds = await getCredentials(credentialId, decoded.userId);
        if (creds.password) {
          headers['Authorization'] = 'Basic ' + Buffer.from(`glances:${creds.password}`).toString('base64');
        }
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token or credential' });
      }
    }

    const base = host.replace(/\/$/, '');

    // Auto-detect Glances API version (v4, v3, v2)
    let apiVersion = null;
    for (const ver of [4, 3, 2]) {
      try {
        const r = await fetch(`${base}/api/${ver}/cpu`, { headers, timeout: 5000 });
        if (r.ok) { apiVersion = ver; break; }
      } catch { /* try next version */ }
    }

    if (!apiVersion) {
      return res.status(502).json({ error: `Cannot reach Glances at ${host}. Ensure Glances is running with: glances -w` });
    }

    const endpoints = ['cpu', 'mem', 'swap', 'load', 'fs', 'network', 'system', 'uptime', 'percpu', 'processcount', 'diskio', 'quicklook', 'containers', 'sensors', 'gpu'];
    const results = await Promise.all(endpoints.map(async ep => {
      try {
        const r = await fetch(`${base}/api/${apiVersion}/${ep}`, { headers, timeout: 5000 });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    }));

    const [cpu, mem, swap, load, fs, network, system, uptime, percpu, processcount, diskio, quicklook, containers, sensors, gpu] = results;

    // If core endpoints (cpu + mem) both failed, report error instead of misleading zeros
    if (!cpu && !mem) {
      return res.status(502).json({ error: `Glances API v${apiVersion} detected but returned no data. Check the Glances instance.` });
    }

    res.json({
      cpu: cpu ? { total: cpu.total, user: cpu.user, system: cpu.system, iowait: cpu.iowait || 0, cpucore: cpu.cpucore || 0, ctx_switches_rate: cpu.ctx_switches_rate_per_sec || 0, interrupts_rate: cpu.interrupts_rate_per_sec || 0 } : { total: 0, user: 0, system: 0, iowait: 0, cpucore: 0, ctx_switches_rate: 0, interrupts_rate: 0 },
      percpu: Array.isArray(percpu) ? percpu.map(c => ({ cpu_number: c.cpu_number, total: c.total, user: c.user, system: c.system, iowait: c.iowait || 0 })) : [],
      mem: mem ? { total: mem.total, used: mem.used, percent: mem.percent, available: mem.available || 0, buffers: mem.buffers || 0, cached: mem.cached || 0, active: mem.active || 0, inactive: mem.inactive || 0 } : { total: 0, used: 0, percent: 0, available: 0, buffers: 0, cached: 0, active: 0, inactive: 0 },
      swap: swap ? { total: swap.total, used: swap.used, percent: swap.percent } : { total: 0, used: 0, percent: 0 },
      load: load ? { min1: load.min1, min5: load.min5, min15: load.min15, cpucore: load.cpucore } : { min1: 0, min5: 0, min15: 0, cpucore: 1 },
      fs: Array.isArray(fs) ? fs.filter(d => d.mnt_point && !d.mnt_point.startsWith('/etc/')).map(d => ({ device_name: d.device_name, fs_type: d.fs_type || '', mnt_point: d.mnt_point, size: d.size, used: d.used, free: d.free || (d.size - d.used), percent: d.percent })) : [],
      diskio: Array.isArray(diskio) ? diskio.filter(d => d.disk_name && !d.disk_name.match(/^(loop|dm-)/)).map(d => ({ disk_name: d.disk_name, read_bytes_rate: d.read_bytes_rate_per_sec || 0, write_bytes_rate: d.write_bytes_rate_per_sec || 0, read_count_rate: d.read_count_rate_per_sec || 0, write_count_rate: d.write_count_rate_per_sec || 0 })) : [],
      network: Array.isArray(network) ? network.filter(n => n.interface_name && !n.interface_name.match(/^(lo|veth|br-)/)).map(n => ({ interface_name: n.interface_name, rx: n.bytes_recv_rate_per_sec || n.bytes_recv || 0, tx: n.bytes_sent_rate_per_sec || n.bytes_sent || 0, speed: n.speed || 0 })) : [],
      system: system ? { hostname: system.hostname, os_name: system.os_name, os_version: system.os_version } : { hostname: 'unknown', os_name: '', os_version: '' },
      uptime: uptime || 'N/A',
      quicklook: quicklook ? { cpu_name: quicklook.cpu_name || '', cpu_hz_current: quicklook.cpu_hz_current || 0, cpu_hz: quicklook.cpu_hz || 0 } : null,
      processcount: processcount ? { total: processcount.total || 0, running: processcount.running || 0, sleeping: processcount.sleeping || 0, thread: processcount.thread || 0 } : null,
      containers: Array.isArray(containers) ? containers.map(c => ({ name: c.name, status: c.status, cpu_percent: c.cpu_percent || 0, memory_usage: c.memory_usage || 0, uptime: c.uptime || '', engine: c.engine || 'docker' })) : [],
      sensors: Array.isArray(sensors) ? sensors.map(s => ({ label: s.label, value: s.value, unit: s.unit || '', type: s.type || '' })) : [],
      gpu: Array.isArray(gpu) ? gpu.map(g => ({ name: g.name || '', mem: g.mem || 0, proc: g.proc || 0, gpu_id: g.gpu_id || 0, temperature: g.temperature || 0 })) : []
    });
  } catch (error) {
    console.error('Glances proxy error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Glances data' });
  }
});

// ==================== TODOIST (Task List) ====================

router.get('/api/todoist/tasks', async (req, res) => {
  try {
    const { credentialId, filter } = req.query;
    if (!credentialId) return res.status(400).json({ error: 'Missing credentialId' });

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const creds = await getCredentials(credentialId, decoded.userId);
    const apiToken = creds.api_token;
    if (!apiToken) return res.status(400).json({ error: 'Credential missing api_token' });

    const fetch = (await import('node-fetch')).default;
    const url = new URL('https://api.todoist.com/rest/v2/tasks');
    if (filter) url.searchParams.set('filter', filter);

    const r = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiToken}` },
      timeout: 10000
    });
    if (!r.ok) throw new Error(`Todoist API ${r.status}: ${r.statusText}`);
    res.json(await r.json());
  } catch (error) {
    console.error('Todoist proxy error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Todoist tasks' });
  }
});

router.post('/api/todoist/close', async (req, res) => {
  try {
    const { credentialId, taskId } = req.query;
    if (!credentialId || !taskId) return res.status(400).json({ error: 'Missing credentialId or taskId' });

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const creds = await getCredentials(credentialId, decoded.userId);
    const apiToken = creds.api_token;
    if (!apiToken) return res.status(400).json({ error: 'Credential missing api_token' });

    const fetch = (await import('node-fetch')).default;
    const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${taskId}/close`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiToken}` },
      timeout: 10000
    });
    if (!r.ok) throw new Error(`Todoist API ${r.status}: ${r.statusText}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Todoist close error:', error);
    res.status(500).json({ error: error.message || 'Failed to close task' });
  }
});

// ==================== SPEEDTEST TRACKER ====================

router.get('/api/speedtest', async (req, res) => {
  try {
    const { host, credentialId, days } = req.query;
    if (!host) return res.status(400).json({ error: 'Missing host parameter' });

    const fetch = (await import('node-fetch')).default;
    const base = host.replace(/\/$/, '');
    const headers = { 'Accept': 'application/json' };

    // Optional auth
    if (credentialId) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      const creds = await getCredentials(credentialId, decoded.userId);
      if (creds.api_token) headers['Authorization'] = `Bearer ${creds.api_token}`;
    }

    // Fetch latest result
    const latestRes = await fetch(`${base}/api/v1/results/latest`, { headers, timeout: 10000 });
    if (!latestRes.ok) throw new Error(`Speedtest Tracker ${latestRes.status}: ${latestRes.statusText}`);
    const latestData = await latestRes.json();
    const latest = latestData.data || latestData;

    // Fetch history
    let history = [];
    try {
      const histRes = await fetch(`${base}/api/v1/results?limit=50`, { headers, timeout: 10000 });
      if (histRes.ok) {
        const histData = await histRes.json();
        history = (histData.data || histData || []).slice(0, 50);
      }
    } catch { /* history is optional */ }

    // Normalize to common shape
    const norm = (r) => ({
      download: (r.download || r.download_bits || 0) / (r.download_bits ? 1e6 : 1),
      upload: (r.upload || r.upload_bits || 0) / (r.upload_bits ? 1e6 : 1),
      ping: r.ping || r.ping_ms || 0,
      jitter: r.jitter || r.ping_jitter || null,
      server_name: r.server_name || r.server?.name || null,
      timestamp: r.created_at || r.timestamp || new Date().toISOString()
    });

    const normHistory = history.map(norm).reverse();
    const avg = (arr, key) => arr.length ? arr.reduce((s, r) => s + r[key], 0) / arr.length : 0;

    res.json({
      latest: norm(latest),
      history: normHistory,
      averages: {
        download: avg(normHistory, 'download') || norm(latest).download,
        upload: avg(normHistory, 'upload') || norm(latest).upload,
        ping: avg(normHistory, 'ping') || norm(latest).ping
      }
    });
  } catch (error) {
    console.error('Speedtest proxy error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Speedtest data' });
  }
});

// ==================== CRYPTO TICKER (CoinGecko Proxy) ====================

// Simple in-memory cache for CoinGecko API responses (to help with rate limiting)
const cryptoCache = new Map();
const CRYPTO_CACHE_TTL = 60000; // 60 seconds

function getCachedCrypto(key) {
  const cached = cryptoCache.get(key);
  if (cached && Date.now() - cached.timestamp < CRYPTO_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedCrypto(key, data) {
  cryptoCache.set(key, { data, timestamp: Date.now() });
  // Cleanup old cache entries
  if (cryptoCache.size > 100) {
    const oldestKey = cryptoCache.keys().next().value;
    cryptoCache.delete(oldestKey);
  }
}

// Proxy for CoinGecko market data (prices)
router.get('/api/crypto/markets', async (req, res) => {
  try {
    const { vs_currency, ids } = req.query;
    if (!vs_currency || !ids) {
      return res.status(400).json({ error: 'Missing required parameters: vs_currency and ids' });
    }

    // Check cache first
    const cacheKey = `markets:${vs_currency}:${ids}`;
    const cachedData = getCachedCrypto(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const fetch = (await import('node-fetch')).default;
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs_currency}&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please increase refresh interval or try again later.');
      }
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    setCachedCrypto(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Crypto markets proxy error:', error);
    res.status(error.message.includes('Rate limit') ? 429 : 500).json({ 
      error: error.message || 'Failed to fetch crypto market data' 
    });
  }
});

// Proxy for CoinGecko historical chart data
router.get('/api/crypto/chart', async (req, res) => {
  try {
    const { id, vs_currency, days } = req.query;
    if (!id || !vs_currency || !days) {
      return res.status(400).json({ error: 'Missing required parameters: id, vs_currency, and days' });
    }

    // Check cache first
    const cacheKey = `chart:${id}:${vs_currency}:${days}`;
    const cachedData = getCachedCrypto(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const fetch = (await import('node-fetch')).default;
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${vs_currency}&days=${days}`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please increase refresh interval or try again later.');
      }
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    setCachedCrypto(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Crypto chart proxy error:', error);
    res.status(error.message.includes('Rate limit') ? 429 : 500).json({ 
      error: error.message || 'Failed to fetch crypto chart data' 
    });
  }
});

module.exports = router;

