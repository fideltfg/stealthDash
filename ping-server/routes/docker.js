const express = require('express');
const http = require('http');
const https = require('https');
const router = express.Router();
const db = require('../src/db');
const { decrypt } = require('../src/crypto-utils');

// Middleware to verify authentication
const verifyAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

router.use(verifyAuth);

// Helper function to make Docker API requests
async function dockerRequest(host, endpoint, method = 'GET', credentialId = null) {
  return new Promise(async (resolve, reject) => {
    try {
      // Handle Unix socket
      if (host.startsWith('unix://')) {
        const socketPath = host.replace('unix://', '');
        const options = {
          socketPath,
          path: endpoint,
          method
        };
        
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          });
        });
        
        req.on('error', reject);
        req.end();
        return;
      }
      
      // Handle HTTP/HTTPS
      const url = new URL(endpoint, host);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 2375),
        path: url.pathname + url.search,
        method
      };
      
      // Add TLS options if credentials are provided
      if (credentialId && isHttps) {
        try {
          const [credential] = await db.query(
            'SELECT * FROM credentials WHERE id = ?',
            [credentialId]
          );
          
          if (credential && credential.data) {
            const decryptedData = decrypt(credential.data);
            const data = JSON.parse(decryptedData);
            
            if (data.tls_cert) options.cert = data.tls_cert;
            if (data.tls_key) options.key = data.tls_key;
            if (data.ca_cert) options.ca = data.ca_cert;
            
            // For self-signed certificates
            options.rejectUnauthorized = false;
          }
        } catch (error) {
          console.error('Error loading credentials:', error);
        }
      }
      
      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Docker API error: ${res.statusCode} - ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        });
      });
      
      req.on('error', reject);
      req.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

// GET /api/docker/containers - List containers
router.post('/api/docker/containers', async (req, res) => {
  try {
    const { host, credentialId, all = false } = req.body;
    
    if (!host) {
      return res.status(400).json({ error: 'Docker host is required' });
    }
    
    const endpoint = `/containers/json?all=${all}`;
    const containers = await dockerRequest(host, endpoint, 'GET', credentialId);
    
    res.json(containers);
  } catch (error) {
    console.error('Docker API error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch containers',
      details: error.toString()
    });
  }
});

// POST /api/docker/containers/start - Start a container
router.post('/api/docker/containers/start', async (req, res) => {
  try {
    const { host, credentialId, containerId } = req.body;
    
    if (!host || !containerId) {
      return res.status(400).json({ error: 'Docker host and container ID are required' });
    }
    
    const endpoint = `/containers/${containerId}/start`;
    await dockerRequest(host, endpoint, 'POST', credentialId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Docker start error:', error);
    res.status(500).json({ error: error.message || 'Failed to start container' });
  }
});

// POST /api/docker/containers/stop - Stop a container
router.post('/api/docker/containers/stop', async (req, res) => {
  try {
    const { host, credentialId, containerId } = req.body;
    
    if (!host || !containerId) {
      return res.status(400).json({ error: 'Docker host and container ID are required' });
    }
    
    const endpoint = `/containers/${containerId}/stop`;
    await dockerRequest(host, endpoint, 'POST', credentialId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Docker stop error:', error);
    res.status(500).json({ error: error.message || 'Failed to stop container' });
  }
});

// POST /api/docker/containers/restart - Restart a container
router.post('/api/docker/containers/restart', async (req, res) => {
  try {
    const { host, credentialId, containerId } = req.body;
    
    if (!host || !containerId) {
      return res.status(400).json({ error: 'Docker host and container ID are required' });
    }
    
    const endpoint = `/containers/${containerId}/restart`;
    await dockerRequest(host, endpoint, 'POST', credentialId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Docker restart error:', error);
    res.status(500).json({ error: error.message || 'Failed to restart container' });
  }
});

// POST /api/docker/containers/logs - Get container logs
router.post('/api/docker/containers/logs', async (req, res) => {
  try {
    const { host, credentialId, containerId, tail = 500 } = req.body;
    
    if (!host || !containerId) {
      return res.status(400).json({ error: 'Docker host and container ID are required' });
    }
    
    const tailParam = tail === 'all' ? 'all' : tail;
    const endpoint = `/containers/${containerId}/logs?stdout=true&stderr=true&timestamps=true&tail=${tailParam}`;
    const logs = await dockerRequest(host, endpoint, 'GET', credentialId);
    
    // Docker API returns logs in a special format with headers
    // We need to handle both raw text and the special format
    if (typeof logs === 'string') {
      res.type('text/plain');
      res.send(logs);
    } else {
      res.type('text/plain');
      res.send(JSON.stringify(logs));
    }
  } catch (error) {
    console.error('Docker logs error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch container logs' });
  }
});

module.exports = router;
