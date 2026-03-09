/**
 * Ping Widget Plugin
 * 
 * Provides health check, ping, and batch ping endpoints.
 */

const express = require('express');
const router = express.Router();
const ping = require('ping');
const { execFile } = require('child_process');
const { respond } = require('../src/plugin-helpers');

/** Strict target validation: only hostname/IP characters, no shell metacharacters */
function isValidTarget(target) {
  return typeof target === 'string' &&
    /^[a-zA-Z0-9._-]+$/.test(target) &&
    target.length > 0 &&
    target.length <= 253;
}

/** Parse traceroute stdout into structured hop objects */
function parseTracerouteOutput(raw) {
  const hops = [];
  const lines = raw.trim().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)\s+(.*)/);
    if (!m) continue;
    const hopNum = parseInt(m[1]);
    const rest = m[2].trim();
    // All timeouts on this hop
    if (/^[\*\s]+$/.test(rest)) {
      hops.push({ hop: hopNum, address: '*', rtts: ['*', '*', '*'] });
      continue;
    }
    const parts = rest.split(/\s+/);
    const address = parts[0];
    const rtts = [];
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === '*') {
        rtts.push('*');
      } else if (!isNaN(parseFloat(parts[i])) && parts[i + 1] === 'ms') {
        rtts.push(parseFloat(parts[i]).toFixed(2) + ' ms');
        i++; // skip 'ms' token
      }
    }
    hops.push({ hop: hopNum, address, rtts });
  }
  return hops;
}

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
      return respond.badRequest(res, 'Target is required');
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
    return respond.badRequest(res, 'Targets array is required');
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

// Traceroute endpoint
router.get('/traceroute/:target', (req, res) => {
  const { target } = req.params;

  if (!isValidTarget(target)) {
    return respond.badRequest(res, 'Invalid target: only hostname/IP characters are allowed');
  }

  // execFile is used (not exec) so no shell is spawned — no injection risk
  execFile('traceroute', ['-n', '-m', '20', '-w', '2', target], { timeout: 60000 }, (error, stdout, stderr) => {
    const raw = stdout || '';
    const hops = parseTracerouteOutput(raw);

    if (hops.length === 0 && error) {
      return res.status(500).json({
        error: error.message || 'traceroute failed',
        target
      });
    }

    res.json({ target, hops, raw });
  });
});

module.exports = {
  name: 'ping',
  description: 'Ping and health check endpoints',
  version: '1.0.0',
  routes: router,
  mountPath: '/'
};
