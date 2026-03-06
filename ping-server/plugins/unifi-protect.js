/**
 * UniFi Protect Widget Plugin
 * 
 * Provides proxy endpoints for UniFi Protect API.
 * Supports bootstrap data, sensors, and camera snapshots.
 */

const express = require('express');
const router = express.Router();
const https = require('https');
const crypto = require('crypto');
const { db, getCredentials, verifyAuth, decryptCredentials, createCache, respond } = require('../src/plugin-helpers');

// Session cache (30 minute TTL)
const sessionCache = createCache(30 * 60 * 1000);

// Helper to get auth session
async function getProtectSession(fetch, httpsAgent, host, username, password, cacheKey) {
  const cached = sessionCache.get(cacheKey);
  if (cached) {
    console.log('Using cached UniFi Protect session');
    return { authToken: cached.token, cookies: cached.cookies };
  }
  
  console.log('Logging into UniFi Protect...');
  const loginUrl = `${host}/api/auth/login`;
  const loginResponse = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, rememberMe: true }),
    agent: httpsAgent,
    timeout: 10000
  });
  
  if (!loginResponse.ok) {
    throw { status: loginResponse.status, error: 'Authentication failed', details: loginResponse.statusText };
  }
  
  const setCookieHeaders = loginResponse.headers.raw()['set-cookie'];
  const cookies = setCookieHeaders ? setCookieHeaders.map(cookie => cookie.split(';')[0]) : [];
  const authToken = loginResponse.headers.get('authorization') || loginResponse.headers.get('x-csrf-token');
  
  sessionCache.set(cacheKey, { token: authToken, cookies: cookies });
  console.log('UniFi Protect login successful');
  
  return { authToken, cookies };
}

// Bootstrap endpoint (cameras + events)
router.get('/api/unifi-protect/bootstrap', async (req, res) => {
  try {
    const { host, credentialId } = req.query;
    if (!host) return respond.badRequest(res, 'Missing host parameter');
    if (!credentialId) return respond.badRequest(res, 'Missing credentialId parameter');
    
    let credentials;
    try {
      const decoded = verifyAuth(req);
      credentials = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token');
    }
    
    if (!credentials.username || !credentials.password) {
      return respond.badRequest(res, 'Credentials missing username or password');
    }
    
    const fetch = (await import('node-fetch')).default;
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const cacheKey = crypto.createHash('md5').update(`${host}:${credentialId}`).digest('hex');
    
    const { authToken, cookies } = await getProtectSession(fetch, httpsAgent, host, credentials.username, credentials.password, cacheKey);
    
    const headers = { 'Content-Type': 'application/json' };
    if (cookies.length > 0) headers['Cookie'] = cookies.join('; ');
    if (authToken) headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    
    // Fetch bootstrap data
    const bootstrapUrl = `${host}/proxy/protect/api/bootstrap`;
    console.log('Fetching UniFi Protect bootstrap data...');
    
    const bootstrapResponse = await fetch(bootstrapUrl, {
      headers: headers,
      agent: httpsAgent,
      timeout: 15000
    });
    
    if (!bootstrapResponse.ok) {
      if (bootstrapResponse.status === 401) sessionCache.clear(cacheKey);
      return res.status(bootstrapResponse.status).json({ error: 'Failed to fetch UniFi Protect data', details: bootstrapResponse.statusText });
    }
    
    const bootstrapData = await bootstrapResponse.json();
    const now = Date.now();
    
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
      start: (now - (24 * 60 * 60 * 1000)).toString(),
      end: now.toString(),
      limit: '50',
      orderDirection: 'DESC'
    });
    
    let events = [];
    try {
      const eventsResponse = await fetch(`${eventsUrl}?${eventsParams}`, {
        headers: headers,
        agent: httpsAgent,
        timeout: 10000
      });
      
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        events = (eventsData || []).map(event => {
          const camera = cameras.find(c => c.id === event.camera);
          return {
            id: event.id,
            type: event.type,
            score: event.score,
            smartDetectTypes: event.smartDetectTypes || [],
            camera: event.camera,
            cameraName: camera?.name || 'Unknown',
            start: event.start,
            end: event.end,
            thumbnail: event.thumbnail ? `${host}/proxy/protect/api/events/${event.id}/thumbnail` : null,
            heatmap: event.heatmap,
            modelKey: event.modelKey
          };
        });
      }
    } catch { /* events are optional */ }
    
    // Process sensors
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
    
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ cameras, events, sensors });
    
  } catch (error) {
    console.error('UniFi Protect proxy error:', error);
    if (error.status) return res.status(error.status).json({ error: error.error, details: error.details });
    res.status(500).json({ error: error.message, details: 'Failed to fetch UniFi Protect data' });
  }
});

// Public sensors endpoint
router.get('/api/unifi-protect/sensors', async (req, res) => {
  try {
    const { host } = req.query;
    
    // Query database for credentials
    const result = await db.query(`
      SELECT id, user_id, credential_data 
      FROM credentials 
      WHERE service_type IN ('unifi-protect', 'unifi', 'basic', 'custom')
      ORDER BY CASE service_type WHEN 'unifi-protect' THEN 1 WHEN 'custom' THEN 2 WHEN 'unifi' THEN 3 ELSE 4 END, id DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return respond.notFound(res, 'No UniFi Protect credentials found');
    }
    
    const credentialRecord = result.rows[0];
    const credentialData = decryptCredentials(credentialRecord.credential_data);
    const username = credentialData.username;
    const password = credentialData.password;
    const protectHost = host || credentialData.host || credentialData.url;
    
    if (!username || !password) return respond.badRequest(res, 'Credentials missing username or password');
    if (!protectHost) return respond.badRequest(res, 'Missing host parameter');
    
    const fetch = (await import('node-fetch')).default;
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const cacheKey = crypto.createHash('md5').update(`${protectHost}:${credentialRecord.id}`).digest('hex');
    
    const { authToken, cookies } = await getProtectSession(fetch, httpsAgent, protectHost, username, password, cacheKey);
    
    const headers = { 'Content-Type': 'application/json' };
    if (cookies.length > 0) headers['Cookie'] = cookies.join('; ');
    if (authToken) headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    
    const bootstrapUrl = `${protectHost}/proxy/protect/api/bootstrap`;
    const bootstrapResponse = await fetch(bootstrapUrl, {
      headers: headers,
      agent: httpsAgent,
      timeout: 15000
    });
    
    if (!bootstrapResponse.ok) {
      if (bootstrapResponse.status === 401) sessionCache.clear(cacheKey);
      return res.status(bootstrapResponse.status).json({ error: 'Failed to fetch UniFi Protect data', details: bootstrapResponse.statusText });
    }
    
    const bootstrapData = await bootstrapResponse.json();
    
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
    
    res.set('Access-Control-Allow-Origin', '*');
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      host: protectHost,
      sensorCount: sensors.length,
      sensors: sensors
    });
    
  } catch (error) {
    console.error('UniFi Protect sensors API error:', error);
    res.status(500).json({ success: false, error: error.message, details: 'Failed to fetch sensor data' });
  }
});

// Camera snapshot endpoint
router.get('/api/unifi-protect/camera/:cameraId/snapshot', async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { host, credentialId } = req.query;
    
    if (!host || !credentialId || !cameraId) {
      return respond.badRequest(res, 'Missing required parameters');
    }
    
    let credentials;
    try {
      const decoded = verifyAuth(req);
      credentials = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token');
    }
    
    if (!credentials.username || !credentials.password) {
      return respond.badRequest(res, 'Credentials missing username or password');
    }
    
    const fetch = (await import('node-fetch')).default;
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const cacheKey = crypto.createHash('md5').update(`${host}:${credentialId}`).digest('hex');
    
    const { authToken, cookies } = await getProtectSession(fetch, httpsAgent, host, credentials.username, credentials.password, cacheKey);
    
    const headers = {};
    if (cookies.length > 0) headers['Cookie'] = cookies.join('; ');
    if (authToken) headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    
    const snapshotUrl = `${host}/proxy/protect/api/cameras/${cameraId}/snapshot`;
    const snapshotResponse = await fetch(snapshotUrl, {
      headers: headers,
      agent: httpsAgent,
      timeout: 10000
    });
    
    if (!snapshotResponse.ok) {
      return res.status(snapshotResponse.status).json({ error: 'Failed to fetch camera snapshot', details: snapshotResponse.statusText });
    }
    
    res.set('Content-Type', snapshotResponse.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    snapshotResponse.body.pipe(res);
    
  } catch (error) {
    console.error('UniFi Protect snapshot error:', error);
    res.status(500).json({ error: error.message, details: 'Failed to fetch camera snapshot' });
  }
});

// Event thumbnail endpoint
router.get('/api/unifi-protect/event/:eventId/thumbnail', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { host, credentialId } = req.query;
    
    if (!host || !credentialId || !eventId) {
      return respond.badRequest(res, 'Missing required parameters');
    }
    
    let credentials;
    try {
      const decoded = verifyAuth(req);
      credentials = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token');
    }
    
    if (!credentials.username || !credentials.password) {
      return respond.badRequest(res, 'Credentials missing username or password');
    }
    
    const fetch = (await import('node-fetch')).default;
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const cacheKey = crypto.createHash('md5').update(`${host}:${credentialId}`).digest('hex');
    
    const { authToken, cookies } = await getProtectSession(fetch, httpsAgent, host, credentials.username, credentials.password, cacheKey);
    
    const headers = {};
    if (cookies.length > 0) headers['Cookie'] = cookies.join('; ');
    if (authToken) headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    
    const thumbnailUrl = `${host}/proxy/protect/api/events/${eventId}/thumbnail`;
    const thumbnailResponse = await fetch(thumbnailUrl, {
      headers: headers,
      agent: httpsAgent,
      timeout: 10000
    });
    
    if (!thumbnailResponse.ok) {
      return res.status(thumbnailResponse.status).json({ error: 'Failed to fetch event thumbnail', details: thumbnailResponse.statusText });
    }
    
    res.set('Content-Type', thumbnailResponse.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    thumbnailResponse.body.pipe(res);
    
  } catch (error) {
    console.error('UniFi Protect thumbnail error:', error);
    res.status(500).json({ error: error.message, details: 'Failed to fetch event thumbnail' });
  }
});

module.exports = {
  name: 'unifi-protect',
  description: 'UniFi Protect API proxy (cameras, events, sensors)',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
