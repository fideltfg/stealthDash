/**
 * Speedtest Tracker Widget Plugin
 * 
 * Provides backend routes for the Speedtest widget,
 * proxying requests to a Speedtest Tracker instance.
 */

const express = require('express');
const router = express.Router();
const { getCredentials, verifyAuth, respond } = require('../src/plugin-helpers');

router.get('/api/speedtest', async (req, res) => {
  try {
    const { host, credentialId, days } = req.query;
    if (!host) {
      return respond.badRequest(res, 'Missing host parameter');
    }

    const fetch = (await import('node-fetch')).default;
    const base = host.replace(/\/$/, '');
    const headers = { 'Accept': 'application/json' };

    // Optional auth via credential
    if (credentialId) {
      try {
        const decoded = verifyAuth(req);
        const creds = await getCredentials(credentialId, decoded.userId);
        if (creds.api_token) {
          headers['Authorization'] = `Bearer ${creds.api_token}`;
        }
      } catch (err) {
        return respond.unauthorized(res, 'Auth required when using credentialId');
      }
    }

    // Fetch latest result
    const latestRes = await fetch(`${base}/api/v1/results/latest`, { 
      headers, 
      timeout: 10000 
    });
    
    if (!latestRes.ok) {
      throw new Error(`Speedtest Tracker ${latestRes.status}: ${latestRes.statusText}`);
    }
    
    const latestData = await latestRes.json();
    const latest = latestData.data || latestData;

    // Fetch history (optional)
    let history = [];
    try {
      const histRes = await fetch(`${base}/api/v1/results?limit=50`, { 
        headers, 
        timeout: 10000 
      });
      if (histRes.ok) {
        const histData = await histRes.json();
        history = (histData.data || histData || []).slice(0, 50);
      }
    } catch {
      // History is optional - continue if it fails
    }

    // Normalize to common shape
    const normalize = (r) => ({
      download: (r.download || r.download_bits || 0) / (r.download_bits ? 1e6 : 1),
      upload: (r.upload || r.upload_bits || 0) / (r.upload_bits ? 1e6 : 1),
      ping: r.ping || r.ping_ms || 0,
      jitter: r.jitter || r.ping_jitter || null,
      server_name: r.server_name || r.server?.name || null,
      timestamp: r.created_at || r.timestamp || new Date().toISOString()
    });

    const normalizedHistory = history.map(normalize).reverse();
    const avg = (arr, key) => arr.length 
      ? arr.reduce((sum, r) => sum + r[key], 0) / arr.length 
      : 0;

    res.json({
      latest: normalize(latest),
      history: normalizedHistory,
      averages: {
        download: avg(normalizedHistory, 'download') || normalize(latest).download,
        upload: avg(normalizedHistory, 'upload') || normalize(latest).upload,
        ping: avg(normalizedHistory, 'ping') || normalize(latest).ping
      }
    });
  } catch (error) {
    console.error('Speedtest proxy error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch Speedtest data' 
    });
  }
});

module.exports = {
  name: 'speedtest',
  description: 'Speedtest Tracker widget - Proxies to Speedtest Tracker API',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
