/**
 * Pi-hole Widget Plugin
 * 
 * Provides proxy endpoint for Pi-hole v6+ API with session caching.
 */

const express = require('express');
const router = express.Router();
const { getCredentials, verifyAuth, respond, createCache } = require('../src/plugin-helpers');

// Session cache to avoid rate limiting (5 minute TTL)
const sessionCache = createCache(5 * 60 * 1000);

// Pi-hole API proxy endpoint
router.get('/api/pihole', async (req, res) => {
  try {
    const { host, password, credentialId } = req.query;
    
    if (!host) {
      return respond.badRequest(res, 'Missing host parameter');
    }
    
    let piholePassword = password;
    
    // If credentialId is provided, fetch credentials from database
    if (credentialId) {
      try {
        const decoded = verifyAuth(req);
        const credentials = await getCredentials(credentialId, decoded.userId);
        
        if (!credentials.password) {
          return respond.badRequest(res, 'Credential does not contain password field');
        }
        
        piholePassword = credentials.password;
      } catch (err) {
        return respond.unauthorized(res, 'Invalid authentication token or credential access denied');
      }
    }
    
    if (!piholePassword) {
      return respond.badRequest(res, 'Missing password parameter or credentialId. Pi-hole v6+ requires authentication.');
    }

    // Use node-fetch to make requests
    const fetch = (await import('node-fetch')).default;
    
    // Create cache key from host+password
    const cacheKey = `${host}:${piholePassword}`;
    
    let sid;
    const cachedSession = sessionCache.get(cacheKey);
    
    // Check if we have a valid cached session
    if (cachedSession) {
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
      
      // Cache the session
      sessionCache.set(cacheKey, { sid: sid });
      
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
      
      // Clear cache on auth error
      if (statsResponse.status === 401) {
        sessionCache.clear(cacheKey);
      }
      
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

module.exports = {
  name: 'pihole',
  description: 'Pi-hole v6+ API proxy with session caching',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
