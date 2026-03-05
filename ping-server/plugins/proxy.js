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
