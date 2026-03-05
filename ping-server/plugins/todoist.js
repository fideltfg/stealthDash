/**
 * Todoist Widget Plugin
 * 
 * Provides proxy endpoints for Todoist task management API.
 */

const express = require('express');
const router = express.Router();
const { getCredentials, verifyAuth, respond } = require('../src/plugin-helpers');

// Get tasks
router.get('/api/todoist/tasks', async (req, res) => {
  try {
    const { credentialId, filter } = req.query;
    if (!credentialId) {
      return respond.badRequest(res, 'Missing credentialId');
    }

    let creds;
    try {
      const decoded = verifyAuth(req);
      creds = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return respond.unauthorized(res, 'Auth required');
    }
    
    const apiToken = creds.api_token;
    if (!apiToken) {
      return respond.badRequest(res, 'Credential missing api_token');
    }

    const fetch = (await import('node-fetch')).default;
    const url = new URL('https://api.todoist.com/rest/v2/tasks');
    if (filter) url.searchParams.set('filter', filter);

    const r = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiToken}` },
      timeout: 10000
    });
    
    if (!r.ok) {
      throw new Error(`Todoist API ${r.status}: ${r.statusText}`);
    }
    
    res.json(await r.json());
  } catch (error) {
    console.error('Todoist proxy error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Todoist tasks' });
  }
});

// Close (complete) a task
router.post('/api/todoist/close', async (req, res) => {
  try {
    const { credentialId, taskId } = req.query;
    if (!credentialId || !taskId) {
      return respond.badRequest(res, 'Missing credentialId or taskId');
    }

    let creds;
    try {
      const decoded = verifyAuth(req);
      creds = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return respond.unauthorized(res, 'Auth required');
    }
    
    const apiToken = creds.api_token;
    if (!apiToken) {
      return respond.badRequest(res, 'Credential missing api_token');
    }

    const fetch = (await import('node-fetch')).default;
    const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${taskId}/close`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiToken}` },
      timeout: 10000
    });
    
    if (!r.ok) {
      throw new Error(`Todoist API ${r.status}: ${r.statusText}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Todoist close error:', error);
    res.status(500).json({ error: error.message || 'Failed to close task' });
  }
});

module.exports = {
  name: 'todoist',
  description: 'Todoist task management API proxy',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
