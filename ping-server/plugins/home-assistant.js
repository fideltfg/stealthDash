/**
 * Home Assistant Widget Plugin
 * 
 * Provides proxy endpoints for Home Assistant states and services.
 */

const express = require('express');
const router = express.Router();
const { getCredentials, verifyAuth, respond } = require('../src/plugin-helpers');

// Home Assistant proxy endpoints
router.post('/home-assistant/states', async (req, res) => {
  const { url, token, credentialId } = req.body;
  
  if (!url) {
    return respond.badRequest(res, 'url is required');
  }
  
  let haToken = token;
  
  // If credentialId is provided, fetch credentials from database
  if (credentialId) {
    try {
      const decoded = verifyAuth(req);
      const credentials = await getCredentials(credentialId, decoded.userId);
      
      if (!credentials.token) {
        return respond.badRequest(res, 'Credential does not contain token field');
      }
      
      haToken = credentials.token;
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token or credential access denied');
    }
  }
  
  if (!haToken) {
    return respond.badRequest(res, 'token or credentialId is required');
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
    return respond.badRequest(res, 'url, domain, service, and entity_id are required');
  }
  
  let haToken = token;
  
  // If credentialId is provided, fetch credentials from database
  if (credentialId) {
    try {
      const decoded = verifyAuth(req);
      const credentials = await getCredentials(credentialId, decoded.userId);
      
      if (!credentials.token) {
        return respond.badRequest(res, 'Credential does not contain token field');
      }
      
      haToken = credentials.token;
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token or credential access denied');
    }
  }
  
  if (!haToken) {
    return respond.badRequest(res, 'token or credentialId is required');
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

module.exports = {
  name: 'home-assistant',
  description: 'Home Assistant states and service proxy',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
