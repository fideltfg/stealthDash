/**
 * Google Calendar Widget Plugin
 * 
 * Provides proxy endpoint for Google Calendar API.
 */

const express = require('express');
const router = express.Router();
const { getCredentials, verifyAuth, respond } = require('../src/plugin-helpers');

// Google Calendar Events Endpoint
router.get('/api/google-calendar/events', async (req, res) => {
  try {
    const { credentialId, timeMin, timeMax, maxResults = '10' } = req.query;
    
    if (!credentialId) {
      return respond.badRequest(res, 'Missing credentialId parameter');
    }
    
    // Extract userId from auth token
    let credentials;
    try {
      const decoded = verifyAuth(req);
      credentials = await getCredentials(credentialId, decoded.userId);
    } catch (err) {
      return respond.unauthorized(res, 'Invalid authentication token or credential access denied');
    }
    
    // Validate credential fields
    if (!credentials.calendar_id || !credentials.api_key) {
      return respond.badRequest(res, 'Credential must contain calendar_id and api_key fields');
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

module.exports = {
  name: 'google-calendar',
  description: 'Google Calendar API proxy',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
