/**
 * Proxy Widget Plugin
 * 
 * Provides CORS proxy and embed proxy endpoints for widgets
 * that need to fetch external content.
 */

const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const urlModule = require('url');

// Embed proxy endpoint - strips X-Frame-Options and CSP headers so sites can be iframed
router.get('/embed-proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    // Validate URL
    const parsedUrl = urlModule.parse(targetUrl);
    if (!parsedUrl.protocol || !['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).send('Invalid URL protocol');
    }

    console.log(`Embed-proxying request to: ${targetUrl}`);

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

// HA-specific embed proxy - strips X-Frame-Options and injects a <base> tag so that
// HA's root-relative asset paths (/frontend_latest/..., /api/...) resolve back to the
// actual HA server origin instead of the Dashboard's origin.
router.get('/ha-embed-proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const parsedUrl = urlModule.parse(targetUrl);
    if (!parsedUrl.protocol || !['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).send('Invalid URL protocol');
    }

    const haOrigin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    console.log(`HA-embed-proxying request to: ${targetUrl}`);

    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    // Disable compression so we can inspect/modify the body
    const reqHeaders = { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' };

    protocol.get(targetUrl, { headers: reqHeaders }, (proxyRes) => {
      res.status(proxyRes.statusCode);

      const skipHeaders = [
        'x-frame-options', 'content-security-policy',
        'content-security-policy-report-only', 'content-encoding', 'transfer-encoding'
      ];
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!skipHeaders.includes(key.toLowerCase())) {
          res.set(key, value);
        }
      }

      res.set('Access-Control-Allow-Origin', '*');

      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();

      if (contentType.includes('text/html')) {
        const chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));
        proxyRes.on('end', () => {
          let html = Buffer.concat(chunks).toString('utf8');
          // Inject <base> right after the opening <head> tag (or at the start).
          // This makes root-relative paths like /frontend_latest/core.js resolve
          // to the real HA server instead of the Dashboard's origin.
          if (!html.includes('<base ') && !html.includes('<base>')) {
            const baseTag = `<base href="${haOrigin}/">`;
            html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
            if (!html.includes('<base ')) {
              html = baseTag + html; // fallback if no <head>
            }
          }
          res.removeHeader('content-length'); // body length changed
          res.send(html);
        });
        proxyRes.on('error', err => {
          console.error('HA embed proxy stream error:', err);
          res.status(500).send(`Stream error: ${err.message}`);
        });
      } else {
        proxyRes.pipe(res);
      }
    }).on('error', (error) => {
      console.error('HA embed proxy error:', error);
      res.status(500).send(`HA embed proxy error: ${error.message}`);
    });

  } catch (error) {
    console.error('HA embed proxy endpoint error:', error);
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

module.exports = {
  name: 'proxy',
  description: 'CORS and embed proxy for external content',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
